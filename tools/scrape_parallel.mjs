/**
 * scrape_parallel.mjs
 * Splits the full ID range across N worker threads, each running independently.
 *
 * Usage:
 *   node scrape_parallel.mjs [start_id] [end_id] [threads] [batch_size] [--force]
 *
 * Examples:
 *   node scrape_parallel.mjs                        # 1-25000, 4 threads, batch 8
 *   node scrape_parallel.mjs 12959 25000            # resume from 12959
 *   node scrape_parallel.mjs 1 25000 4 5 --force   # re-scrape everything
 */

import fs from 'fs';
import path from 'path';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { setTimeout as sleep } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const OUTPUT_DIR = path.resolve('.tmp', 'raw', 'trains_by_id');

// ─── Scraping logic (runs in worker threads) ────────────────────────────────

async function scrapeTrainPage(id, force = false) {
    const targetUrl = `https://indiarailinfo.com/train/${id}`;
    const outPath = path.join(OUTPUT_DIR, `${id}.json`);

    if (!force && fs.existsSync(outPath)) return { skipped: true };

    try {
        const res = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: AbortSignal.timeout(15000)
        });

        if (!res.ok) {
            if (res.status === 404 || res.status === 410) {
                fs.writeFileSync(outPath, JSON.stringify({ internal_id: id, exists: false, error: `HTTP ${res.status}` }));
                return { exists: false };
            }
            return { error: `HTTP ${res.status}` };
        }

        const html = await res.text();
        const $ = cheerio.load(html);
        const h1 = $('h1').text().replace(/\s+/g, ' ').trim() || $('title').text().replace(/\s+/g, ' ').trim();

        if (h1.toLowerCase().includes('page not found') || html.includes('Data not available')) {
            fs.writeFileSync(outPath, JSON.stringify({ internal_id: id, exists: false }));
            return { exists: false };
        }

        const isImaginary = h1.toLowerCase().includes('imaginary') || h1.toLowerCase().includes('[img]');
        const scheduleContainer = $('.newschtable.newbg.inline');

        if (scheduleContainer.length === 0) {
            fs.writeFileSync(outPath, JSON.stringify({ internal_id: id, exists: true, error: 'no_schedule_table', title: h1 }));
            return { exists: true, error: true };
        }

        const numMatch = h1.match(/\b(\d{3,6})\b/);
        const trainData = {
            internal_id: id,
            exists: true,
            title: h1,
            train_number: numMatch ? numMatch[1] : 'unknown',
            is_imaginary: isImaginary,
            source_url: targetUrl,
            resolved_url: res.url,
            rake_sharing: '',
            bedroll_available: $('div:contains("Bedroll/Linen")').last().text().match(/Included|Available|Yes/i) !== null,
            pantry_menu: null,
            first_run_date: null,
            max_speed: null,
            rake_composition: [],
            stops: []
        };

        const pantryText = $('div:contains("Pantry/Catering")').last().text().replace(/\s+/g, ' ');
        if (pantryText.includes('Pantry/Catering')) {
            trainData.pantry_menu = pantryText.substring(pantryText.indexOf('Pantry/Catering') + 15).trim();
        }

        const runText = $('div:contains("Inaugural Run"), div:contains("First Run")').last().text().replace(/\s+/g, ' ');
        const runMatch = runText.match(/(?:Inaugural|First) Run:?\s*([\s\S]+)/i);
        if (runMatch?.[1]?.trim()) trainData.first_run_date = runMatch[1].trim();

        const speedText = $('div:contains("Max Permissible Speed")').last().text().replace(/\s+/g, ' ');
        const speedMatch = speedText.match(/Max Permissible Speed[:\s]*([\s\S]+)/i);
        if (speedMatch?.[1]?.trim() && speedMatch[1].trim().toLowerCase() !== 'n/a') {
            trainData.max_speed = speedMatch[1].trim();
        }

        const rsaContainer = $('.ltGreenColor:contains("RSA")').first();
        if (rsaContainer.length > 0) {
            trainData.rake_sharing = rsaContainer.text().replace(/RSA\s*(-\s*Rake Sharing)?/i, '').trim();
        }

        $('.rake > div').each((_, el) => {
            const seqDiv = $(el).find('.seq');
            const numDiv = $(el).find('.num');
            if (seqDiv.length && numDiv.length) {
                trainData.rake_composition.push({
                    sequence: seqDiv.text().trim(),
                    type: $(el).attr('class').replace('rake', '').trim(),
                    coach: numDiv.text().trim()
                });
            }
        });

        let stopSequence = 1;
        scheduleContainer.children('div').each((_, element) => {
            const rowDivs = $(element).children('div');
            const colTexts = Object.values(rowDivs)
                .filter(el => el.type === 'tag')
                .map(el => $(el).text().trim().replace(/\s+/g, ' '));

            const rowStr = colTexts.join(' ');
            if (rowStr.toLowerCase().includes('intermediate stations')) {
                const m = rowStr.match(/(\d+)\s+intermediate stations/i);
                if (m && trainData.stops.length > 0) {
                    trainData.stops[trainData.stops.length - 1].intermediate_stations = parseInt(m[1], 10);
                }
                return;
            }

            if (rowDivs.length < 8) return;
            const first = colTexts[0];
            if (first === '#' || first === '' || first.includes('halts.')) return;

            let crossingInfo = '';
            if (rowDivs.length >= 5) {
                const xTitle = $(rowDivs[4]).attr('title');
                if (xTitle && (xTitle.includes('Xing with') || xTitle.includes('Overtaken') || xTitle.includes('Overtakes'))) {
                    const x$ = cheerio.load(xTitle);
                    crossingInfo = x$('span').map((_, el) => x$(el).text().trim()).get().join(', ');
                }
            }

            if (colTexts.length >= 8) {
                const col = (i) => colTexts[i] ?? '';
                trainData.stops.push({
                    sequence: stopSequence++,
                    code: col(2), name: col(3),
                    arrives: col(6), departs: col(8),
                    halt: col(10), pf: col(11),
                    day: col(12), km: col(13),
                    speed: col(14), elev: col(15), zone: col(16),
                    xing: crossingInfo, intermediate_stations: 0
                });
            }
        });

        fs.writeFileSync(outPath, JSON.stringify(trainData, null, 2));
        return { exists: true, title: h1 };

    } catch (err) {
        if (err.name === 'TimeoutError' || err.message?.includes('fetch')) return { timeout: true };
        return { error: err.message };
    }
}

async function runWorker({ startId, endId, workerId, batchSize, force }) {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    let saved = 0, skipped = 0, failed = 0, notExists = 0;

    const report = (msg) => parentPort.postMessage({ workerId, type: 'log', msg });
    const progress = () => parentPort.postMessage({ workerId, type: 'progress', saved, skipped, failed, notExists });

    report(`Starting IDs ${startId}–${endId}`);

    for (let cur = startId; cur <= endId; cur += batchSize) {
        const batch = [];
        for (let i = 0; i < batchSize && cur + i <= endId; i++) batch.push(cur + i);

        await Promise.all(batch.map(async (id) => {
            let result = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                result = await scrapeTrainPage(id, force);
                if (!result.timeout && !result.error?.startsWith('HTTP')) break;
                await sleep(2000 * attempt);
            }

            if (result.skipped)         skipped++;
            else if (result.exists === false) notExists++;
            else if (result.exists === true)  saved++;
            else                              failed++;
        }));

        progress();
        await sleep(1000); // politeness delay between batches
    }

    parentPort.postMessage({ workerId, type: 'done', saved, skipped, failed, notExists });
}

// ─── Worker thread entry point ───────────────────────────────────────────────

if (!isMainThread) {
    runWorker(workerData).catch(err => {
        parentPort.postMessage({ workerId: workerData.workerId, type: 'error', msg: err.message });
    });
}

// ─── Main thread ─────────────────────────────────────────────────────────────

if (isMainThread) {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    const cleanArgs = args.filter(a => a !== '--force');

    const startId   = parseInt(cleanArgs[0] ?? '1',     10);
    const endId     = parseInt(cleanArgs[1] ?? '25000', 10);
    const threads   = parseInt(cleanArgs[2] ?? '4',     10);
    const batchSize = parseInt(cleanArgs[3] ?? '8',     10);

    const total = endId - startId + 1;
    const chunkSize = Math.ceil(total / threads);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  OneRail Parallel Train Scraper`);
    console.log(`  IDs: ${startId}–${endId} (${total} total)`);
    console.log(`  Threads: ${threads} | Batch/thread: ${batchSize} | Force: ${force}`);
    console.log(`${'═'.repeat(60)}\n`);

    const workers = [];
    const stats = {};

    for (let t = 0; t < threads; t++) {
        const wStart = startId + t * chunkSize;
        const wEnd   = Math.min(wStart + chunkSize - 1, endId);
        if (wStart > endId) break;

        stats[t] = { saved: 0, skipped: 0, failed: 0, notExists: 0 };

        const worker = new Worker(__filename, {
            workerData: { startId: wStart, endId: wEnd, workerId: t, batchSize, force }
        });

        worker.on('message', ({ workerId, type, msg, saved, skipped, failed, notExists }) => {
            if (type === 'log') {
                console.log(`  [Worker ${workerId}] ${msg}`);
            } else if (type === 'progress' || type === 'done') {
                stats[workerId] = { saved, skipped, failed, notExists };

                const totSaved   = Object.values(stats).reduce((s, w) => s + w.saved,     0);
                const totSkipped = Object.values(stats).reduce((s, w) => s + w.skipped,   0);
                const totFailed  = Object.values(stats).reduce((s, w) => s + w.failed,    0);
                const totNoExist = Object.values(stats).reduce((s, w) => s + w.notExists, 0);
                const done = totSaved + totSkipped + totFailed + totNoExist;
                const pct = ((done / total) * 100).toFixed(1);

                process.stdout.write(
                    `\r  Progress: ${pct}% | ✅ ${totSaved} saved | ⏩ ${totSkipped} skipped | ❌ ${totFailed} failed | 🚫 ${totNoExist} not found   `
                );

                if (type === 'done') console.log(`\n  [Worker ${workerId}] Finished.`);
            }
        });

        worker.on('error', (err) => console.error(`\n  [Worker ${t}] Error: ${err.message}`));
        workers.push(new Promise(resolve => worker.on('exit', resolve)));
    }

    await Promise.all(workers);

    const totSaved   = Object.values(stats).reduce((s, w) => s + w.saved,     0);
    const totSkipped = Object.values(stats).reduce((s, w) => s + w.skipped,   0);
    const totFailed  = Object.values(stats).reduce((s, w) => s + w.failed,    0);
    const totNoExist = Object.values(stats).reduce((s, w) => s + w.notExists, 0);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ✅ All workers done!`);
    console.log(`  Saved:     ${totSaved}`);
    console.log(`  Skipped:   ${totSkipped}`);
    console.log(`  Not found: ${totNoExist}`);
    console.log(`  Failed:    ${totFailed}`);
    console.log(`${'═'.repeat(60)}\n`);
}

import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { setTimeout } from 'timers/promises';

const TMP_DIR = path.resolve('.tmp');
const OUTPUT_DIR = path.join(TMP_DIR, 'raw', 'trains_by_id');
const MISSING_FILE = path.resolve('missing_ids.txt');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Reuse the core scraping logic from scrape_all_trains.mjs
async function scrapeTrainPage(id) {
    const targetUrl = `https://indiarailinfo.com/train/${id}`;
    const outPath = path.join(OUTPUT_DIR, `${id}.json`);

    // In 'missing list' mode, we might want to OVERWRITE if the file was a previous failure
    // but for now, we only get here if audit_ids identified it as missing or transient error.

    console.log(`\n🔗 [RESCUE] Fetching ID ${id} -> ${targetUrl}`);

    try {
        const fetchResponse = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: AbortSignal.timeout(15000)
        });

        if (!fetchResponse.ok) {
            console.log(`❌ Failed to fetch ID ${id}. HTTP status: ${fetchResponse.status}`);
            if (fetchResponse.status === 404 || fetchResponse.status === 410) {
                fs.writeFileSync(outPath, JSON.stringify({ internal_id: id, exists: false, error: `HTTP ${fetchResponse.status}` }), 'utf-8');
                return true;
            }
            return false;
        }

        const htmlContent = await fetchResponse.text();
        const $ = cheerio.load(htmlContent);
        const h1Text = $('h1').text().replace(/\s+/g, ' ').trim() || $('title').text().replace(/\s+/g, ' ').trim();

        if (h1Text.toLowerCase().includes('page not found') || htmlContent.includes('Data not available')) {
            fs.writeFileSync(outPath, JSON.stringify({ internal_id: id, exists: false }), 'utf-8');
            return true;
        }

        const scheduleContainer = $('.newschtable.newbg.inline');
        if (scheduleContainer.length === 0) {
            fs.writeFileSync(outPath, JSON.stringify({ internal_id: id, exists: true, error: 'no_schedule_table', title: h1Text }), 'utf-8');
            return true;
        }

        const allRows = scheduleContainer.children('div');
        let trainNumber = "unknown";
        const numMatch = h1Text.match(/\b(\d{3,6})\b/);
        if (numMatch) trainNumber = numMatch[1];

        const trainData = {
            internal_id: id,
            exists: true,
            title: h1Text,
            train_number: trainNumber,
            is_imaginary: h1Text.toLowerCase().includes('imaginary') || h1Text.toLowerCase().includes('[img]'),
            source_url: targetUrl,
            stops: []
        };

        // Simplified stop extraction for rescue script
        let stopSequence = 1;
        allRows.each((i, el) => {
            const divs = $(el).children('div');
            if (divs.length >= 8) {
                const colTexts = divs.map((i, e) => $(e).text().trim()).get();
                if (colTexts[0] !== '#' && colTexts[0] !== '') {
                    trainData.stops.push({
                        sequence: stopSequence++,
                        code: colTexts[2],
                        name: colTexts[3],
                        arrives: colTexts[6],
                        departs: colTexts[8],
                        km: colTexts[13]
                    });
                }
            }
        });

        fs.writeFileSync(outPath, JSON.stringify(trainData, null, 2), 'utf-8');
        console.log(`💾 Saved ${h1Text}`);
        return true;

    } catch (error) {
        console.error(`⏳ Failed ID-${id}: ${error.message}`);
        return false;
    }
}

async function runRescue() {
    if (!fs.existsSync(MISSING_FILE)) {
        console.error(`Missing list not found: ${MISSING_FILE}. Run tools/audit_ids.mjs first.`);
        return;
    }

    const idList = fs.readFileSync(MISSING_FILE, 'utf-8')
        .split('\n')
        .map(l => parseInt(l.trim(), 10))
        .filter(n => !isNaN(n));

    console.log(`🚀 Starting Rescue for ${idList.length} IDs...`);

    let batchSize = 10;
    for (let i = 0; i < idList.length; i += batchSize) {
        const batch = idList.slice(i, i + batchSize);
        console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1} / ${Math.ceil(idList.length / batchSize)}`);

        await Promise.all(batch.map(async (id) => {
            let success = false;
            let retries = 0;
            while (!success && retries < 2) {
                success = await scrapeTrainPage(id);
                if (!success) {
                    retries++;
                    await setTimeout(3000 * retries);
                }
            }
        }));

        await setTimeout(2000); // Politeness delay
    }
    console.log('\n🎉 Rescue operation complete.');
}

runRescue().catch(console.error);

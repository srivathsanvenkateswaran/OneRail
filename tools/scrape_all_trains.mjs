import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { setTimeout } from 'timers/promises';


const TMP_DIR = path.resolve('.tmp');
const OUTPUT_DIR = path.join(TMP_DIR, 'raw', 'trains_by_id');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Function to scrape a single ID
async function scrapeTrainPage(id, force = false) {
    const targetUrl = `https://indiarailinfo.com/train/${id}`;
    const outPath = path.join(OUTPUT_DIR, `${id}.json`);

    // Check if we already scraped this ID via file system
    if (!force && fs.existsSync(outPath)) {
        console.log(`⏩ Skipping ID ${id} (Already exists)`);
        return true;
    }

    console.log(`\n🔗 Fetching ID ${id} -> ${targetUrl}`);

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

        const resolvedUrl = fetchResponse.url;
        const htmlContent = await fetchResponse.text();
        const $ = cheerio.load(htmlContent);

        // Extract metadata
        const h1Text = $('h1').text().replace(/\s+/g, ' ').trim() || $('title').text().replace(/\s+/g, ' ').trim();

        // IndiaRailInfo shows "Page Not Found" or redirects to index etc.
        if (h1Text.toLowerCase().includes('page not found') || htmlContent.includes('Data not available')) {
            console.log(`⚠️ ID ${id} has no valid train data (Page Not Found).`);
            fs.writeFileSync(outPath, JSON.stringify({ internal_id: id, exists: false }), 'utf-8');
            return true;
        }

        // Check if Imaginary based on title
        const isImaginary = h1Text.toLowerCase().includes('imaginary') || h1Text.toLowerCase().includes('[img]');

        // Use standard schedule container class from IndiaRailInfo
        const scheduleContainer = $('.newschtable.newbg.inline');

        if (scheduleContainer.length === 0) {
            console.log(`❌ ID ${id} (${h1Text}): Could not identify the schedule table.`);
            fs.writeFileSync(outPath, JSON.stringify({ internal_id: id, exists: true, error: 'no_schedule_table', title: h1Text }), 'utf-8');
            return true;
        }

        const allRows = scheduleContainer.children('div');

        // Extract a train number from the URL or Title
        let trainNumber = "unknown";
        const numMatch = h1Text.match(/\b(\d{3,6})\b/);
        if (numMatch) {
            trainNumber = numMatch[1];
        }

        const trainData = {
            internal_id: id,
            exists: true,
            title: h1Text,
            train_number: trainNumber,
            is_imaginary: isImaginary,
            source_url: targetUrl,
            resolved_url: resolvedUrl,
            rake_sharing: '',
            bedroll_available: false,
            pantry_menu: null,
            first_run_date: null,
            max_speed: null,
            rake_composition: [],
            stops: []
        };

        // Extract Additional Details safely using specific divs
        trainData.bedroll_available = $('div:contains("Bedroll/Linen")').last().text().match(/Included|Available|Yes/i) !== null;

        const pantryDivText = $('div:contains("Pantry/Catering")').last().text().replace(/\s+/g, ' ');
        if (pantryDivText.includes('Pantry/Catering')) {
            trainData.pantry_menu = pantryDivText.substring(pantryDivText.indexOf('Pantry/Catering') + 15).trim();
        }

        const runDivText = $('div:contains("Inaugural Run"), div:contains("First Run")').last().text().replace(/\s+/g, ' ');
        const runMatch = runDivText.match(/(?:Inaugural|First) Run:?\s*([\s\S]+)/i);
        if (runMatch && runMatch[1].trim()) {
            trainData.first_run_date = runMatch[1].trim();
        }

        const maxSpeedDivText = $('div:contains("Max Permissible Speed")').last().text().replace(/\s+/g, ' ');
        const speedMatch = maxSpeedDivText.match(/Max Permissible Speed[:\s]*([\s\S]+)/i);
        if (speedMatch && speedMatch[1].trim() && speedMatch[1].trim().toLowerCase() !== 'n/a') {
            trainData.max_speed = speedMatch[1].trim();
        }

        // Extract Rake Sharing
        const rsaContainer = $('.ltGreenColor:contains("RSA")').first();
        if (rsaContainer.length > 0) {
            trainData.rake_sharing = rsaContainer.text().replace(/RSA\s*(-\s*Rake Sharing)?/i, '').trim();
        }

        // Extract Rake Composition
        $('.rake > div').each((i, el) => {
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

        // Parse the rows
        let stopSequence = 1;

        allRows.each((index, element) => {
            const rowDivs = $(element).children('div');

            // Map text content
            const colTexts = Object.values(rowDivs).map(el => {
                if (el.type === 'tag') {
                    return $(el).text().trim().replace(/\s+/g, ' ');
                }
                return null;
            }).filter(t => t !== null && t !== undefined);

            const rowStr = colTexts.join(' ');

            // Intermed Stations parsing
            if (rowStr.toLowerCase().includes('intermediate stations')) {
                const match = rowStr.match(/(\d+)\s+intermediate stations/i);
                if (match && trainData.stops.length > 0) {
                    trainData.stops[trainData.stops.length - 1].intermediate_stations = parseInt(match[1], 10);
                }
                return;
            }

            // Skip header/summary rows which typically have very few column divs
            if (rowDivs.length < 8) return;

            const firstColText = colTexts[0];
            if (firstColText === '#' || firstColText === '' || firstColText.includes('halts.')) return;

            // Extract crossing details
            let crossingInfo = '';
            if (rowDivs.length >= 5) {
                const xTitle = $(rowDivs[4]).attr('title');
                if (xTitle && (xTitle.includes('Xing with') || xTitle.includes('Overtaken') || xTitle.includes('Overtakes'))) {
                    const x$ = cheerio.load(xTitle);
                    crossingInfo = x$('span').map((i, el) => x$(el).text().trim()).get().join(', ');
                }
            }

            // Train Table mapping
            if (colTexts.length >= 8) {
                // Ensure array index bounds since empty cells might collapse
                const sanitizeCol = (idx) => colTexts.length > idx ? colTexts[idx] : "";

                trainData.stops.push({
                    sequence: stopSequence++,
                    code: sanitizeCol(2),
                    name: sanitizeCol(3),
                    arrives: sanitizeCol(6),
                    departs: sanitizeCol(8),
                    halt: sanitizeCol(10),
                    pf: sanitizeCol(11),
                    day: sanitizeCol(12),
                    km: sanitizeCol(13),
                    speed: sanitizeCol(14),
                    elev: sanitizeCol(15),
                    zone: sanitizeCol(16),
                    xing: crossingInfo,
                    intermediate_stations: 0
                });
            }
        });

        fs.writeFileSync(outPath, JSON.stringify(trainData, null, 2), 'utf-8');
        console.log(outPath)
        console.log(`💾 Saved ${isImaginary ? '[IMAGINARY] ' : ''}${h1Text}`);
        return true;

    } catch (error) {
        if (error.name === 'TimeoutError' || (error.message && error.message.includes('fetch'))) {
            console.error(`⏳ Timeout/Network Error on ID-${id}: ${error.message}`);
            return false;
        }
        console.error(`💥 Unexpected Error on ID-${id}:`, error);
        return false;
    }
}

async function runScraper() {
    let startId = 1;
    let endId = 25000;
    let batchSize = 10;
    let force = false;

    const args = process.argv.slice(2);
    // Parse force flag anywhere
    if (args.includes('--force')) {
        force = true;
        args.splice(args.indexOf('--force'), 1);
    }

    if (args.length >= 1) startId = parseInt(args[0], 10);
    if (args.length >= 2) endId = parseInt(args[1], 10);
    if (args.length >= 3) batchSize = parseInt(args[2], 10);

    console.log(`🚀 Starting enumeration from ID ${startId} to ${endId} with concurrency ${batchSize} ${force ? '[FORCE]' : ''}`);

    for (let currentId = startId; currentId <= endId; currentId += batchSize) {
        const batch = [];
        for (let i = 0; i < batchSize && (currentId + i) <= endId; i++) {
            batch.push(currentId + i);
        }

        const promises = batch.map(async (id) => {
            let success = false;
            let retries = 0;

            while (!success && retries < 3) {
                success = await scrapeTrainPage(id, force);
                if (!success) {
                    retries++;
                    console.log(`🔄 Retrying ID ${id} (Attempt ${retries}/3) after delay...`);
                    await setTimeout(2000 * retries);
                }
            }

            if (!success) {
                console.log(`🚨 Skipping ID ${id} after 3 failed attempts.`);
            }
        });

        await Promise.all(promises);

        // Politeness Delay between batches
        await setTimeout(1000);
    }
    console.log('🎉 Done compiling train data.');
}

runScraper();

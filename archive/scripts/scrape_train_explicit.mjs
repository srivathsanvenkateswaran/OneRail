import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const TMP_DIR = path.resolve('..', '.tmp');
const OUTPUT_DIR = path.join(TMP_DIR, 'raw', 'trains');

// Ensure output directories exist
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function scrapeTrainPage(url) {
    console.log(`🔗 Fetching URL: ${url}`);

    try {
        const fetchResponse = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });

        if (!fetchResponse.ok) {
            console.log(`❌ Failed to fetch page. HTTP status: ${fetchResponse.status}`);
            return;
        }

        const htmlContent = await fetchResponse.text();
        const $ = cheerio.load(htmlContent);

        // Extract metadata
        const h1Text = $('h1').text().trim() || $('title').text().trim();
        console.log(`\n==================================================`);
        console.log(`🚂 PAGE TITLE: ${h1Text}`);
        console.log(`==================================================`);

        // IndiaRailInfo uses div.newschtable for the schedule table
        const scheduleContainer = $('.newschtable.newbg.inline');

        if (scheduleContainer.length === 0) {
            console.log(`❌ Could not identify the schedule table (div.newschtable) in the HTML.`);
            return;
        }

        // The container has multiple child divs, each representing a row.
        const allRows = scheduleContainer.children('div');
        console.log(`Found Schedule container with ${allRows.length} abstract rows.`);

        const trainData = {
            title: h1Text,
            source_url: url,
            rake_sharing: '',
            rake_composition: [],
            stops: []
        };

        // Extract Rake Sharing
        const rsaContainer = $('.ltGreenColor:contains("RSA - Rake Sharing")').first();
        if (rsaContainer.length > 0) {
            trainData.rake_sharing = rsaContainer.text().replace('RSA - Rake Sharing', '').trim();
        }

        // Extract Rake Composition
        $('.rake > div').each((i, el) => {
            const seqDiv = $(el).find('.seq');
            const numDiv = $(el).find('.num');
            if (seqDiv.length && numDiv.length) {
                trainData.rake_composition.push({
                    sequence: seqDiv.text().trim(),
                    type: $(el).attr('class').trim(),
                    coach: numDiv.text().trim()
                });
            }
        });

        // Parse the rows
        let stopSequence = 1;

        allRows.each((index, element) => {
            // A data row should have quite a few column divs (usually ~18)
            const rowDivs = $(element).children('div');

            // Map the child div elements to their inner text
            const colTexts = Object.values(rowDivs).map(el => {
                if (el.type === 'tag') {
                    return $(el).text().trim().replace(/\s+/g, ' ');
                }
                return null;
            }).filter(t => t !== null && t !== undefined);

            const rowStr = colTexts.join(' ');

            // Check if it's an intermediate stations row
            if (rowStr.includes('intermediate stations')) {
                const match = rowStr.match(/(\d+)\s+intermediate stations/i);
                if (match && trainData.stops.length > 0) {
                    trainData.stops[trainData.stops.length - 1].intermediate_stations = parseInt(match[1], 10);
                }
                return; // Skip further processing for this row
            }

            // Skip header/summary rows which typically have very few column divs
            if (rowDivs.length < 8) return;

            // Optional: Skip the header row if the first column is '#'
            const firstColText = $(rowDivs[0]).text().trim();
            if (firstColText === '#' || firstColText === '' || firstColText.includes('halts.')) return;

            // Extract crossing details
            let crossingInfo = '';
            // It's typically the 5th column <div> which has the title attribute with Xing info
            if (rowDivs.length >= 5) {
                const xTitle = $(rowDivs[4]).attr('title');
                if (xTitle && xTitle.includes('Xing with')) {
                    // It contains HTML like: | <span class="purpleColor">Xing with 16058/Sapthagiri Express | Daily</span><br />
                    // We can feed it to cheerio again to get clean text
                    const x$ = cheerio.load(xTitle);
                    // Join multiple Xings by commas if there is more than one
                    crossingInfo = x$('span').map((i, el) => x$(el).text().trim()).get().join(', ');
                }
            }

            // IndiaRailInfo typical structure for timetable row:
            // [Sequence, Track, Station Code, Station Name, Xing, Note, Arrives, Avg, Departs, Avg, Halt, PF, Day, Km, Speed, Elev, Zone, Address]
            if (colTexts.length >= 8) {
                trainData.stops.push({
                    sequence: stopSequence++,
                    code: colTexts[2],
                    name: colTexts[3],
                    arrives: colTexts[6],
                    departs: colTexts[8],
                    halt: colTexts[10],
                    pf: colTexts[11],
                    day: colTexts[12],
                    km: colTexts[13],
                    speed: colTexts[14],
                    elev: colTexts[15],
                    zone: colTexts[16],
                    xing: crossingInfo,
                    intermediate_stations: 0 // Will be updated by the next intermediate stations row
                });
            }
        });

        // Try to extract a train number from the URL or Title
        let trainNumber = "unknown";
        const numMatch = h1Text.match(/\b(\d{5})\b/);
        if (numMatch) {
            trainNumber = numMatch[1];
        }

        const outPath = path.join(OUTPUT_DIR, `train_${trainNumber}.json`);
        fs.writeFileSync(outPath, JSON.stringify(trainData, null, 2), 'utf-8');

        console.log(`\n💾 Saved structured data to ${outPath}`);

        // Print first 3 stops as a preview
        console.log("\nPreview of first 3 stops:");
        trainData.stops.slice(0, 3).forEach(s => console.log(`Stop ${s.sequence}: ${s.name} (${s.code}) Arr: ${s.arrives} Dep: ${s.departs} Day: ${s.day} Km: ${s.km} [Xing: ${s.xing}]`));

    } catch (error) {
        console.error('An error occurred:', error);
    }
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node scrape_train_explicit.mjs <url>');
    process.exit(1);
}

const url = args[0];
scrapeTrainPage(url);

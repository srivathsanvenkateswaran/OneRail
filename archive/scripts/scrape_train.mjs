import fs from 'fs';
import path from 'path';
import google from 'googlethis';
import * as cheerio from 'cheerio';

const TMP_DIR = path.resolve('.tmp');
const HTML_DIR = path.join(TMP_DIR, 'raw', 'html');

// Ensure output directories exist
if (!fs.existsSync(HTML_DIR)) {
    fs.mkdirSync(HTML_DIR, { recursive: true });
}

async function fetchAndParseTrain(trainNumber) {
    console.log(`🔍 Searching Google for train ${trainNumber}...`);

    const options = {
        page: 0,
        safe: false, // Safe Search
        additional_params: {
            hl: 'en'
        }
    };

    try {
        const response = await google.search(`${trainNumber} site:indiarailinfo.com/train/`, options);

        // Find the first matching URL
        const resultUrl = response.results.map(r => r.url).find(url => url.includes('indiarailinfo.com/train/') && url.includes('-train-'));

        if (!resultUrl) {
            console.log(`❌ Could not find IndiaRailInfo URL for train ${trainNumber}.`);
            return;
        }

        console.log(`🔗 Found URL: ${resultUrl}`);
        console.log(`📡 Fetching HTML content...`);

        const fetchResponse = await fetch(resultUrl, {
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

        // Save to cache
        const htmlPath = path.join(HTML_DIR, `train_${trainNumber}.html`);
        fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
        console.log(`💾 Saved HTML to ${htmlPath}`);

        // Parse with Cheerio
        const $ = cheerio.load(htmlContent);
        const trainTitle = $('h1').text().trim();
        console.log(`\n==================================================`);
        console.log(`🚂 TRAIN: ${trainTitle}`);
        console.log(`==================================================`);

        // Find the schedule table
        let scheduleTable = null;
        $('table').each((index, element) => {
            const text = $(element).text();
            if (text.includes('Station Name') || text.includes('Arr') || text.includes('Dep')) {
                // Double check it has <th>s
                if ($(element).find('th').length > 0) {
                    scheduleTable = $(element);
                    return false; // break out of .each()
                }
            }
        });

        if (!scheduleTable) {
            console.log(`❌ Could not identify the schedule table in the HTML.`);
            return;
        }

        const rows = scheduleTable.find('tr');
        console.log(`Found Schedule table with ${rows.length - 1} rows.`);

        // Print the first few rows just to verify
        for (let i = 0; i < Math.min(6, rows.length); i++) {
            const row = $(rows[i]);
            const cols = row.find('td, th').map((_, el) => $(el).text().trim()).get().filter(t => t);
            if (cols.length > 0) {
                console.log(`[${i}] ${JSON.stringify(cols)}`);
            }
        }

    } catch (error) {
        console.error('An error occurred:', error);
    }
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node scrape_train.mjs <train_number>');
    process.exit(1);
}

const trainNum = args[0];
fetchAndParseTrain(trainNum);

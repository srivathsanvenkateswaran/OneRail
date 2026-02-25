import fs from 'fs';
import path from 'path';
const RAW_DIR = path.resolve('.tmp/raw/trains_by_id');
const OUTPUT_FILE = path.resolve('missing_ids.txt');

/**
 * Audit script to find gaps in our Bronze data
 */
async function runAudit() {
    let startId = 1;
    let endId = 5000; // User current limit

    const args = process.argv.slice(2);
    if (args.length >= 1) startId = parseInt(args[0], 10);
    if (args.length >= 2) endId = parseInt(args[1], 10);

    console.log(`🔎 Auditing IDs from ${startId} to ${endId}...`);

    if (!fs.existsSync(RAW_DIR)) {
        console.error(`Directory not found: ${RAW_DIR}`);
        return;
    }

    const presentFiles = new Set(fs.readdirSync(RAW_DIR));
    const missing = [];
    const transientErrors = [];
    let completedCount = 0;
    let confirmedEmptyCount = 0;

    for (let id = startId; id <= endId; id++) {
        const filename = `${id}.json`;

        if (!presentFiles.has(filename)) {
            missing.push(id);
            continue;
        }

        // If file exists, check if it's a "Failed" scrape vs a "Confirmed empty"
        try {
            const data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, filename), 'utf-8'));

            if (data.exists === false) {
                // If it's a 404, we don't need to retry. 
                // If it's anything else (or undefined error), we might want to group it.
                if (data.error && data.error.includes('503')) {
                    transientErrors.push(id);
                } else {
                    confirmedEmptyCount++;
                }
            } else {
                completedCount++;
            }
        } catch (e) {
            // Corrupt file
            transientErrors.push(id);
        }
    }

    const retryList = [...missing, ...transientErrors].sort((a, b) => a - b);

    // Save to missing_ids.txt
    const outputContent = retryList.join('\n');
    fs.writeFileSync(OUTPUT_FILE, outputContent, 'utf-8');

    console.log(`\n✅ Audit Complete:`);
    console.log(`- Total Checked:     ${endId - startId + 1}`);
    console.log(`- Scraped & Valid:   ${completedCount}`);
    console.log(`- Confirmed Empty:   ${confirmedEmptyCount} (404s/Imaginary)`);
    console.log(`- Missing/Failed:    ${retryList.length} 🚨`);
    console.log(`\n💾 Retry list saved to: ${path.resolve(OUTPUT_FILE)}`);
}

runAudit().catch(console.error);

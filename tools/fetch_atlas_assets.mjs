import fs from 'fs';

async function fetchAsset(url, filename) {
    console.log(`Fetching ${url}...`);
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36'
            }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        fs.writeFileSync(filename, text, 'utf-8');
        console.log(`Saved to ${filename} (${text.length} bytes)`);
    } catch (e) {
        console.error(`Failed to fetch ${url}: ${e.message}`);
    }
}

async function main() {
    fs.mkdirSync('.tmp', { recursive: true });
    await fetchAsset('https://indiarailinfo.com/kjfdsuiemjvcyc/abcdmap3.1689.js', '.tmp/abcdmap3.js');
}

main().catch(console.error);

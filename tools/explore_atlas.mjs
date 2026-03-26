import fs from 'fs';
import path from 'path';

async function fetchAtlas() {
    console.log("Fetching Atlas home...");
    const res = await fetch('https://indiarailinfo.com/atlas', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36'
        }
    });
    const html = await res.text();
    fs.mkdirSync('.tmp', { recursive: true });
    fs.writeFileSync('.tmp/atlas.html', html, 'utf-8');
    console.log(`Saved Atlas HTML: ${html.length} bytes`);
}
fetchAtlas().catch(console.error);

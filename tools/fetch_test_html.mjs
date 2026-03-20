import fs from 'fs';
import * as cheerio from 'cheerio';

async function run() {
    console.log("Fetching 1611 HTML...");
    const res = await fetch('https://indiarailinfo.com/train/1611');
    const html = await res.text();
    fs.writeFileSync('.tmp/raw/1611.html', html);

    // Also fetch 851 for Janta Express
    const res2 = await fetch('https://indiarailinfo.com/train/851');
    const html2 = await res2.text();
    fs.writeFileSync('.tmp/raw/851.html', html2);

    console.log("Done fetching HTML.");
}
run();

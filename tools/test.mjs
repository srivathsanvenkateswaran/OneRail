import * as cheerio from 'cheerio';

async function test() {
    const res = await fetch('https://indiarailinfo.com/train/12941', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    console.log("--- Extracting Specifics ---");
    // Look for Bedroll, Pantry, Menu, First Run, Speed
    $('div, span').each((i, el) => {
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        const tLower = t.toLowerCase();
        if (tLower.includes('bedroll') ||
            tLower.includes('pantry') ||
            tLower.includes('menu') ||
            (tLower.includes('first run') && !tLower.includes('update')) ||
            tLower.includes('max permissible speed') ||
            tLower.includes('km/hr')) {
            console.log(t.substring(0, 100));
        }
    });
}

test();

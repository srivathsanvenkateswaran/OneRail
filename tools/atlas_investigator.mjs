import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
    console.log("Launching headless browser...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 800 });

    page.on('response', async (response) => {
        const url = response.url();
        const type = response.request().resourceType();

        if (type === 'xhr' || type === 'fetch' || url.includes('.json') || url.includes('ajax')) {
            console.log(`[NETWORK] ${type}: ${url}`);
            try {
                if (url.includes('indiarailinfo.com/atlas') || url.includes('ajax')) {
                    const text = await response.text();
                    console.log(`  -> Size: ${text.length} bytes`);
                    if (text.length > 500) {
                        const filename = `.tmp/atlas_resp_${Date.now()}.txt`;
                        fs.writeFileSync(filename, text.substring(0, 5000));
                        console.log(`  -> Saved sample to ${filename}`);
                    }
                }
            } catch (e) {
                // Ignore
            }
        }
    });

    console.log("Navigating to IndiaRailInfo Atlas...");
    await page.goto('https://indiarailinfo.com/atlas', { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait a bit to ensure async loading
    await new Promise(r => setTimeout(r, 5000));

    await browser.close();
    console.log("Done.");
})();

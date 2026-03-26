/**
 * scrape_india_osm.mjs
 *
 * Tiles all of India into 5°×5° bounding boxes and fetches all
 * railway=rail ways + their nodes from the Overpass API.
 *
 * Usage:
 *   node tools/scrape_india_osm.mjs
 *
 * Output: tools/.tmp/osm_rail_<bbox>.json  (one file per tile)
 *
 * Overpass is rate-limited; we use a 3s delay between tiles.
 * Partial progress is saved — already-downloaded tiles are skipped.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '.tmp', 'india_tiles');
fs.mkdirSync(OUT_DIR, { recursive: true });

// India bounding box: lat 6.5–37.5, lon 68–98
// Tiled into 4°×4° chunks (gives ~56 tiles — manageable)
const LAT_MIN = 6, LAT_MAX = 37, LON_MIN = 68, LON_MAX = 98;
const STEP = 4; // degrees per tile
const DELAY_MS = 4000; // 4s between requests
const TIMEOUT_S = 90;

function buildQuery(south, west, north, east) {
    return `[out:json][timeout:${TIMEOUT_S}];
(
  way["railway"="rail"](${south},${west},${north},${east});
  way["railway"="construction"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;`;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchTile(south, west, north, east, attempt = 1) {
    const bboxStr = `${south}_${west}_${north}_${east}`;
    const outFile = path.join(OUT_DIR, `osm_rail_${bboxStr}.json`);

    if (fs.existsSync(outFile)) {
        const size = fs.statSync(outFile).size;
        if (size > 100) {
            console.log(`  ✓ Skipping ${bboxStr} (already downloaded, ${(size/1024).toFixed(1)} KB)`);
            return true;
        }
    }

    const query = buildQuery(south, west, north, east);
    const url = 'https://overpass-api.de/api/interpreter';

    try {
        console.log(`  → Fetching tile ${bboxStr}...`);
        const res = await fetch(url, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: AbortSignal.timeout((TIMEOUT_S + 30) * 1000)
        });

        if (res.status === 429 || res.status === 504) {
            const wait = attempt * 30000;
            console.warn(`  ⚠️  Rate limited (${res.status}). Waiting ${wait/1000}s before retry ${attempt}...`);
            await sleep(wait);
            return fetchTile(south, west, north, east, attempt + 1);
        }

        if (!res.ok) {
            console.error(`  ✗ HTTP ${res.status} for ${bboxStr}`);
            return false;
        }

        const text = await res.text();

        // Quick sanity check
        if (!text.includes('"elements"')) {
            console.error(`  ✗ Unexpected response for ${bboxStr}: ${text.slice(0, 200)}`);
            return false;
        }

        const data = JSON.parse(text);
        const wayCount = data.elements.filter(e => e.type === 'way').length;
        const nodeCount = data.elements.filter(e => e.type === 'node').length;

        fs.writeFileSync(outFile, JSON.stringify(data));
        console.log(`  ✓ Saved ${bboxStr}: ${wayCount} ways, ${nodeCount} nodes → ${(fs.statSync(outFile).size / 1024).toFixed(1)} KB`);
        return true;

    } catch (err) {
        if (attempt <= 3) {
            const wait = attempt * 15000;
            console.warn(`  ⚠️  Error (${err.message}). Retrying in ${wait/1000}s...`);
            await sleep(wait);
            return fetchTile(south, west, north, east, attempt + 1);
        }
        console.error(`  ✗ FAILED ${bboxStr} after ${attempt} attempts: ${err.message}`);
        return false;
    }
}

async function main() {
    // Build tile list
    const tiles = [];
    for (let lat = LAT_MIN; lat < LAT_MAX; lat += STEP) {
        for (let lon = LON_MIN; lon < LON_MAX; lon += STEP) {
            tiles.push({
                south: lat,
                west: lon,
                north: Math.min(lat + STEP, LAT_MAX),
                east: Math.min(lon + STEP, LON_MAX)
            });
        }
    }

    console.log(`\n🚂 India OSM Railway Scraper`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Tiles: ${tiles.length} (${STEP}°×${STEP}° each)`);
    console.log(`Output: ${OUT_DIR}`);
    console.log(`Delay: ${DELAY_MS}ms between tiles\n`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < tiles.length; i++) {
        const { south, west, north, east } = tiles[i];
        console.log(`[${i + 1}/${tiles.length}] Tile (${south},${west}) → (${north},${east})`);
        const ok = await fetchTile(south, west, north, east);
        if (ok) success++; else failed++;

        if (i < tiles.length - 1) await sleep(DELAY_MS);
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Done! ${success} tiles downloaded, ${failed} failed.`);
    console.log(`📁 Files saved to: ${OUT_DIR}`);
    console.log(`\nNext step: run the merger + importer:`);
    console.log(`  node tools/merge_and_import_osm.mjs`);
}

main().catch(console.error);

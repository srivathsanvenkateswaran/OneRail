import fs from 'fs';

async function fetchOSMRailways(bbox) {
    const query = `
    [out:json][timeout:25];
    (
      way["railway"="rail"](${bbox});
      node["railway"="station"](${bbox});
    );
    out body;
    >;
    out skel qt;`;

    const url = 'https://overpass-api.de/api/interpreter';

    console.log(`Querying Overpass API for bbox: ${bbox}...`);
    try {
        const res = await fetch(url, {
            method: 'POST',
            body: query,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const filename = `.tmp/osm_railways_${bbox.replace(/,/g, '_')}.json`;
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        console.log(`Saved ${data.elements.length} elements to ${filename}`);
    } catch (e) {
        console.error(`Failed to fetch OSM data: ${e.message}`);
    }
}

// Bounding box for a part of Delhi
const delhiBBox = '28.5,77.1,28.7,77.3';

fetchOSMRailways(delhiBBox).catch(console.error);

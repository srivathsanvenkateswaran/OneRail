import fs from 'fs';
import path from 'path';

const BRONZE_DIR = path.resolve('.tmp/raw/trains_by_id');
const SILVER_DIR = path.resolve('.tmp/silver/trains');

// Ensure Silver directory exists
if (!fs.existsSync(SILVER_DIR)) {
    fs.mkdirSync(SILVER_DIR, { recursive: true });
}

/**
 * Normalizes time "HH:mm" to minutes from midnight
 */
function toMins(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [hh, mm] = timeStr.trim().split(':');
    const h = parseInt(hh, 10);
    const m = parseInt(mm, 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
}

/**
 * Extracts a clean train number and name from the title
 */
function parseTitle(title) {
    // Example: "12621/Tamil Nadu Express (PT)Other Names: TNतमिलनाडु एक्सप्रेस..."
    // We want "12621" and "Tamil Nadu Express"
    const match = title.match(/^(\d{3,6})\/([^\(]+)(?:\(([^)]+)\))?/);
    if (match) {
        return {
            number: match[1],
            name: match[2].trim(),
            suffix: match[3] ? match[3].trim() : ""
        };
    }
    return { number: null, name: title, suffix: "" };
}

function transform(file) {
    const rawPath = path.join(BRONZE_DIR, file);
    const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));

    if (!rawData.exists) return null;

    const { number, name, suffix } = parseTitle(rawData.title);

    const silverData = {
        id: rawData.internal_id,
        train_number: number || rawData.train_number,
        train_name: name,
        type_suffix: suffix,
        is_imaginary: rawData.is_imaginary || false,
        source_url: rawData.source_url,
        rake_sharing: rawData.rake_sharing,
        rake_composition: (rawData.rake_composition || []).map(c => ({
            seq: parseInt(c.sequence, 10),
            type: c.type.toLowerCase(),
            label: c.coach
        })),
        stops: []
    };

    let lastKm = -1;
    let sequenceError = false;

    for (const stop of rawData.stops) {
        const km = parseFloat(stop.km) || 0;

        // Basic validation
        if (km < lastKm) sequenceError = true;
        lastKm = km;

        silverData.stops.push({
            seq: stop.sequence,
            station_code: stop.code,
            station_name: stop.name,
            arr_min: toMins(stop.arrives),
            dep_min: toMins(stop.departs),
            day: parseInt(stop.day, 10) || 1,
            km: km,
            platform: stop.pf === '-' ? null : stop.pf,
            zone: stop.zone,
            xing: stop.xing || null,
            intermed_count: stop.intermediate_stations || 0
        });
    }

    silverData.validation = {
        has_stops: silverData.stops.length > 0,
        km_logical: !sequenceError,
        is_complete: silverData.stops.length >= 2
    };

    return silverData;
}

async function run() {
    const files = fs.readdirSync(BRONZE_DIR).filter(f => f.endsWith('.json'));
    console.log(`✨ Found ${files.length} Bronze files. Transforming to Silver...`);

    let count = 0;
    for (const file of files) {
        const silver = transform(file);
        if (silver) {
            const outPath = path.join(SILVER_DIR, `${silver.train_number || silver.id}.json`);
            fs.writeFileSync(outPath, JSON.stringify(silver, null, 2), 'utf-8');
            count++;
        }
    }

    console.log(`✅ Transformation complete. Produced ${count} Silver records in ${SILVER_DIR}`);
}

run().catch(console.error);

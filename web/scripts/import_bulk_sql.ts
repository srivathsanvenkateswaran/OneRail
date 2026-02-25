import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;
const SILVER_DIR = path.resolve('.tmp/silver/trains');

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    await client.connect();
    console.log("🐘 Connected to PostgreSQL via pg");

    if (!fs.existsSync(SILVER_DIR)) {
        console.error(`Silver directory not found: ${SILVER_DIR}`);
        return;
    }

    const files = fs.readdirSync(SILVER_DIR).filter(f => f.endsWith('.json'));
    console.log(`📁 Found ${files.length} silver files to import.`);

    for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(SILVER_DIR, file), 'utf-8'));
        if (!data.train_number) continue;

        try {
            process.stdout.write(`🚂 Loading ${data.train_number}... `);

            // 1. Upsert Stations
            const stationMap = new Map();
            for (const stop of data.stops) {
                stationMap.set(stop.station_code, stop.station_name);
            }

            for (const [code, name] of stationMap) {
                await client.query(
                    `INSERT INTO "Station" (station_code, station_name) 
                     VALUES ($1, $2) 
                     ON CONFLICT (station_code) DO NOTHING`,
                    [code, name]
                );
            }

            // 2. Upsert Train
            const firstStop = data.stops[0];
            const lastStop = data.stops[data.stops.length - 1];

            await client.query(
                `INSERT INTO "Train" (train_number, train_name, train_type, rake_share_text, total_distance_km, run_days, source_station_code, destination_station_code)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (train_number) DO UPDATE SET
                    train_name = EXCLUDED.train_name,
                    rake_share_text = EXCLUDED.rake_share_text,
                    total_distance_km = EXCLUDED.total_distance_km,
                    source_station_code = EXCLUDED.source_station_code,
                    destination_station_code = EXCLUDED.destination_station_code`,
                [
                    data.train_number,
                    data.train_name,
                    "Express",
                    data.rake_sharing || null,
                    lastStop ? lastStop.km : 0,
                    127,
                    firstStop ? firstStop.station_code : '???',
                    lastStop ? lastStop.station_code : '???'
                ]
            );

            // 3. Re-insert Stops (Delete + Insert)
            await client.query(`DELETE FROM "TrainStop" WHERE train_number = $1`, [data.train_number]);
            for (const s of data.stops) {
                await client.query(
                    `INSERT INTO "TrainStop" (train_number, stop_sequence, station_code, arrival_time_mins, departure_time_mins, day_number, distance_from_source_km, platform_number, xing, intermediate_stations)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                        data.train_number, s.seq, s.station_code, s.arr_min, s.dep_min,
                        s.day, s.km, s.platform, s.xing, s.intermed_count
                    ]
                );
            }

            // 4. Re-insert Rake
            await client.query(`DELETE FROM "CoachConfig" WHERE train_number = $1`, [data.train_number]);
            if (data.rake_composition) {
                for (const c of data.rake_composition) {
                    await client.query(
                        `INSERT INTO "CoachConfig" (train_number, position_in_train, class_code, coach_label)
                         VALUES ($1, $2, $3, $4)`,
                        [data.train_number, c.seq || 0, c.type, c.label]
                    );
                }
            }

            process.stdout.write(`✅\n`);

        } catch (err: any) {
            console.error(`\n❌ Error importing ${data.train_number}:`, err.message);
        }
    }

    await client.end();
    console.log("🏁 Bulk import finished.");
}

main().catch(console.error);

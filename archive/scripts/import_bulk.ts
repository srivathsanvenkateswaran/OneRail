import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new (PrismaClient as any)({
    datasourceUrl: process.env.DATABASE_URL
});
const SILVER_DIR = path.resolve('../.tmp/silver/trains');

async function main() {
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
            console.log(`🚂 Importing ${data.train_number}: ${data.train_name}...`);

            // 1. Upsert Stations first (Station resolution)
            // We collect all unique stations in this train
            const stationMap = new Map();
            for (const stop of data.stops) {
                stationMap.set(stop.station_code, stop.station_name);
            }

            for (const [code, name] of stationMap) {
                await prisma.station.upsert({
                    where: { station_code: code },
                    update: {}, // Don't overwrite existing station names for now
                    create: { station_code: code, station_name: name }
                });
            }

            // 2. Upsert Train
            const firstStop = data.stops[0];
            const lastStop = data.stops[data.stops.length - 1];

            await prisma.train.upsert({
                where: { train_number: data.train_number },
                update: {
                    train_name: data.train_name,
                    rake_share_text: data.rake_sharing || null,
                    total_distance_km: lastStop ? lastStop.km : 0,
                    source_station_code: firstStop ? firstStop.station_code : '???',
                    destination_station_code: lastStop ? lastStop.station_code : '???'
                },
                create: {
                    train_number: data.train_number,
                    train_name: data.train_name,
                    train_type: "Express", // Default
                    rake_share_text: data.rake_sharing || null,
                    total_distance_km: lastStop ? lastStop.km : 0,
                    run_days: 127,
                    source_station_code: firstStop ? firstStop.station_code : '???',
                    destination_station_code: lastStop ? lastStop.station_code : '???'
                }
            });

            // 3. Clear and Re-insert Stops (to handle sequence changes)
            await prisma.trainStop.deleteMany({ where: { train_number: data.train_number } });
            await prisma.trainStop.createMany({
                data: data.stops.map(s => ({
                    train_number: data.train_number,
                    stop_sequence: s.seq,
                    station_code: s.station_code,
                    arrival_time_mins: s.arr_min,
                    departure_time_mins: s.dep_min,
                    day_number: s.day,
                    distance_from_source_km: s.km,
                    platform_number: s.platform,
                    xing: s.xing,
                    intermediate_stations: s.intermed_count
                }))
            });

            // 4. Clear and Re-insert Rake
            await prisma.coachConfig.deleteMany({ where: { train_number: data.train_number } });
            if (data.rake_composition && data.rake_composition.length > 0) {
                await prisma.coachConfig.createMany({
                    data: data.rake_composition.map(c => ({
                        train_number: data.train_number,
                        position_in_train: c.seq || 0,
                        class_code: c.type,
                        coach_label: c.label
                    }))
                });
            }

        } catch (err) {
            console.error(`❌ Error importing ${data.train_number}:`, err.message);
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

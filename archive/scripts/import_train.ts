import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Helper to convert "HH:mm" to minutes from midnight
function timeToMins(timeStr: string | null | undefined): number | null {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [hh, mm] = timeStr.trim().split(':');
    const hours = parseInt(hh, 10);
    const minutes = parseInt(mm, 10);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
}

// Helper to convert "10m" to 10
function parseHalt(haltStr: string | null | undefined): number | null {
    if (!haltStr) return null;
    const match = haltStr.match(/(\d+)/);
    if (match) {
        return parseInt(match[1], 10);
    }
    return null;
}

async function main() {
    const dataPath = path.resolve('../.tmp/raw/trains/train_12621.json');
    if (!fs.existsSync(dataPath)) {
        console.error(`File not found: ${dataPath}`);
        process.exit(1);
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const trainData = JSON.parse(rawData);

    // Example title: "12621/Tamil Nadu Express (PT)Other Names..." => extract 12621 and "Tamil Nadu Express"
    const titleMatch = trainData.title.match(/^(\d{5})\/([A-Za-z\s]+)/);
    const trainNumber = titleMatch ? titleMatch[1] : "12621";
    const trainName = titleMatch ? titleMatch[2].trim() : "Tamil Nadu Express";

    const sourceStop = trainData.stops[0];
    const destStop = trainData.stops[trainData.stops.length - 1];

    console.log(`Importing train: ${trainNumber} - ${trainName}`);

    // 1. Insert/Update Train
    await prisma.train.upsert({
        where: { train_number: trainNumber },
        update: {
            train_name: trainName,
            train_type: "Superfast Express", // Fallback type, could be parsed
            source_station_code: sourceStop.code,
            destination_station_code: destStop.code,
            total_distance_km: parseFloat(destStop.km) || 0,
            rake_share_text: trainData.rake_sharing || null
        },
        create: {
            train_number: trainNumber,
            train_name: trainName,
            train_type: "Superfast Express",
            run_days: 127, // Default daily, can adjust
            has_pantry: false,
            classes_available: [],
            source_station: {
                connectOrCreate: {
                    where: { station_code: sourceStop.code },
                    create: { station_code: sourceStop.code, station_name: sourceStop.name }
                }
            },
            destination_station: {
                connectOrCreate: {
                    where: { station_code: destStop.code },
                    create: { station_code: destStop.code, station_name: destStop.name }
                }
            },
            total_distance_km: parseFloat(destStop.km) || 0,
            rake_share_text: trainData.rake_sharing || null
        }
    });

    // 2. Insert/Update Stations & Stops
    for (const stop of trainData.stops) {
        // Upsert the station
        await prisma.station.upsert({
            where: { station_code: stop.code },
            update: {
                station_name: stop.name,
            },
            create: {
                station_code: stop.code,
                station_name: stop.name
            }
        });

        const arrMins = timeToMins(stop.arrives);
        const depMins = timeToMins(stop.departs);
        const dayNum = parseInt(stop.day, 10) || 1;
        const haltMins = parseHalt(stop.halt);

        // Upsert TrainStop
        await prisma.trainStop.upsert({
            where: {
                train_number_stop_sequence: {
                    train_number: trainNumber,
                    stop_sequence: stop.sequence
                }
            },
            update: {
                station_code: stop.code,
                arrival_time_mins: arrMins,
                departure_time_mins: depMins,
                halt_duration_mins: haltMins,
                day_number: dayNum,
                distance_from_source_km: parseFloat(stop.km) || 0,
                platform_number: stop.pf || null,
                xing: stop.xing || null,
                intermediate_stations: stop.intermediate_stations || null
            },
            create: {
                train_number: trainNumber,
                station_code: stop.code,
                stop_sequence: stop.sequence,
                arrival_time_mins: arrMins,
                departure_time_mins: depMins,
                halt_duration_mins: haltMins,
                day_number: dayNum,
                distance_from_source_km: parseFloat(stop.km) || 0,
                platform_number: stop.pf || null,
                xing: stop.xing || null,
                intermediate_stations: stop.intermediate_stations || null
            }
        });
    }

    // 3. Clear existing rake composition and re-add
    await prisma.coachConfig.deleteMany({
        where: { train_number: trainNumber }
    });

    const coachConfigs = (trainData.rake_composition || []).map((coach: any) => {
        return {
            train_number: trainNumber,
            position_in_train: parseInt(coach.sequence, 10),
            class_code: coach.type || 'gen',
            coach_label: coach.coach || 'GS'
        };
    });

    if (coachConfigs.length > 0) {
        await prisma.coachConfig.createMany({
            data: coachConfigs
        });
    }

    console.log(`✅ Successfully imported Train ${trainNumber}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

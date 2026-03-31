import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    // How many sections have OSM_ endpoints?
    const osmSections = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS cnt
        FROM "TrackSection"
        WHERE from_node_code LIKE 'OSM_%' OR to_node_code LIKE 'OSM_%'
    `) as any[];

    const realSections = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS cnt
        FROM "TrackSection"
        WHERE from_node_code NOT LIKE 'OSM_%' AND to_node_code NOT LIKE 'OSM_%'
    `) as any[];

    console.log(`Total sections: ${osmSections[0].cnt + realSections[0].cnt}`);
    console.log(`Sections with OSM_ endpoints (to drop):  ${osmSections[0].cnt}`);
    console.log(`Sections between real stations (to keep): ${realSections[0].cnt}`);

    // Estimated size after trim
    const stationReal = await prisma.station.count({ where: { NOT: { station_code: { startsWith: 'OSM_' } } } });
    console.log(`\nReal stations to keep: ${stationReal}`);
    console.log(`\nEstimated post-trim DB size:`);
    console.log(`  TrackSegment removed:    -351 MB`);
    console.log(`  OSM stations removed:    ~-49 MB`);
    console.log(`  OSM-endpoint sections:   ~-${Math.round(osmSections[0].cnt * 35 / 49647)} MB`);
    console.log(`  Remaining estimate:      ~${Math.round(504 - 351 - 49 - (osmSections[0].cnt * 35 / 49647))} MB`);

    await prisma.$disconnect();
}

main().catch(console.error);

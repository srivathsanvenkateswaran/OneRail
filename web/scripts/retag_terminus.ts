import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    await prisma.$executeRawUnsafe('UPDATE "Station" SET is_terminus = false');

    await prisma.$executeRawUnsafe(`
        WITH SectionDegree AS (
            SELECT code, COUNT(*) AS degree
            FROM (
                SELECT from_node_code AS code FROM "TrackSection"
                UNION ALL
                SELECT to_node_code   AS code FROM "TrackSection"
            ) endpoints
            GROUP BY code
        ),
        TrainEndpoints AS (
            SELECT source_station_code AS code, COUNT(*) AS train_count
            FROM "Train" GROUP BY source_station_code
            UNION ALL
            SELECT destination_station_code AS code, COUNT(*) AS train_count
            FROM "Train" GROUP BY destination_station_code
        ),
        TrainCounts AS (
            SELECT code, SUM(train_count) AS total FROM TrainEndpoints GROUP BY code
        )
        UPDATE "Station" s
        SET is_terminus = true
        FROM SectionDegree sd
        JOIN TrainCounts tc ON tc.code = sd.code
        WHERE s.station_code = sd.code
          AND sd.degree = 1
          AND tc.total >= 5
          AND s.is_junction = false
          AND s.station_code NOT LIKE 'OSM_%'
    `);

    const count = await prisma.station.count({ where: { is_terminus: true } });
    console.log(`Tagged ${count} terminus stations.`);

    const all = await prisma.station.findMany({
        where: { is_terminus: true, NOT: { station_code: { startsWith: 'OSM_' } } },
        select: { station_code: true, station_name: true },
        orderBy: { station_name: 'asc' }
    });
    for (const s of all) console.log(`  ${s.station_code.padEnd(8)} ${s.station_name}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    // Check section degree for known terminus candidates
    const degrees = await prisma.$queryRawUnsafe(`
        SELECT code, COUNT(*)::int AS degree
        FROM (
            SELECT from_node_code AS code FROM "TrackSection"
            UNION ALL
            SELECT to_node_code   AS code FROM "TrackSection"
        ) endpoints
        WHERE code IN ('CAPE','TVC','CSMT','MAS','MS','HWH','SBC','MYS','PUNE','ADI')
        GROUP BY code
        ORDER BY degree
    `);
    console.log('Section degrees for terminus candidates:');
    console.table(degrees);

    // Check train endpoint counts
    const trainCounts = await prisma.$queryRawUnsafe(`
        SELECT code, SUM(train_count)::int AS total
        FROM (
            SELECT source_station_code AS code, COUNT(*)::int AS train_count FROM "Train" GROUP BY source_station_code
            UNION ALL
            SELECT destination_station_code AS code, COUNT(*)::int AS train_count FROM "Train" GROUP BY destination_station_code
        ) t
        WHERE code IN ('CAPE','TVC','CSMT','MAS','MS','HWH','SBC','MYS','PUNE','ADI')
        GROUP BY code
        ORDER BY total DESC
    `);
    console.log('\nTrain endpoint counts:');
    console.table(trainCounts);

    // How many stations qualify with degree=1?
    const deg1 = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS cnt
        FROM (
            SELECT code, COUNT(*) AS degree
            FROM (
                SELECT from_node_code AS code FROM "TrackSection"
                UNION ALL
                SELECT to_node_code   AS code FROM "TrackSection"
            ) endpoints
            GROUP BY code
        ) d
        WHERE degree = 1
    `) as any[];
    console.log(`\nStations with degree=1 in section graph: ${deg1[0].cnt}`);

    await prisma.$disconnect();
}
main().catch(console.error);

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    // Table sizes
    const tables = await prisma.$queryRawUnsafe(`
        SELECT
            relname AS table_name,
            pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
            pg_size_pretty(pg_relation_size(relid)) AS data_size,
            pg_size_pretty(pg_indexes_size(relid)) AS index_size,
            pg_total_relation_size(relid) AS raw_bytes
        FROM pg_catalog.pg_statio_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
    `) as any[];

    console.log('Table breakdown:');
    for (const t of tables) {
        console.log(`  ${t.table_name.padEnd(20)} total=${t.total_size.padStart(8)}  data=${t.data_size.padStart(8)}  indexes=${t.index_size.padStart(8)}`);
    }

    // OSM vs real station breakdown
    const osmCount = await prisma.station.count({ where: { station_code: { startsWith: 'OSM_' } } });
    const realCount = await prisma.station.count({ where: { NOT: { station_code: { startsWith: 'OSM_' } } } });
    console.log(`\nStation breakdown: ${realCount} real, ${osmCount} OSM virtual hubs`);

    // path_coordinates size in TrackSection
    const coordSize = await prisma.$queryRawUnsafe(`
        SELECT pg_size_pretty(SUM(pg_column_size(path_coordinates))) AS coord_size
        FROM "TrackSection"
        WHERE path_coordinates IS NOT NULL
    `) as any[];
    console.log(`TrackSection.path_coordinates total size: ${coordSize[0]?.coord_size}`);

    await prisma.$disconnect();
}

main().catch(console.error);

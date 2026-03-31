import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const r = await prisma.$queryRawUnsafe(`
        SELECT
            pg_size_pretty(pg_database_size(current_database())) AS db_size,
            (SELECT COUNT(*) FROM "Station") AS stations,
            (SELECT COUNT(*) FROM "TrackSegment") AS segments,
            (SELECT COUNT(*) FROM "TrackSection") AS sections,
            (SELECT COUNT(*) FROM "Train") AS trains
    `);
    console.log(r);
    await prisma.$disconnect();
}

main().catch(console.error);

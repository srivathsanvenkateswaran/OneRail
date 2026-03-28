import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const start = Date.now();
    console.log(`[${new Date().toLocaleTimeString()}] Nulling track_section_id on all TrackSegments...`);
    const nulled = await prisma.$executeRawUnsafe('UPDATE "TrackSegment" SET "track_section_id" = NULL');
    console.log(`[${new Date().toLocaleTimeString()}] Nulled FK on ${nulled} rows.`);

    console.log(`[${new Date().toLocaleTimeString()}] Deleting all TrackSection rows...`);
    await prisma.$executeRawUnsafe('DELETE FROM "TrackSection"');
    console.log(`[${new Date().toLocaleTimeString()}] Deleted.`);

    console.log(`[${new Date().toLocaleTimeString()}] Resetting ID sequence...`);
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"TrackSection"', 'id'), 1, false)`);
    console.log(`[${new Date().toLocaleTimeString()}] Done in ${((Date.now() - start) / 1000).toFixed(1)}s.`);

    await prisma.$disconnect();
}

main().catch(console.error);

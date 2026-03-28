import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('1. Nulling track_section_id on TrackSegment...');
    const nulled = await prisma.$executeRawUnsafe('UPDATE "TrackSegment" SET "track_section_id" = NULL');
    console.log(`   Done. ${nulled} rows updated.`);

    console.log('2. Dropping TrackSection table...');
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "TrackSection"');
    console.log('   Done.');

    await prisma.$disconnect();
    console.log('\nTrackSection dropped. Now run: npx prisma db push --accept-data-loss');
    console.log('Then run: npx tsx scripts/generate_sections.ts --skip-clear');
}

main().catch(console.error);

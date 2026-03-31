import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const sections  = await prisma.trackSection.count();
    const segments  = await prisma.trackSegment.count();
    const withSec   = await prisma.trackSegment.count({ where: { track_section_id: { not: null } } });

    console.log(`TrackSection rows : ${sections}`);
    console.log(`TrackSegment rows : ${segments}`);
    console.log(`  └─ with section : ${withSec}`);
    console.log(`  └─ without      : ${segments - withSec}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());

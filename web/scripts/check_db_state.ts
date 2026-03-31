import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const sections = await prisma.trackSection.count();
    const termini = await prisma.station.count({ where: { is_terminus: true } });
    const junctions = await prisma.station.count({ where: { is_junction: true } });
    console.log('TrackSections:', sections);
    console.log('Terminus stations:', termini);
    console.log('Junction stations:', junctions);

    const sample = await prisma.station.findMany({
        where: { is_terminus: true, NOT: { station_code: { startsWith: 'OSM_' } } },
        select: { station_code: true, station_name: true },
        take: 30,
        orderBy: { station_name: 'asc' }
    });
    console.log('\nSample termini:');
    sample.forEach(s => console.log(`  ${s.station_code}  ${s.station_name}`));

    await prisma.$disconnect();
}

main().catch(console.error);

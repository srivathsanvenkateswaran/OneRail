import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const total    = await prisma.station.count({ where: { is_terminus: true } });
    const real     = await prisma.station.count({ where: { is_terminus: true, NOT: { station_code: { startsWith: 'OSM_' } } } });
    const junction = await prisma.station.count({ where: { is_junction: true, NOT: { station_code: { startsWith: 'OSM_' } } } });

    console.log(`is_terminus = true : ${total} total  (${real} real stations)`);
    console.log(`is_junction = true : ${junction} real stations`);

    // Spot-check known terminals
    const spots = await prisma.station.findMany({
        where: { station_code: { in: ['MAS','CSMT','HWH','CAPE','TVC','VDA','VSP','BCT','SBC','NDLS'] } },
        select: { station_code: true, station_name: true, is_junction: true, is_terminus: true }
    });
    console.log('\nSpot-check:');
    for (const s of spots) {
        const tag = s.is_terminus ? '🏁 terminus' : s.is_junction ? '📍 junction' : '— untagged';
        console.log(`  ${s.station_code.padEnd(6)} ${s.station_name.padEnd(40)} ${tag}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

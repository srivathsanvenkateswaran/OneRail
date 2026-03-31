import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const terminals = await prisma.station.findMany({
        where: {
            is_terminus: true,
            NOT: { station_code: { startsWith: 'OSM_' } }
        },
        select: {
            station_code: true,
            station_name: true,
            state: true,
            zone_code: true,
            station_category: true,
            latitude: true,
            longitude: true,
        },
        orderBy: { station_name: 'asc' }
    });

    console.log(`\nTotal terminals: ${terminals.length}\n`);
    console.log('Code   | Name                                     | State              | Zone | Cat | Coords');
    console.log('-------|------------------------------------------|--------------------|----- |-----|-------');
    for (const s of terminals) {
        const coords = s.latitude ? `${s.latitude.toFixed(2)}, ${s.longitude?.toFixed(2)}` : 'no coords';
        console.log(
            `${s.station_code.padEnd(6)} | ${s.station_name.padEnd(40)} | ${(s.state ?? '-').padEnd(18)} | ${(s.zone_code ?? '-').padEnd(4)} | ${(s.station_category ?? '-').padEnd(3)} | ${coords}`
        );
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

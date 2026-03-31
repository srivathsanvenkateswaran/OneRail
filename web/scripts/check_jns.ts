import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const rows = await prisma.$queryRawUnsafe(`
        SELECT station_code, station_name, is_junction, is_terminus
        FROM "Station"
        WHERE station_code IN ('MDU','KPD','ED','SA','CBE','TPJ','TEN','NCJ','DG','MS','MAS','VM','CAPE')
        ORDER BY station_code
    `);
    console.table(rows);

    const total_jn = await prisma.station.count({ where: { is_junction: true } });
    const total_tr = await prisma.station.count({ where: { is_terminus: true } });
    console.log('Total junctions:', total_jn, '| Total terminus:', total_tr);
    await prisma.$disconnect();
}
main().catch(console.error);

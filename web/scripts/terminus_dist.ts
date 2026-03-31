import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const rows = await prisma.$queryRaw<any[]>`
        SELECT te.train_count::int, COUNT(*)::int as stations
        FROM (
            SELECT station_code, COUNT(*) AS train_count
            FROM (
                SELECT source_station_code      AS station_code FROM "Train"
                UNION ALL
                SELECT destination_station_code AS station_code FROM "Train"
            ) t
            GROUP BY station_code
        ) te
        JOIN "Station" s ON s.station_code = te.station_code
        WHERE s.is_junction = false
          AND s.station_code NOT LIKE 'OSM_%'
        GROUP BY te.train_count
        ORDER BY te.train_count
    `;

    console.log('\nTrain-endpoint count distribution (non-junction real stations):\n');
    console.log('Trains | Stations | Cumulative (from top)');
    console.log('-------|----------|---------------------');

    let total = rows.reduce((s, r) => s + r.stations, 0);
    let cumulative = 0;
    for (const r of rows.reverse()) {
        cumulative += r.stations;
        console.log(`  ${String(r.train_count).padStart(4)} | ${String(r.stations).padStart(8)} | ${cumulative}`);
        if (r.train_count < 3) break;
    }
    console.log(`\nTotal non-junction stations appearing as train endpoints: ${total}`);

    // Spot check known terminals at various thresholds
    const spots = [
        { code: 'MAS',  label: 'Chennai Central' },
        { code: 'CSMT', label: 'CSMT Mumbai' },
        { code: 'HWH',  label: 'Howrah' },
        { code: 'CAPE', label: 'Kanniyakumari' },
        { code: 'TVC',  label: 'Trivandrum Central' },
        { code: 'NZM',  label: 'Hazrat Nizamuddin' },
        { code: 'BCT',  label: 'Mumbai Central' },
    ];
    const counts = await prisma.$queryRaw<any[]>`
        SELECT station_code, COUNT(*)::int as train_count
        FROM (
            SELECT source_station_code AS station_code FROM "Train"
            UNION ALL
            SELECT destination_station_code AS station_code FROM "Train"
        ) t
        WHERE station_code = ANY(${spots.map(s => s.code)})
        GROUP BY station_code
    `;
    const countMap = Object.fromEntries(counts.map(r => [r.station_code, r.train_count]));
    console.log('\nKnown terminal train counts:');
    for (const s of spots) {
        console.log(`  ${s.code.padEnd(5)} ${s.label.padEnd(25)} → ${countMap[s.code] ?? 0} trains`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

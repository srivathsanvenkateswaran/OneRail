import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    // Combined: degree-1 in section graph AND is a real train journey endpoint
    const combined = await prisma.$queryRaw<any[]>`
        WITH SectionDegree AS (
            SELECT code, COUNT(*) AS degree
            FROM (
                SELECT from_node_code AS code FROM "TrackSection"
                UNION ALL
                SELECT to_node_code   AS code FROM "TrackSection"
            ) t GROUP BY code
        ),
        TrainEndpoints AS (
            SELECT source_station_code      AS code FROM "Train"
            UNION
            SELECT destination_station_code AS code FROM "Train"
        )
        SELECT s.station_code, s.station_name, sd.degree::int
        FROM SectionDegree sd
        JOIN "Station" s ON s.station_code = sd.code
        JOIN TrainEndpoints te ON te.code = sd.code
        WHERE sd.degree = 1
          AND s.is_junction = false
          AND s.station_code NOT LIKE 'OSM_%'
        ORDER BY s.station_name
    `;
    console.log(`Combined (degree-1 + train endpoint): ${combined.length} stations\n`);
    for (const r of combined) {
        console.log(`  ${r.station_code.padEnd(8)} ${r.station_name}`);
    }

    // Spot-check the known TN termini
    const tnCodes = ['CAPE', 'TN', 'TCN', 'RMM', 'MS', 'MET', 'UAM', 'PDY', 'BKNN', 'AGX'];
    const tnNames = ['%Bodinayakannur%','%Kanniyakumari%','%Thoothukudi%','%Thiruchendur%',
                     '%Rameswaram%','%Mettur Dam%','%Udhagamandalam%','%Puducherry%','%Agasthiyampalli%','%Chennai Central%'];
    const spots = await prisma.$queryRaw<any[]>`
        WITH SectionDegree AS (
            SELECT code, COUNT(*) AS degree
            FROM (
                SELECT from_node_code AS code FROM "TrackSection"
                UNION ALL
                SELECT to_node_code   AS code FROM "TrackSection"
            ) t GROUP BY code
        ),
        TrainEndpoints AS (
            SELECT source_station_code AS code FROM "Train"
            UNION
            SELECT destination_station_code AS code FROM "Train"
        )
        SELECT s.station_code, s.station_name,
               COALESCE(sd.degree::int, 0) AS sec_degree,
               (te.code IS NOT NULL) AS is_train_endpoint,
               s.is_junction, s.is_terminus
        FROM "Station" s
        LEFT JOIN SectionDegree sd ON sd.code = s.station_code
        LEFT JOIN TrainEndpoints te ON te.code = s.station_code
        WHERE (s.station_name ILIKE ANY(ARRAY[
            '%Bodinayakannur%','%Kanniyakumari%','%Thoothukudi%','%Thiruchendur%',
            '%Rameswaram%','%Mettur Dam%','%Udhagamandalam%','%Puducherry%',
            '%Agasthiyampalli%','%Chennai Central%'
        ]))
        AND s.station_code NOT LIKE 'OSM_%'
        ORDER BY s.station_name
    `;
    console.log(`\nTN known terminus spot-check:`);
    console.log(`${'Code'.padEnd(8)} ${'Name'.padEnd(42)} ${'SecDeg'.padEnd(8)} ${'TrainEP'.padEnd(9)} ${'is_jn'.padEnd(7)} is_term`);
    console.log('─'.repeat(90));
    for (const r of spots) {
        console.log(`${r.station_code.padEnd(8)} ${r.station_name.padEnd(42)} ${String(r.sec_degree).padEnd(8)} ${String(r.is_train_endpoint).padEnd(9)} ${String(r.is_junction).padEnd(7)} ${r.is_terminus}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

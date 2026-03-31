import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    // First, check what degree-1 real stations exist in the current section graph
    const candidates = await prisma.$queryRaw<any[]>`
        WITH SectionDegree AS (
            SELECT code, COUNT(*) AS degree
            FROM (
                SELECT from_node_code AS code FROM "TrackSection"
                UNION ALL
                SELECT to_node_code   AS code FROM "TrackSection"
            ) endpoints
            GROUP BY code
        )
        SELECT s.station_code, s.station_name, sd.degree::int
        FROM SectionDegree sd
        JOIN "Station" s ON s.station_code = sd.code
        WHERE sd.degree = 1
          AND s.is_junction = false
          AND s.station_code NOT LIKE 'OSM_%'
        ORDER BY s.station_name
        LIMIT 30
    `;

    console.log(`\nDegree-1 real stations in section graph: ${candidates.length} (showing up to 30)`);
    for (const r of candidates) {
        console.log(`  ${r.station_code.padEnd(6)} ${r.station_name}`);
    }

    if (candidates.length === 0) {
        // Check overall endpoint breakdown
        const breakdown = await prisma.$queryRaw<any[]>`
            WITH SectionDegree AS (
                SELECT code, COUNT(*) AS degree
                FROM (
                    SELECT from_node_code AS code FROM "TrackSection"
                    UNION ALL
                    SELECT to_node_code   AS code FROM "TrackSection"
                ) endpoints
                GROUP BY code
            )
            SELECT
                COUNT(*) FILTER (WHERE code NOT LIKE 'OSM_%' AND degree::int = 1) AS real_deg1,
                COUNT(*) FILTER (WHERE code NOT LIKE 'OSM_%' AND degree::int = 2) AS real_deg2,
                COUNT(*) FILTER (WHERE code NOT LIKE 'OSM_%' AND degree::int >= 3) AS real_deg3plus,
                COUNT(*) FILTER (WHERE code LIKE 'OSM_%' AND degree::int = 1)     AS osm_deg1
            FROM SectionDegree
        `;
        console.log('\nSection endpoint degree breakdown:');
        console.log(`  Real stations deg=1  : ${breakdown[0].real_deg1}`);
        console.log(`  Real stations deg=2  : ${breakdown[0].real_deg2}`);
        console.log(`  Real stations deg≥3  : ${breakdown[0].real_deg3plus}`);
        console.log(`  OSM nodes   deg=1    : ${breakdown[0].osm_deg1}`);
        console.log('\n→ Sections were generated with old logic (all real stations as anchors).');
        console.log('→ Need to regenerate sections with updated generate_sections.ts.');
    } else {
        // Tag them
        await prisma.$executeRawUnsafe('UPDATE "Station" SET is_terminus = false');
        await prisma.$executeRawUnsafe(`
            WITH SectionDegree AS (
                SELECT code, COUNT(*) AS degree
                FROM (
                    SELECT from_node_code AS code FROM "TrackSection"
                    UNION ALL
                    SELECT to_node_code   AS code FROM "TrackSection"
                ) endpoints
                GROUP BY code
            )
            UPDATE "Station" s
            SET is_terminus = true
            FROM SectionDegree sd
            WHERE s.station_code = sd.code
              AND sd.degree = 1
              AND s.is_junction = false
              AND s.station_code NOT LIKE 'OSM_%'
        `);
        const count = await prisma.station.count({ where: { is_terminus: true } });
        console.log(`\nTagged ${count} terminus stations.`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const codes = ['LLI', 'PKT'];

    for (const code of codes) {
        const station = await prisma.station.findFirst({
            where: { OR: [{ station_code: code }, { station_name: { contains: code } }] },
            select: { station_code: true, station_name: true, is_junction: true, is_terminus: true }
        });
        if (!station) { console.log(`${code}: not found`); continue; }

        const sc = station.station_code;

        // Segment graph degree
        const segDeg = await prisma.$queryRaw<any[]>`
            SELECT COUNT(*)::int as degree FROM (
                SELECT from_station_code AS c FROM "TrackSegment" WHERE from_station_code = ${sc}
                UNION ALL
                SELECT to_station_code   AS c FROM "TrackSegment" WHERE to_station_code   = ${sc}
            ) t
        `;

        // Section graph degree
        const secDeg = await prisma.$queryRaw<any[]>`
            SELECT COUNT(*)::int as degree FROM (
                SELECT from_node_code AS c FROM "TrackSection" WHERE from_node_code = ${sc}
                UNION ALL
                SELECT to_node_code   AS c FROM "TrackSection" WHERE to_node_code   = ${sc}
            ) t
        `;

        // Train count
        const trainCount = await prisma.$queryRaw<any[]>`
            SELECT COUNT(*)::int as cnt FROM "Train"
            WHERE source_station_code = ${sc} OR destination_station_code = ${sc}
        `;

        // Neighbouring real stations via segments
        const neighbours = await prisma.$queryRaw<any[]>`
            SELECT DISTINCT
                CASE WHEN from_station_code = ${sc} THEN to_station_code ELSE from_station_code END AS neighbour
            FROM "TrackSegment"
            WHERE (from_station_code = ${sc} OR to_station_code = ${sc})
              AND CASE WHEN from_station_code = ${sc} THEN to_station_code ELSE from_station_code END NOT LIKE 'OSM_%'
        `;

        console.log(`\n${sc} — ${station.station_name}`);
        console.log(`  is_junction : ${station.is_junction}`);
        console.log(`  is_terminus : ${station.is_terminus}`);
        console.log(`  Seg degree  : ${segDeg[0].degree}`);
        console.log(`  Sec degree  : ${secDeg[0].degree}`);
        console.log(`  Train count : ${trainCount[0].cnt}`);
        console.log(`  Real neighbours: ${neighbours.map((r: any) => r.neighbour).join(', ') || 'none'}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

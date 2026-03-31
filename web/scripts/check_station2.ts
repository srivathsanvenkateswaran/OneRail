import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const names = ['Lalgudi', 'Pattukkottai'];

    for (const name of names) {
        const station = await prisma.station.findFirst({
            where: { station_name: { contains: name, mode: 'insensitive' }, NOT: { station_code: { startsWith: 'OSM_' } } },
            select: { station_code: true, station_name: true, is_junction: true, is_terminus: true }
        });
        if (!station) { console.log(`${name}: not found`); continue; }
        const sc = station.station_code;

        const segDeg = await prisma.$queryRaw<any[]>`
            SELECT COUNT(*)::int as degree FROM (
                SELECT from_station_code AS c FROM "TrackSegment" WHERE from_station_code=${sc}
                UNION ALL
                SELECT to_station_code   AS c FROM "TrackSegment" WHERE to_station_code  =${sc}
            ) t`;

        const secDeg = await prisma.$queryRaw<any[]>`
            SELECT COUNT(*)::int as degree FROM (
                SELECT from_node_code AS c FROM "TrackSection" WHERE from_node_code=${sc}
                UNION ALL
                SELECT to_node_code   AS c FROM "TrackSection" WHERE to_node_code  =${sc}
            ) t`;

        const trainCount = await prisma.$queryRaw<any[]>`
            SELECT COUNT(*)::int as cnt FROM "Train"
            WHERE source_station_code=${sc} OR destination_station_code=${sc}`;

        // Sections it appears in as endpoint
        const sections = await prisma.trackSection.findMany({
            where: { OR: [{ from_node_code: sc }, { to_node_code: sc }] },
            select: { from_node_code: true, to_node_code: true, distance_km: true }
        });

        // What real stations does it connect to via segments?
        const realNeighbours = await prisma.$queryRaw<any[]>`
            SELECT DISTINCT neighbour, s.station_name FROM (
                SELECT CASE WHEN from_station_code=${sc} THEN to_station_code ELSE from_station_code END AS neighbour
                FROM "TrackSegment"
                WHERE from_station_code=${sc} OR to_station_code=${sc}
            ) n JOIN "Station" s ON s.station_code = n.neighbour
            WHERE n.neighbour NOT LIKE 'OSM_%'`;

        console.log(`\n${sc} — ${station.station_name}`);
        console.log(`  is_terminus : ${station.is_terminus}`);
        console.log(`  Seg degree  : ${segDeg[0].degree}`);
        console.log(`  Sec degree  : ${secDeg[0].degree}`);
        console.log(`  Train count : ${trainCount[0].cnt}`);
        console.log(`  Real neighbours via segments: ${realNeighbours.length ? realNeighbours.map((r:any) => `${r.neighbour} (${r.station_name})`).join(', ') : 'none (all OSM nodes)'}`);
        console.log(`  Section endpoints:`);
        for (const sec of sections) console.log(`    ${sec.from_node_code} → ${sec.to_node_code} (${sec.distance_km.toFixed(1)} km)`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

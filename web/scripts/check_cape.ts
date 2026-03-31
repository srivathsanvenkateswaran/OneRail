import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    // DB flags
    const station = await prisma.station.findUnique({
        where: { station_code: 'CAPE' },
        select: { station_code: true, station_name: true, is_junction: true, is_terminus: true, latitude: true, longitude: true }
    });
    console.log('Station record:', station);

    // Degree in section graph
    const degree = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as degree
        FROM (
            SELECT from_node_code AS code FROM "TrackSection" WHERE from_node_code = 'CAPE'
            UNION ALL
            SELECT to_node_code   AS code FROM "TrackSection" WHERE to_node_code   = 'CAPE'
        ) t
    `;
    console.log('Section graph degree:', degree[0].degree);

    // Sections it belongs to
    const sections = await prisma.trackSection.findMany({
        where: { OR: [{ from_node_code: 'CAPE' }, { to_node_code: 'CAPE' }] },
        select: { id: true, from_node_code: true, to_node_code: true, distance_km: true }
    });
    console.log('Sections referencing CAPE:', sections);

    // Degree in segment graph
    const segDegree = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as degree
        FROM (
            SELECT from_station_code AS code FROM "TrackSegment" WHERE from_station_code = 'CAPE'
            UNION ALL
            SELECT to_station_code   AS code FROM "TrackSegment" WHERE to_station_code   = 'CAPE'
        ) t
    `;
    console.log('Segment graph degree:', segDegree[0].degree);
}
main().catch(console.error).finally(() => prisma.$disconnect());

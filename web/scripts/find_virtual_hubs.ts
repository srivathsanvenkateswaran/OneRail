import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('--- Searching for Virtual Hubs ---');
    const totalStations = await prisma.station.count();
    const virtualHubs = await prisma.station.count({
        where: { station_code: { startsWith: 'OSM_' } }
    });
    const realStations = totalStations - virtualHubs;
    
    console.log(`Summary:`);
    console.log(`- Total: ${totalStations}`);
    console.log(`- Virtual (OSM): ${virtualHubs}`);
    console.log(`- Real: ${realStations}`);
    
    console.log(`\nSample virtual hubs:`);
    const stations = await prisma.station.findMany({
        where: { station_code: { startsWith: 'OSM_' } },
        take: 10
    });
    stations.forEach(s => {
        console.log(`- Code: ${s.station_code}, Name: ${s.station_name}, Junction: ${s.is_junction}`);
    });

    const sections = await prisma.trackSection.findMany({
        where: {
            OR: [
                { from_node_code: { startsWith: 'OSM_' } },
                { to_node_code: { startsWith: 'OSM_' } }
            ]
        },
        take: 5
    });

    console.log(`\nSample track sections with virtual nodes:`);
    sections.forEach(sec => {
        console.log(`- ID: ${sec.id}, From: ${sec.from_node_code}, To: ${sec.to_node_code}`);
    });
}

main().catch(console.error);

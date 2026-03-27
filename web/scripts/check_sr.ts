import { prisma } from './src/lib/prisma';

async function main() {
    const srStations = await prisma.station.findMany({
        where: { zone_code: 'SR', latitude: { not: null }, longitude: { not: null } },
        select: { station_code: true, station_name: true, longitude: true, latitude: true }
    });

    console.log(`SR Station Count: ${srStations.length}`);

    // Extremities
    const minLon = Math.min(...srStations.map(s => s.longitude!));
    const maxLon = Math.max(...srStations.map(s => s.longitude!));
    const minLat = Math.min(...srStations.map(s => s.latitude!));
    const maxLat = Math.max(...srStations.map(s => s.latitude!));

    console.log('Bounds:', { minLon, maxLon, minLat, maxLat });

    const southernMost = srStations.sort((a,b) => a.latitude! - b.latitude!).slice(0, 5);
    const northernMost = srStations.sort((a,b) => b.latitude! - a.latitude!).slice(0, 5);
    const westernMost = srStations.sort((a,b) => a.longitude! - b.longitude!).slice(0, 5);
    const easternMost = srStations.sort((a,b) => b.longitude! - a.longitude!).slice(0, 5);

    console.log('\nSouthern-most:');
    southernMost.forEach(s => console.log(`  ${s.station_code} ${s.station_name} (${s.longitude}, ${s.latitude})`));

    console.log('\nNorthern-most:');
    northernMost.forEach(s => console.log(`  ${s.station_code} ${s.station_name} (${s.longitude}, ${s.latitude})`));

    console.log('\nWestern-most:');
    westernMost.forEach(s => console.log(`  ${s.station_code} ${s.station_name} (${s.longitude}, ${s.latitude})`));

    console.log('\nEastern-most:');
    easternMost.forEach(s => console.log(`  ${s.station_code} ${s.station_name} (${s.longitude}, ${s.latitude})`));

    await prisma.$disconnect();
}

main().catch(console.error);

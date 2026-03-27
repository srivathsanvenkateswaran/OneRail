import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('--- OneRail Global Hub Classifier (Simple Name-Based) ---');
    
    // Step 1: Global Clear of all existing flags (fresh start)
    await prisma.$executeRaw`
        UPDATE "Station" SET is_junction = false, is_terminus = false;

        -- Step 2: Mark by Name ONLY (Case-insensitive)
        -- Looking for " Jn", " Jn.", " Junction", or " Jct" (common Indian Railways hub abbreviations)
        UPDATE "Station"
        SET is_junction = true
        WHERE (station_name ILIKE '% Jn' 
               OR station_name ILIKE '% Jn.' 
               OR station_name ILIKE '% Junction%'
               OR station_name ILIKE '% Jct%');

        -- Step 3: Special Case for logical terminals (only degree-1 in the track graph)
        -- We only tag them as terminals if they are NOT junctions and are NAMED stations.
        CREATE TEMP TABLE NodeDegrees AS
        SELECT code, COUNT(*) as degree
        FROM (
            SELECT from_station_code as code FROM "TrackSegment"
            UNION ALL
            SELECT to_station_code as code FROM "TrackSegment"
        ) sub
        GROUP BY code;

        UPDATE "Station" s
        SET is_terminus = true
        FROM NodeDegrees d
        WHERE s.station_code = d.code 
          AND d.degree = 1 
          AND s.is_junction = false
          AND NOT s.station_code LIKE 'OSM_%';

        -- Specific Revert for Chennai Egmore (Confirmed not a Junction)
        UPDATE "Station"
        SET is_junction = false
        WHERE station_name ILIKE '%Chennai Egmore%';
    `;

    const jc = await prisma.station.count({ where: { is_junction: true, NOT: { station_code: { startsWith: 'OSM_' } } } });
    const tc = await prisma.station.count({ where: { is_terminus: true, NOT: { station_code: { startsWith: 'OSM_' } } } });

    console.log(`\n✅ ATLAS TOPOLOGY RE-SIMPLIFIED (Name-Based Only)`);
    console.log(`   Named Junctions identified: ${jc}`);
    console.log(`   Named Terminals identified: ${tc}`);
    await prisma.$disconnect();
}

main().catch(console.error);

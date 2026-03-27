import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('--- OneRail Global Hub Classifier (Manual & Automatic) ---');
    
    // Step 1: Structural Analysis
    await prisma.$executeRaw`
        CREATE TEMP TABLE NodeDegrees AS
        SELECT code, COUNT(*) as degree
        FROM (
            SELECT from_station_code as code FROM "TrackSegment"
            UNION ALL
            SELECT to_station_code as code FROM "TrackSegment"
        ) sub
        GROUP BY code;

        -- Global Clear
        UPDATE "Station" SET is_junction = false, is_terminus = false;

        -- Automatic Junctions (Naming & Degree)
        UPDATE "Station"
        SET is_junction = true
        WHERE (station_name ILIKE '% Jn%' OR station_name ILIKE '% Junction%');

        UPDATE "Station" s
        SET is_junction = true
        FROM NodeDegrees d
        WHERE s.station_code = d.code AND d.degree >= 3;

        -- Automatic Terminals
        UPDATE "Station" s
        SET is_terminus = true
        FROM NodeDegrees d
        WHERE s.station_code = d.code AND d.degree = 1 AND s.is_junction = false;

        -- USER OVERRIDES (Explicit Ground Truth)
        -- We force these stations to be Junctions as per user input
        UPDATE "Station"
        SET is_junction = true, is_terminus = false
        WHERE station_name IN (
            'Dindigul Jn', 'Madurai Jn', 'Virudhunagar Jn', 'Vanchi Maniyachi Jn', 
            'Tirunelveli Jn', 'Tiruchchirappalli Jn', 'Nagercoil Jn', 'Karaikal', 
            'Manamadurai Jn', 'Pollachi Jn', 'Coimbatore Jn', 'Salem Jn', 
            'Erode Jn', 'Karur Jn', 'Jolarpettai Jn', 'Katpadi Jn', 
            'Villupuram Jn', 'Vriddhachalam Jn'
        ) OR (
            station_name ILIKE '%Madurai%' OR station_name ILIKE '%Dindigul%' OR 
            station_name ILIKE '%Trichy%' OR station_name ILIKE '%Salem%'
        );

        -- Specific Revert for Chennai Egmore (per user request)
        UPDATE "Station"
        SET is_junction = false
        WHERE station_name ILIKE '%Chennai Egmore%';
    `;

    const jc = await prisma.station.count({ where: { is_junction: true, NOT: { station_code: { startsWith: 'OSM_' } } } });
    console.log(`\n✅ DATABASE SYNCHRONIZED!`);
    console.log(`   Found ${jc} Junctions in total.`);
    await prisma.$disconnect();
}

main().catch(console.error);

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

/**
 * tag_junctions.ts
 *
 * Tags stations as is_junction = true based on Indian Railways name conventions.
 * Terminus detection is intentionally NOT done here — it requires TrackSections
 * to exist first and is handled as Step 6 of generate_sections.ts.
 *
 * Run this BEFORE generate_sections.ts.
 */
async function main() {
    console.log('--- OneRail Junction Classifier ---');

    // Clear all existing flags
    await prisma.$executeRaw`UPDATE "Station" SET is_junction = false, is_terminus = false`;
    console.log('   Cleared all junction/terminus flags.');

    // Tag junctions by name (Indian Railways hub abbreviations)
    await prisma.$executeRaw`
        UPDATE "Station"
        SET is_junction = true
        WHERE (station_name ILIKE '% Jn'
               OR station_name ILIKE '% Jn.'
               OR station_name ILIKE '% Junction%'
               OR station_name ILIKE '% Jct%')
    `;

    // Specific revert — Chennai Egmore is loosely named but is not a topological junction
    await prisma.$executeRaw`
        UPDATE "Station" SET is_junction = false WHERE station_name ILIKE '%Chennai Egmore%'
    `;

    const jc = await prisma.station.count({
        where: { is_junction: true, NOT: { station_code: { startsWith: 'OSM_' } } }
    });
    console.log(`\n✅ Junction tagging complete: ${jc} junctions identified.`);
    console.log(`   Run generate_sections.ts next — terminus stations will be tagged in Step 6.`);

    await prisma.$disconnect();
}

main().catch(console.error);

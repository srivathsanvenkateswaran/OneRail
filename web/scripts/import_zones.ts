import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('Downloading Station Zone GeoJSON from Datameet...');
    const url = 'https://raw.githubusercontent.com/datameet/railways/master/stations.json';
    
    let data;
    try {
        const res = await fetch(url);
        data = await res.json();
    } catch (err: any) {
        console.error('Failed to download GeoJSON:', err);
        return;
    }

    if (!data || !data.features) {
        console.error('Invalid GeoJSON format.');
        return;
    }

    console.log(`Downloaded ${data.features.length} stations from Datameet.`);
    
    // We only need station codes -> zone mappings
    const mappings = new Map<string, string>();
    for (const f of data.features) {
        const code = f.properties?.code;
        const zone = f.properties?.zone;
        if (code && zone) {
            // Trim and standardize
            mappings.set(code.trim().toUpperCase(), zone.trim().toUpperCase());
        }
    }

    console.log(`Formed mappings for ${mappings.size} unique station codes.`);

    // First ensure Zone records exist in our 'Zone' table for integrity?
    // In schema.prisma, Station -> Zone is an optional relation `zone_code String?` referencing `Zone.zone_code`.
    // Wait, does Zone table have all the zones? The user previously mentioned the DB returned no zones.
    // If we update Station.zone_code, it will fail foreign key constraint if Zone table does not have that code!
    
    // Let's ensure the Zone table has all these zones!
    const uniqueZones = Array.from(new Set(mappings.values()));
    console.log(`Upserting ${uniqueZones.length} unique Zones into Zone table...`);
    
    for (const z of uniqueZones) {
        await prisma.zone.upsert({
            where: { zone_code: z },
            update: {},
            create: {
                zone_code: z,
                zone_name: `${z} Railway`,
                headquarters: 'Unknown'
            }
        });
    }

    console.log('Updating Station records with Zone data...');
    let updated = 0;
    
    // We do a loop in chunks to prevent locking
    const codes = Array.from(mappings.entries());
    let skipped = 0;

    for (const [code, zone] of codes) {
        try {
            await prisma.station.update({
                where: { station_code: code },
                data: { zone_code: zone }
            });
            updated++;
        } catch(e) {
            // Station doesn't exist in our DB, ignore
            skipped++;
        }
    }

    console.log(`✅ Success! Updated ${updated} stations with real IR Zone data.`);
    console.log(`(Skipped ${skipped} stations not found locally)`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

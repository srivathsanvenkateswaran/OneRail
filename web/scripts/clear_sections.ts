import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

/**
 * clear_sections.ts
 *
 * Cleanly resets the TrackSection table by:
 *  1. Nulling track_section_id on all TrackSegments (avoids FK conflicts during drop)
 *  2. DROP TABLE "TrackSection" CASCADE  (removes the table + any FK constraints that reference it)
 *  3. Recreating "TrackSection" from scratch with the exact schema
 *  4. Re-adding the TrackSegment → TrackSection FK (dropped by CASCADE in step 2)
 *
 * Run before generate_sections.ts to guarantee a clean slate.
 */

async function main() {
    const start = Date.now();
    const t = () => new Date().toLocaleTimeString();

    console.log('--- OneRail: Clear & Recreate TrackSection Table ---\n');

    // Step 1: Null the FK column on TrackSegment
    console.log(`[${t()}] Step 1: Nulling track_section_id on all TrackSegments...`);
    const nulled = await prisma.$executeRawUnsafe('UPDATE "TrackSegment" SET "track_section_id" = NULL');
    console.log(`[${t()}]   Nulled ${nulled} rows.\n`);

    // Step 2: Drop the TrackSection table (CASCADE removes any FKs pointing to it)
    console.log(`[${t()}] Step 2: Dropping TrackSection table with CASCADE...`);
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "TrackSection" CASCADE');
    console.log(`[${t()}]   Table dropped.\n`);

    // Step 3: Recreate TrackSection with full schema
    console.log(`[${t()}] Step 3: Recreating TrackSection table...`);
    await prisma.$executeRawUnsafe(`
        CREATE TABLE "TrackSection" (
            "id"               SERIAL        NOT NULL,
            "from_node_code"   TEXT          NOT NULL,
            "to_node_code"     TEXT          NOT NULL,
            "distance_km"      DOUBLE PRECISION NOT NULL,
            "mps"              INTEGER,
            "track_type"       TEXT,
            "electrified"      BOOLEAN       NOT NULL DEFAULT false,
            "status"           TEXT          NOT NULL DEFAULT 'Operational',
            "gauge"            TEXT          NOT NULL DEFAULT 'BG',
            "zone_code"        TEXT,
            "num_stations"     INTEGER       NOT NULL DEFAULT 0,
            "path_coordinates" JSONB,
            CONSTRAINT "TrackSection_pkey" PRIMARY KEY ("id")
        )
    `);

    // FK from TrackSection → Station (from_node_code)
    await prisma.$executeRawUnsafe(`
        ALTER TABLE "TrackSection"
        ADD CONSTRAINT "TrackSection_from_node_code_fkey"
        FOREIGN KEY ("from_node_code") REFERENCES "Station"("station_code")
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    // FK from TrackSection → Station (to_node_code)
    await prisma.$executeRawUnsafe(`
        ALTER TABLE "TrackSection"
        ADD CONSTRAINT "TrackSection_to_node_code_fkey"
        FOREIGN KEY ("to_node_code") REFERENCES "Station"("station_code")
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    // Indexes on FK columns
    await prisma.$executeRawUnsafe(`CREATE INDEX "TrackSection_from_node_code_idx" ON "TrackSection"("from_node_code")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "TrackSection_to_node_code_idx"   ON "TrackSection"("to_node_code")`);

    console.log(`[${t()}]   Table recreated.\n`);

    // Step 4: Re-add the FK from TrackSegment → TrackSection (was dropped by CASCADE)
    console.log(`[${t()}] Step 4: Restoring TrackSegment → TrackSection FK...`);
    await prisma.$executeRawUnsafe(`
        ALTER TABLE "TrackSegment"
        ADD CONSTRAINT "TrackSegment_track_section_id_fkey"
        FOREIGN KEY ("track_section_id") REFERENCES "TrackSection"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    `);
    console.log(`[${t()}]   FK restored.\n`);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Done in ${elapsed}s. TrackSection is clean and ready for generate_sections.ts.`);

    await prisma.$disconnect();
}

main().catch(console.error);

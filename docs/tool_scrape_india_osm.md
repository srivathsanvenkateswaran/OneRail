# Tool Architecture: `scrape_india_osm.mjs` & Merging Pipeline

## Executive Summary
Fetching the entire Indian Railway network directly from the Overpass API is impossible due to massive `Timeout` constraints and RAM limits natively enforced by OpenStreetMap endpoints. 

`scrape_india_osm.mjs` solves this by physically segmenting the subcontinent coordinates into smaller, mathematically bounded 4°×4° grid tiles, querying them slowly, and dumping the partial fragments. Its companion script, `merge_and_import_osm.mjs`, reconstructs the fragments locally and seeds the database.

## 1. `scrape_india_osm.mjs` (The Tiling Engine)

**Logic Flow:**
1. **Mathematical Gridding:** Defining an absolute bounding box comprising the Indian subcontinent (`lat 6.5–37.5`, `lon 68–98`), the script loops sequentially building ~56 internal `<bbox>` 4°×4° tiles.
2. **Sequential Querying:** It fires the Overpass QL against OpenStreetMap requesting all `railway=rail` variants exclusively within the current tile.
3. **Smart Resumption & Caching:** Before fetching, it checks `.tmp/india_tiles/osm_rail_{bbox}.json`. If the tile is fully downloaded, it skips it allowing you to quit and resume the process over multiple days.
4. **Rate Limit Evasion:** It aggressively manages `HTTP 429` errors. It enforces a strict `4000ms` delay between success calls, and up to `30s` exponential wait cascades if Overpass issues a rate warning.

## 2. `merge_and_import_osm.mjs` (The Reconstruction Importer)

Once `scrape_india_osm` produces 56 fractured JSON files, they must be merged because lines (e.g., a train track from Delhi to Mumbai) will cross multiple tiles, generating duplicate Node and Way IDs in the JSON outputs.

**Logic Flow:**
1. **Array Deduplication:** It loads all 56 temporary files into a unified Node.js `fs` buffer. It pushes elements into a native JavaScript `Map` (leveraging `nodeId` or `wayId` as keys).
   - *Why?* Because a `Map` strictly forbids duplicate keys. If Tile A and Tile B both contain Node `123`, the `Map` natively deduplicates it (Last-Write Wins) without requiring complex quadratic array searching.
2. **Metadata Classification:** Translates arbitrary OSM tagging metrics like `gauge=1676` to `BG`, or `electrified=contact_line` to `true`.
3. **Database Injection:** Links the reconstructed coordinates and sends massive Prisma `upsert` queries to `Station` and `TrackSegment` using the unique `fromNodeId -> toNodeId` keys.

## When to use this vs. `.pbf` Importers?
* This ecosystem is the **API-Based approach**. It requires no massive 1.6GB file downloads, but takes hours of slow, polite HTTP requests.
* The `import_pbf_atlas.ts` approach uses offline binary parsing of a pre-downloaded map, finishing the job in minutes locally rather than hours online. Both exist to provide absolute flexibility for deployment environments.

# Script Architecture: `import_pbf_atlas.ts`

## Executive Summary
This script is the heavyweight champion of the OneRail ecosystem. Its sole purpose is to parse the colossal 1.6GB `india-latest.osm.pbf` (Protocolbuffer Binary Format) dump of OpenStreetMap. It maps relational track matrices out of millions of random nodes, and bulk-inserts them into the PostgreSQL `TrackSegment` table as `GeoJSON LineStrings` without causing an Out-Of-Memory (OOM) crash in Node.js.

## Architecture & Logic Flow

To parse a 1.6GB binary map in Node.js, we cannot hold the entire node graph in RAM. We must use a **Two-Pass Streaming Architecture**.

**Logic Flow:**
1. **Pass 1: Node Identification (`Phase 1`)**
   - The script creates a readable stream via `osm-pbf-parser` and pipes the 1.6GB file sequentially.
   - It ignores everything except `way` tags matching `railway=rail` or `construction`. 
   - When a valid railway is found, it drops the `way` metadata into a temporary array and harvests the IDs of the points (nodes) that make up that physical track into a master `Set<number>`.
2. **Pass 2: Geolocation Harvesting (`Phase 2`)**
   - The stream restarts from byte 0. 
   - This time, the script listens exclusively for `node` elements. If the `node.id` exists in our `Set` (meaning it's necessary for drawing a track line), it saves the `[longitude, latitude]` into an in-memory `Map`. All other millions of irrelevant highway/building nodes are garbage collected immediately.
3. **Database Insertion (`Phase 3`)**
   - We now have the `ways` (tracks) and the `Map` of coordinates. 
   - The script maps the exact geometry arrays for the `LineString` paths.
   - It extracts complex cartographic metadata from the OSM tags using helper logic (e.g., converting tags into Gauge sizes, identifying Electrification).
   - Using Prisma's `upsert`, it forcefully generates dummy `Virtual Hub` stations for the start/end coordinates, then links the `TrackSegment` to them securely.

## Helper Extractor Methods

| Method | Fallback | Description |
| :--- | :--- | :--- |
| `classifyGauge(tags)` | `BG` (Broad Gauge) | Normalizes raw inputs like `1676` or `1000` to standard string enums. |
| `isElectrified(tags)` | `false` | Scans string properties for `contact_line` to return booleans. |
| `classifyStatus(tags)`| `Operational` | Determines if the layer is under active construction. |

## Error Handling & V8 Limits

* **Missing Nodes / Fragmented Ways:** If an OSM `way` references a `node` that didn't exist in the dump (meaning the file boundary cut the track in half), the array length checks fail the `path_coords.length < 2` conditional and skip the geometry entirely to protect database UI rendering.
* **Prisma Concurrency Bottlenecks:** Because we rely on relational insertion (`station` upsert, followed by `track segment` link), the `await` loop runs synchronously (`for` loop rather than `Promise.all`). Sending 150,000 parallel Prisma write queries would overwhelm standard PostgreSQL connection pools.

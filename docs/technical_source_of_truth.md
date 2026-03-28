# OneRail: Technical Source of Truth

## System Overview & "The Vibe"
**OneRail** is a comprehensive, interactive railway network atlas and tracking application. The vibe is a high-performance, modern, and detailed mapping experience built for rail fans and developers, focusing on speed and cartographic clarity. The user experience philosophy emphasizes smooth interactions across a vast dataset, enabling users to seamlessly toggle layers (like gauge or construction status) and explore the entire Indian railway topological networks without frontend lag alongside train schedule intelligence.

## Architecture Deep Dive
The architecture acts as a pipeline that moves geographic and train schedule data through multiple refinement stages before rendering it on the frontend. 

1. **Bronze Layer (Ingestion):** Raw data is scraped from external sources such as OpenStreetMap (via Overpass API) and web portals (like IndiaRailInfo) and stored locally.
2. **Silver Layer (Transformation):** Raw JSON documents are sanitized, normalized, and validated to extract usable entities (like normalized stops, clean train names, and distinct geographic nodes).
3. **Gold Layer (Storage):** The validated data is loaded into a PostgreSQL database using Prisma ORM.
4. **Delivery Layer:** A Next.js API serves queried data dynamically as GeoJSON to a high-performance frontend client.

```mermaid
graph TD
   OSM[OpenStreetMap / Overpass API] -->|osm_atlas_scraper| Bronze[Bronze: Raw JSON]
   IRI[IndiaRailInfo] -->|explore_atlas| Bronze
   Bronze -->|silver_transform| Silver[Silver: Cleaned JSON]
   Silver -->|import_osm_atlas| DB[(PostgreSQL)]
   DB -->|Prisma ORM| API[Next.js API: /api/atlas/geojson]
   API -->|GeoJSON| Client[MapLibre GL Frontend]
```

## Core Module Breakdown

### 1. `tools/osm_atlas_scraper.mjs`
* **Purpose:** Fetches raw railway track and station geographic data for a specific bounding box.
* **Technical Logic:** Constructs an Overpass QL query searching for **`railway=rail`** and **`railway=station`**. Submits an HTTP POST request to the Overpass API and saves the resulting JSON elements locally in a temporary directory.
* **Dependencies:** Node.js native **`fetch`** and **`fs`**.
* **Integration Points:** Connects to external `https://overpass-api.de/api/interpreter`.

### 2. `tools/silver_transform.mjs`
* **Purpose:** Cleans and normalizes raw train and schedule data from the Bronze directory into the Silver directory.
* **Technical Logic:** Parses complex Hindi/English train nomenclature to extract pure train numbers and names. Normalizes array of stops into calculated minute offsets from midnight. Validates distance (KM) progression and sequence logics, appending a validation flag matrix.
* **Dependencies:** Node.js native **`fs`** and **`path`**.
* **Integration Points:** Reads from `.tmp/raw/trains_by_id` and writes to `.tmp/silver/trains`.

### 3. `web/scripts/import_osm_atlas.ts`
* **Purpose:** Processes OSM JSON files and seeds the PostgreSQL database with track geometry and pseudo-stations.
* **Technical Logic:** Iterates over the OSM elements in two passes: mapping spatial nodes (**`lat`**/**`lon`**), and then parsing "ways" into unified **`TrackSegment`** records. Computes technical details like **`gauge`**, **`electrified`** status, and **`track_type`**. Generates virtual hub stations for the track end-nodes using an upsert mechanism to prevent duplication.
* **Dependencies:** **`fs`**, **`path`**, and the internal **`Prisma`** client.
* **Integration Points:** Direct database writes using Prisma ORM.

### 4. `web/src/app/api/atlas/geojson/route.ts`
* **Purpose:** The main endpoint that feeds map data to the frontend in a standardized geospatial format.
* **Technical Logic:** A Next.js API route that accepts query parameters (like **`bbox`**, **`type`**, **`gauge`**, **`status`**) and queries the corresponding PostgreSQL models (**`TrackSegment`** and **`Station`**). It translates Prisma results into a standardized **GeoJSON** `FeatureCollection` format containing `LineString`s and `Point`s. Implements viewport filtering algorithmically to constrain payload size. 
* **Dependencies:** **`NextRequest`**, **`NextResponse`**, and **`Prisma`**.
* **Integration Points:** Connects the database to the frontend client via standard HTTP GET requests.

### 5. `tools/explore_atlas.mjs`
* **Purpose:** An experimental utility to fetch and archive raw HTML from existing platforms for payload analysis.
* **Technical Logic:** Uses a simulated browser user-agent to bypass basic blocks, fetches the external DOM text, and archives it to `.tmp/atlas.html`. 
* **Dependencies:** Node.js native modules.
* **Integration Points:** Outbound HTTP scraping.

## Developer Experience (DX)

* **Environment Spin-up:** 
  Ensure PostgreSQL is running locally and your `.env` is configured. Run database migrations using `npx prisma db push` or `npx prisma migrate dev`.
  Start the frontend and API layers with `npm run dev` from the `web/` directory.
* **Running Ingestion Pipelines:**
  Execute bounding box scrapers (e.g., `node tools/osm_atlas_scraper.mjs`) and subsequent importers (e.g., `npx tsx web/scripts/import_osm_atlas.ts <filepath>`) to seed your local database. Use `node tools/silver_transform.mjs` to digest train schedules.
* **Vibe Checking the UI:**
  Navigate to your map wrapper endpoint. The map should feel buttery smooth. Zoom and pan the viewport to trigger dynamic box queries; observe the terminal to ensure backend `SQL` bounding boxes constrain rendering effectively.

## Edge Cases & Error Handling

* **Missing/Corrupted Coordinates:** If OSM ways contain fewer than 2 nodes, the pipeline skips the segment gracefully, preventing mapping errors down the line.
* **Viewport Overload:** The GEOJSON API enforces a hard ceiling (`limit=50000`) and leverages database-level bounding box filtering to prevent returning the entire India dataset to the client, which would crash the map renderer.
* **Time Sequence Violations:** The transformer script intelligently tags **`sequenceError`** if distance (km) goes backward or time math logic fails, flagging the document in validation rather than silently corrupting the dataset.
* **Upsert Conflict Resolution:** The database seeding uses `Prisma.upsert` based on unique node codes (**`OSM_...`**), allowing the importer script to be completely idempotent. You can safely restart a failed ingestion mid-way.

## Lessons Learned & FAQ

### Q: Why are some major junctions (e.g., Tenali, Katpadi) missing from the map?
**A:** The Atlas map only renders stations that have both `latitude` and `longitude` populated in the database. Even if a station is marked as `is_junction = true`, it will remain invisible on the map if its coordinates are `NULL`. This often happens if the initial OSM import didn't find a matching `ref` (Station Code) in the PBF file.

### Q: How do I fix missing coordinates for junctions?
**A:** Use the recovery scripts in the `web/scripts/` directory:
1.  **`bulk_recover_geography.js`**: Fetches all Indian stations from the Overpass API and attempts to match them to your database by Station Code or Normalized Name.
2.  **`patch_junction_coords.js`** / **`final_junction_patch.js`**: Use these for surgical manual patches if OSM data is inconsistent or missing for specific high-priority hubs.

### Q: I updated the database coordinates, but the map still doesn't show the junctions. Why?
**A:** The frontend (`AtlasPage.tsx`) uses a persistent client-side cache (`IDB` via `clientCache.ts`). To force all users to see the new data, you must **bump the `cacheKey` version** in `web/src/app/atlas/page.tsx` (e.g., change `atlas-geojson-v15` to `atlas-geojson-v16`).

### Q: How is a "Junction" determined?
**A:** Primarily by name in `web/scripts/tag_junctions.ts`. It looks for suffixes like " Jn", " Jct", or " Junction". If a station is a major hub but doesn't have these in its name, it must be manually flagged or the script's regex must be updated.

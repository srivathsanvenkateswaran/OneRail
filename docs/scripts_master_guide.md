# OneRail: Ultimate Script Guide & CLI Architecture

The OneRail application utilizes a sprawling ecosystem of standalone Node.js scripts divided into two main categories: Data Scraping (`tools/`) and Database Ingestion (`web/scripts/`).

These scripts run offline and are responsible for gathering, sanitizing, and injecting the 1.6GB+ of Indian Railway geometry and millions of tabular timetable rows into the Next.js/PostgreSQL infrastructure.

---

## 🏗️ 1. The Scraping Ecosystem (`/tools`)
These scripts are designed to communicate with external APIs, bypass bot-detection, and archive text-based data locally into `.tmp/` directories.

* **`scrape_all_trains.mjs`** 
  * The core IndiaRailInfo tabular crawler. Pulls raw HTML schedules iteratively and caches them. 
  * 📖 *[Read Full ETL Documentation](./iri_etl_pipeline.md)*
* **`silver_transform.mjs`** 
  * The regex sanitization engine. Converts dirty Bronze HTML into strict, DB-ready Silver JSON arrays. 
  * 📖 *[Read Full ETL Documentation](./iri_etl_pipeline.md)*
* **`osm_atlas_scraper.mjs`** 
  * Lightweight Overpass API query script. Fetches highly localized bounding-box data (e.g. just the Delhi map) for rapid testing.
  * 📖 *[Read Technical Arch](./script_osm_atlas_scraper.md)*
* **`scrape_missing.mjs` / `audit_ids.mjs`**
  * Utility scripts that check `.tmp/raw` for gaps in the 1-25000 index counting, ensuring 100% data completion.

---

## 🗄️ 2. The Database Importers (`/web/scripts`)
These scripts utilize the heavy-lifting `prisma` database connectors. They stream vast amounts of gigabyte-scale data without blowing up the V8 Node memory heap.

* **`import_pbf_atlas.ts`** 
  * The massive 1.6GB full-India OpenStreetMap `.pbf` topology importer. Constructs geometric vectors.
  * 📖 *[Read Technical Arch](./script_import_pbf_atlas.md)*
* **`populate_station_coords.ts`** 
  * Scans the OSM graph exclusively for station nodes (`ref="MAS"`), ripping precise lat/longs and upserting them into the OneRail tables.
  * 📖 *[Read Technical Arch](./script_populate_station_coords.md)*
* **`import_osm_atlas.ts`**
  * The original localized JSON importer meant for use exclusively with the output from `osm_atlas_scraper.mjs`.

---

## 🛠️ 3. Execution Standard (How to Run)

Almost all scripts utilize CLI environment variables and arguments rather than internal hard-coded states:

**For standard `.mjs` scripts in `tools/`:**
```bash
# Uses standard Node V8 engine
node tools/scrape_all_trains.mjs 1 100 5
```

**For TypeScript importers in `web/scripts/`:**
Because these manipulate memory-dense OSM maps and utilize Postgres connections, they require execution via `tsx` (TypeScript Execute) and often require increasing the Node heap size limit.

```bash
# Expand memory pool to 12GB to parse OSM PBF maps
$env:NODE_OPTIONS="--max-old-space-size=12288"
npx tsx web/scripts/import_pbf_atlas.ts
```

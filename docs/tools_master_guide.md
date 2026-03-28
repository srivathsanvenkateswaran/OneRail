# Tools: Master Guide & Ecosystem Overview

The `tools/` directory represents the offline execution, testing, and data-gathering division of the OneRail ecosystem. 

## The Difference: Tools vs. Scripts
In the OneRail architecture, we explicitly split our offline pipeline into two folders (`tools/` and `web/scripts/`). What is the difference?

### 1. `tools/` (The Foragers & Investigators)
* **What they do:** They talk to the outside world (IndiaRailInfo, OSM Overpass APIs), pull down raw HTML/JSON, manipulate DOMs, and manage headless browsers.
* **Tech Stack:** They are purely vanilla JavaScript (`.mjs`) nodes. They run natively (`node tools/script_name.mjs`).
* **The Goal:** Build the "Bronze" and "Silver" layers locally inside `.tmp/`. Historically, tools were meant to strictly avoid database imports, however, a few hybrid DB tools live here from early prototyping (e.g. `merge_and_import...`).

### 2. `web/scripts/` (The Internal Database Mappers)
* **What they do:** They take the locally saved data (the `.tmp/` caches) and map them into the complex relational Postgres database.
* **Tech Stack:** They are TypeScript (`.ts`) utilities tightly bound to the Next.js `src` environment and executed via `tsx` because they rely comprehensively on Prisma ORM type-safety.

---

## The Complete Tool Roster

Every `.mjs` file inside `tools/` serves a specific purpose in the greater ingestion matrix. 

### 🚆 1. Passenger Schedule Extraction
*   📖 **`scrape_all_trains.mjs`**: The batched HTML DOM scraper parsing IndiaRailInfo. [Read Arch](./tool_scrape_all_trains.md)
*   📖 **`silver_transform.mjs`**: The regex normalization engine that scrubs raw DOMs into DB-ready JSONs. [Read Arch](./tool_silver_transform.md)

### 🚨 2. Auditing & Resilience
*   📖 **`audit_ids.mjs` / `scrape_missing.mjs`**: The suite that verifies local file integrity against a 25,000 ID count limit and initiates rescue API scrapes on failures. [Read Arch](./tool_audit_and_rescue.md)

### 🗺️ 3. Cartographic & Spatial Fetchers
*   📖 **`osm_atlas_scraper.mjs`**: A fast bounding-box REST scraper meant for localized city testing. [Read Arch](./script_osm_atlas_scraper.md)
*   📖 **`scrape_india_osm.mjs`**: A grid-based massive parallel fetcher. Slices the Indian subcontinent into 4°×4° tiles to bypass API rate limits on Overpass. [Read Arch](./tool_scrape_india_osm.md)

### 🛠️ 4. Experimental & Investigator Tools
These scripts are meant for dev-ops analysis, reverse engineering payloads, or running early database injection logic. 
*   **`atlas_investigator.mjs`**: Uses `puppeteer` to spin up a headless Chrome map to intercept XHR network payloads from external websites to analyze their internal GeoJSON schemas.
*   **`fetch_atlas_assets.mjs` / `fetch_test_html.mjs`**: Rapid simple `curl`-like equivalents fetching discrete HTML elements for testing Cheerio matching rules offline.
*   **`debug_html.mjs`**: Analyzes the raw downloaded `.html` trees locally to find missing tags where upstream pages broke.
*   **`explore_atlas.mjs`**: Simulates User-Agents to dump external mapping frontends into `.tmp/` for reverse engineering.
*   📖 **`merge_and_import_osm.mjs`**: *[Hybrid DB Script]* The specific Prisma importer designed to ingest the output from `scrape_india_osm.mjs`. [Read Arch](./tool_scrape_india_osm.md)
*   **`import_osm_atlas.mjs` / `import_pbf_atlas.mjs`**: Legacy `.mjs` versions of the definitive TypeScript importers now actively residing in `web/scripts/`.

## Execution Pattern
Because these tools are pure JavaScript, they generally run instantly on the native V8 engine:
```bash
node tools/audit_ids.mjs 1 25000
```
*(Hybrid DB tools requiring Prisma will need `npx` prefixes to access the node_modules bindings).*

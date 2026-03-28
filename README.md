# OneRail 🚂

**OneRail** is a modern, high-performance comprehensive interactive railway dashboard and network atlas designed for rail fans, commuters, and developers. 

It aims to provide an incredibly fast, data-dense experience of the Indian Railway ecosystem, offering everything from deep train schedules and rake compositions to a fully explorable geographic topological map utilizing raw geodata from OpenStreetMap and portals like IndiaRailInfo.

## Core Features & Functionality

### 1. 🚆 Intelligent Rail Display & Timetables
The primary driver of the application—a blazing-fast UI designed to search, display, and analyze train paths across the country.
* **Smart Search:** Find trains dynamically by their 5-digit number or name utilizing a highly optimized Next.js API.
* **Deep Schedule Matrix:** View the complete breakdown of a train's journey, including every halt, arrival/departure minute offsets, distance traveled (in KM), day increments, and platform numbers.
* **Rake & Coach Intelligence:** Granular visibility into the physical rake composition (e.g., how many 3ACs vs. Sleeper coaches, their sequence labels), alongside rake-sharing (RSA) group identification.
* **Amenities & Specs:** Instantly know locomotive details, max permissible speeds, pantry menus, bedroll availability, and the train's inaugural history.

### 2. 🗺️ Interactive Railway Atlas
The visual mapping companion to the tabular data—a high-framerate, vector-rendered cartographic view built on MapLibre GL.
* **Dynamic Network Graph:** Visualize the entire Indian contiguous track topology seamlessly from a bird's-eye view down to the junction level.
* **Client-Side Layering:** Toggles for complex infrastructure states: filter lines by gauge size (Broad vs. Narrow gauge) or by their operational status (Operational vs. Under Construction) without server round-trips.
* **Viewport Culling:** Backed by an algorithmic API that intelligently limits database polling to bounded geographic screens, mitigating client memory bloat.

### 3. ⚙️ Custom ETL Pipelines (The "Bronze to Gold" Model)
A standalone Node.js toolset designed to scrape, sanitize, and normalize raw HTML and GeoJSON payloads into relational PostgreSQL perfection without manual DB entry.

---

## Architecture & Data Flow

OneRail relies on a multi-stage data ingestion pipeline:
1. **Bronze (Ingestion):** Raw data scraped via OpenStreetMap (Overpass API) and custom Cheerio bots iterating over legacy railway portals.
2. **Silver (Transformation):** Heavy-lifting Regex sanitization and time-normalization formatting. 
3. **Gold (Storage):** Filtered spatial data and schedule routing arrays are injected into a relational PostgreSQL database utilizing Prisma ORM.
4. **Delivery:** A highly-optimized Next.js routing architecture delivers standardized payloads to the frontend UX elements and MapLibre clients.

For comprehensive deep dives into the engineering decisions, read our official internal manuals:
- 📖 [Technical Source of Truth](./docs/technical_source_of_truth.md)
- 📖 [Database Architecture & Relationship Mapping](./docs/database_source_of_truth.md)
- 📖 [IndiaRailInfo ETL Ingestion Pipeline](./docs/iri_etl_pipeline.md)
- 📖 [Atlas GeoJSON Stream Service](./docs/atlas_geojson_service.md)

---

## Getting Started

### Prerequisites
- **Node.js**: v18+ recommended
- **PostgreSQL**: Local database instance running

### 1. Database Setup
Ensure you configure your `.env` to point to your target local PostgreSQL database inside the `web/` folder:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/onerail"
```
Run the Prisma ORM commands to establish your database schema:
```bash
cd web
npx prisma db push
```

### 2. Seeding Data (The Pipeline)
Extract and parse the raw railway map data utilizing our ETL tools:
```bash
# 1. Start the schedule data scraper (IndiaRailInfo)
node tools/scrape_all_trains.mjs 1 500 10

# 2. Scrape geographical bounds from OpenStreetMap
node tools/osm_atlas_scraper.mjs

# 3. Transform raw train schedules to normalized Silver records
node tools/silver_transform.mjs

# 4. Seed PostgreSQL geometry matching records
cd web
npx tsx scripts/import_osm_atlas.ts ../.tmp/osm_railways_config.json
```

### 3. Run the UI / Backend
Fire up the Next.js frontend and dashboard app:
```bash
cd web
npm run dev
```
Navigate to `http://localhost:3000/` for the Train Search view or `http://localhost:3000/atlas` to explore the geographic network.

## Project Structure
* **`web/`** - The Next.js client, Prisma schema, frontend pages (`/train/[number]`, `/atlas`), and core APIs.
* **`tools/`** - Standalone Node.js scripting utilities for web scraping, transformation, and API interactions.
* **`docs/`** - Architectural documentation, system design, and source of truth records.

## Contributing
All development discussions and in-depth implementations are documented regularly. See `ROADMAP.md` for upcoming enhancements and planned features!

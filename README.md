# OneRail

**OneRail** is an open-source, high-performance Indian Railways information platform — combining deep train schedule intelligence with a fully explorable geographic network atlas.

It aims to be the fastest, most data-dense way to explore the Indian Railway ecosystem: from 5-digit train numbers and rake compositions to a vector-rendered map of the entire national track topology built from OpenStreetMap data.

---

## Features

### Train Search & Schedules
- Search trains by 5-digit number or name
- Full stop-by-stop schedule with arrival/departure times, platform numbers, and distance from source
- Day-increment tracking for overnight and multi-day journeys
- Technical halts filtered out by default

### Rake & Coach Intelligence
- Coach composition per train (class, label, position, seat count)
- Rake Sharing Association (RSA) group identification — see which trains share the same physical rake

### Interactive Railway Atlas
- Vector-rendered map of the national rail network built with MapLibre GL
- Filter by gauge (Broad/Metre/Narrow), operational status, and electrification
- Viewport culling — the API only returns data for the visible bounding box, keeping the map fast at all zoom levels
- Junction and hub markers with station names

### Custom ETL Pipeline
- Medallion architecture (Bronze → Silver → Gold) for scraping, cleaning, and importing data
- IndiaRailInfo scraper with audit/rescue for handling gaps
- OpenStreetMap PBF parser for bulk geographic track data
- Logical track section generator grouping raw OSM geometry into station-to-station corridors

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, MapLibre GL, Zustand, Tailwind CSS |
| Backend | Next.js API Routes, PostgreSQL 14+, Prisma 7 |
| Data Pipeline | Node.js, Cheerio (scraping), osm-pbf-parser |
| Language | TypeScript throughout |

---

## Architecture Overview

```
IndiaRailInfo ──► scrape_all_trains ──► .tmp/raw/  (Bronze)
                                              │
                                    silver_transform
                                              │
                                        .tmp/silver/  (Silver)
                                              │
                                    import_bulk_sql
                                              │
OpenStreetMap ──► osm_atlas_scraper ──► import_osm_atlas
                                              │
                                        PostgreSQL  (Gold)
                                              │
                                    Next.js API Routes
                                              │
                                    React + MapLibre GL
```

For a deeper dive: [Technical Source of Truth](./docs/technical_source_of_truth.md)

---

## Quick Start

See the full setup guide at [`docs/getting_started.md`](./docs/getting_started.md).

**Short version:**

```bash
# 1. Install dependencies
cd web && npm install
cd ../tools && npm install

# 2. Configure environment
echo 'DATABASE_URL="postgresql://user:pass@localhost:5432/onerail"' > web/.env

# 3. Create database schema
cd web && npx prisma db push

# 4. Scrape a small dataset to get started
cd ../tools && node scrape_all_trains.mjs 1 500 5
node silver_transform.mjs

# 5. Import into PostgreSQL
cd ../web && npx tsx scripts/import_bulk_sql.ts

# 6. Run the app
npm run dev
```

Open `http://localhost:3000`.

---

## Documentation

| Document | Description |
|---|---|
| [`docs/getting_started.md`](./docs/getting_started.md) | Full local setup guide for new contributors |
| [`docs/technical_source_of_truth.md`](./docs/technical_source_of_truth.md) | Architecture deep dive |
| [`docs/database_source_of_truth.md`](./docs/database_source_of_truth.md) | Complete data model reference |
| [`docs/iri_etl_pipeline.md`](./docs/iri_etl_pipeline.md) | IndiaRailInfo scraping pipeline |
| [`docs/atlas_geojson_service.md`](./docs/atlas_geojson_service.md) | Atlas map API |
| [`docs/scripts_master_guide.md`](./docs/scripts_master_guide.md) | All scripts reference |
| [`docs/tools_master_guide.md`](./docs/tools_master_guide.md) | All ETL tools reference |
| [`ROADMAP.md`](./ROADMAP.md) | Planned features and known gaps |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to contribute |

---

## Project Structure

```
OneRail/
├── web/                    # Next.js app (frontend + API + DB)
│   ├── src/app/            # Pages and API routes
│   ├── src/components/     # React components
│   ├── src/lib/            # Prisma client, utils, cache
│   ├── prisma/             # schema.prisma and migrations
│   └── scripts/            # Data processing scripts
├── tools/                  # ETL scrapers and transformers
├── docs/                   # Architecture documentation
└── .tmp/                   # Ephemeral scraper output (gitignored)
```

---

## Current Data Coverage

| Entity | Count |
|---|---|
| Trains | ~6,700 (partial — target 13,000+) |
| Stations | ~9,900 real + ~135,000 OSM geometry nodes |
| Track Segments | ~101,000 |
| Track Sections | Regenerated on each pipeline run |

Train coverage is currently limited to IndiaRailInfo internal IDs 1–13,000. Full national coverage (target: IDs 1–50,000) is an ongoing data engineering effort.

---

## Contributing

OneRail is open to contributions of all kinds — bug fixes, new features, data pipeline improvements, and documentation. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a PR.

For planned work, see [`ROADMAP.md`](./ROADMAP.md). For bugs or feature ideas, open a [GitHub Issue](../../issues).

---

## License

[MIT](./LICENSE)

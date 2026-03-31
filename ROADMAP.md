# OneRail Roadmap

This document tracks the current state of the project and planned work. Items are organized by area — data engineering, application features, and infrastructure.

---

## Current State (as of March 2026)

### Data
- **Trains:** ~6,700 imported (IndiaRailInfo IDs 1–13,000). Full coverage target is ~13,000–14,000 active trains across all zones.
- **Stations:** ~9,900 real stations + ~135,000 OSM geometry nodes (virtual hubs).
- **Track Geometry:** ~101,000 segments covering a significant portion of the national network from OSM PBF data.
- **Track Sections:** Logical station-to-station corridors generated from raw segments. Regenerated via `generate_sections.ts`.
- **Zone data:** All 18 Indian Railways zones seeded.

### Application
- Train search by number and name ✅
- Global search dropdown in navbar ✅
- Train detail page (schedule, coach composition, rake sharing) ✅
- Station detail page ✅
- Interactive Atlas map with MapLibre GL ✅
- Atlas: gauge, status, and electrification filters ✅
- Atlas: junction/hub markers with labels ✅
- Atlas: viewport culling to limit payload size ✅

---

## In Progress

- [ ] **Complete train data scrape** — Run `scrape_all_trains.mjs` to IDs 1–50,000 to reach full national coverage. Zone codes need backfilling once all trains are imported.
- [ ] **Track section quality** — `generate_sections.ts` now correctly anchors sections at real stations. Validate output quality and fix edge cases (isolated loops, very long sections).

---

## Backlog: Data Engineering

### Bronze Layer
- [ ] Scrape IndiaRailInfo IDs 13,000 → 50,000
- [ ] Backfill `zone_code` on all Train records (currently null for all trains)
- [ ] Scrape intermediate stations (full stop list) for trains that have `intermediate_stations` count but missing stops

### Silver Layer
- [ ] Improve train type classification (currently relies on name patterns; improve accuracy)

### Gold Layer
- [ ] Backfill station coordinates for the ~400 real stations still missing lat/lon
- [ ] Populate `mps` (max permissible speed) on TrackSection from timetable data where available
- [ ] Tag `is_terminus` on Station records more comprehensively

---

## Backlog: Application Features

### Search
- [ ] **Route search** — Find all trains between two stations on a given day, respecting `run_days` bitmask
- [ ] **Intermediate station search** — Search stations along a route (not just endpoints)

### Train Detail
- [ ] **Live running status** — Integrate or simulate real-time position from NTES
- [ ] **Collapsible intermediate stops** — Show/hide technical halts inline

### Atlas
- [ ] **Section-level rendering** — Render `TrackSection` corridors instead of raw segments for better performance at low zoom
- [ ] **Train path overlay** — Click a train and highlight its route on the map
- [ ] **Station search on map** — Click a station marker to navigate to its detail page
- [ ] **Under construction lines** — Distinct visual style for proposed/under construction track

### Station Detail
- [ ] **Trains through station** — List all trains calling at a station with times
- [ ] **Zone map context** — Show the station's position within its zone

---

## Backlog: Infrastructure

- [ ] **LICENSE file** — Add MIT license
- [ ] **CI/CD** — GitHub Actions for lint + type-check on PRs
- [ ] **`.env.example`** — Add example env file so new contributors know what's needed
- [ ] **Docker setup** — `docker-compose.yml` for PostgreSQL + Next.js for zero-friction local setup

---

## Key Design Decisions (Locked)

1. **Time representation:** All times stored as `mins_from_midnight` (Int) — enables efficient SQL window functions and cross-midnight arithmetic.
2. **Technical halts:** Flagged in DB (`is_technical_halt`), hidden by default in all UI views.
3. **Virtual hubs:** OSM geometry nodes without a matching real station code are stored as `Station` records with `OSM_<id>` codes. This keeps the `TrackSegment` FK constraints valid without polluting the real station namespace.
4. **GeoJSON storage:** `path_coordinates` stored as JSONB arrays of `[lon, lat]` pairs (not PostGIS geometry). Simpler MapLibre GL integration with no PostGIS dependency.
5. **Prisma 7 + driver adapter:** Direct URL connection removed in Prisma 7; uses `@prisma/adapter-pg` wrapping a `pg.Pool`. All DB access goes through `src/lib/prisma.ts`.
6. **Track Sections:** Logical groupings of segments between real stations (or OSM topological junctions where no real station exists). Generated, not scraped — can always be regenerated from segments.

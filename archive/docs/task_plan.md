# OneRail — Task Plan

## Phase 0: Initialization ✅ (In Progress)
- [x] Create `gemini.md` (Project Constitution)
- [x] Create `task_plan.md`
- [x] Create `findings.md`
- [x] Create `progress.md`
- [ ] Discovery Questions answered & approved
- [ ] Data Schema confirmed in `gemini.md`

---

## Phase 1: B — Blueprint
- [ ] Define pages + user flows (Train Search, Train Page, Station Page)
- [ ] Finalize DB schema in `gemini.md`
- [ ] Define scraper targets and data sources
- [ ] Define `architecture/` SOPs for each tool

---

## Phase 2: L — Link
- [ ] Set up local PostgreSQL instance
- [ ] Verify Prisma can connect
- [ ] Scaffold `tools/` directory with minimal connection test scripts
- [ ] Validate scraper can reach IndiaRailInfo (rate limit awareness)

---

## Phase 3: A — Architect (3-Layer Build)
### Layer 1: Architecture SOPs
- [ ] `architecture/train_scraper.md`
- [ ] `architecture/station_scraper.md`
- [ ] `architecture/db_import.md`
- [ ] `architecture/search_api.md`

### Layer 2: Navigation (Next.js API Routes)
- [ ] `GET /api/search` — Train search between two stations
- [ ] `GET /api/train/[number]` — Full train detail
- [ ] `GET /api/station/[code]` — Station detail + departures

### Layer 3: Tools (Python Scrapers)
- [ ] `tools/scrape_stations.py`
- [ ] `tools/scrape_trains.py`
- [ ] `tools/scrape_schedule.py`
- [ ] `tools/scrape_coach.py`
- [ ] `tools/import_to_db.py`

---

## Phase 4: S — Stylize
- [ ] Design system (colors, typography, components)
- [ ] Train Search page UI
- [ ] Train Detail page UI
- [ ] Station Detail page UI
- [ ] Mobile responsive audit

---

## Phase 5: T — Trigger
- [ ] Deploy Next.js to Vercel
- [ ] Deploy PostgreSQL to Railway/Supabase
- [ ] Set up monthly scraper cron job
- [ ] Final documentation in `gemini.md`

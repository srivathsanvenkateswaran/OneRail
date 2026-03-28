# Getting Started with OneRail

This guide walks you through setting up a full local development environment from scratch — database, data pipeline, and web app. By the end you should have the app running at `localhost:3000` with real data.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | v18+ | Runtime for web app and scripts |
| npm | v9+ | Package manager |
| PostgreSQL | v14+ | Primary database |
| Git | Any | Version control |

> **Windows note:** All shell commands below use Unix syntax (forward slashes, bash). On Windows, use Git Bash, WSL, or the VS Code integrated terminal.

---

## 1. Clone the Repository

```bash
git clone https://github.com/<your-org>/OneRail.git
cd OneRail
```

---

## 2. Set Up PostgreSQL

Make sure PostgreSQL is running locally. Create a database:

```bash
# Connect to postgres as superuser
psql -U postgres

# Inside psql:
CREATE DATABASE onerail;
\q
```

---

## 3. Configure Environment Variables

```bash
cd web
cp .env.example .env   # if .env.example exists, otherwise create .env
```

Edit `web/.env`:

```env
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/onerail"
```

Replace `<user>` and `<password>` with your PostgreSQL credentials.

---

## 4. Install Dependencies

```bash
# Web app dependencies
cd web
npm install

# ETL tools dependencies
cd ../tools
npm install
```

---

## 5. Initialize the Database Schema

From the `web/` directory:

```bash
npx prisma db push
```

This reads `prisma/schema.prisma` and creates all tables in your local database. You should see all models created without errors.

> **Prisma 7 note:** OneRail uses Prisma 7 with the `@prisma/adapter-pg` driver adapter. The connection is configured in `src/lib/prisma.ts` — do not instantiate `PrismaClient` directly elsewhere.

---

## 6. Seed Data (The ETL Pipeline)

The app needs data to be useful. The pipeline runs in three stages: Bronze → Silver → Gold.

### Stage 1 — Bronze: Scrape Train Schedules

This scrapes train data from IndiaRailInfo by internal ID. Each ID maps to one train.

```bash
cd tools

# Scrape IDs 1 to 500, with concurrency of 5 (good for testing)
node scrape_all_trains.mjs 1 500 5
```

Raw JSON files land in `.tmp/raw/trains_by_id/`. This can take a while for large ranges — the full dataset (IDs 1–50,000) takes several hours.

To check and fill any gaps in the scrape:
```bash
node audit_ids.mjs         # generates .tmp/missing_ids.txt
node scrape_missing.mjs    # re-scrapes only the gaps
```

### Stage 2 — Silver: Normalize & Clean

```bash
node silver_transform.mjs
```

This reads from `.tmp/raw/trains_by_id/` and writes cleaned records to `.tmp/silver/trains/`. It handles:
- Stripping Devanagari characters from train names
- Converting times to `mins_from_midnight` integers
- Validating stop sequences and distances

### Stage 3 — Gold: Import to PostgreSQL

```bash
cd ../web
npx tsx scripts/import_bulk_sql.ts
```

This imports trains and stops from the Silver layer into PostgreSQL.

### Geographic Data (Atlas)

To populate the interactive map, you need OpenStreetMap track geometry:

```bash
cd tools

# Option A: Scrape a small bounding box (fast, good for testing)
node osm_atlas_scraper.mjs

# Option B: Full India grid scrape (slow, ~hours)
node scrape_india_osm.mjs
```

Then import into the database:

```bash
cd ../web
npx tsx scripts/import_osm_atlas.ts ../.tmp/<output_file>.json
```

Finally, generate logical track sections (groups of segments between stations):

```bash
npx tsx scripts/generate_sections.ts --skip-clear
```

---

## 7. Run the Web App

```bash
cd web
npm run dev
```

Open your browser:
- `http://localhost:3000` — Train search
- `http://localhost:3000/atlas` — Interactive railway map
- `http://localhost:3000/train/12658` — Example train detail page
- `http://localhost:3000/station/MAS` — Example station page

---

## 8. Project Structure Cheat Sheet

```
OneRail/
├── web/                        # Next.js application
│   ├── src/
│   │   ├── app/                # Pages and API routes
│   │   │   ├── api/            # REST endpoints
│   │   │   ├── atlas/          # Interactive map page
│   │   │   ├── train/[number]/ # Train detail page
│   │   │   └── station/[code]/ # Station page
│   │   ├── components/         # Shared React components
│   │   └── lib/                # prisma.ts, utils, cache
│   ├── prisma/
│   │   └── schema.prisma       # Database schema (source of truth)
│   └── scripts/                # Data processing scripts
├── tools/                      # ETL scrapers and transformers
├── docs/                       # Architecture documentation
└── .tmp/                       # Ephemeral scraper output (gitignored)
```

---

## Common Issues

### `PrismaClientInitializationError` on startup
Prisma 7 requires a driver adapter. Make sure `DATABASE_URL` is set in `web/.env` and you're using the `PrismaClient` from `src/lib/prisma.ts` (not creating a new instance).

### Prisma Studio shows nothing
Prisma Studio doesn't support driver adapters (a Prisma 7 limitation). Use a DB client like DBeaver or the SQLTools VS Code extension instead.

### Map shows no tracks
The Atlas page requires `TrackSegment` records with `path_coordinates` populated. Run the OSM import pipeline (Step 6, Geographic Data) first.

### Missing station coordinates
Run the coordinate recovery script:
```bash
cd web
npx tsx scripts/bulk_recover_geography.js
```

### Database locked / queries hanging
Check for stuck transactions in your DB client and terminate them. In DBeaver: right-click the connection → **Active Queries** → kill any long-running ones.

---

## Next Steps

- Read [`docs/technical_source_of_truth.md`](./technical_source_of_truth.md) for a deep dive into the architecture.
- Read [`docs/database_source_of_truth.md`](./database_source_of_truth.md) for the full data model.
- Check [`ROADMAP.md`](../ROADMAP.md) for planned features you could pick up.
- Check [`CONTRIBUTING.md`](../CONTRIBUTING.md) for how to submit changes.

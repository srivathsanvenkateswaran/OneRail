---
description: Data pipeline workflow from scraping (Bronze) to DB (Gold)
---

# OneRail Data Pipeline Workflow

This workflow describes the process of moving data through the Medallion architecture (Bronze -> Silver -> Gold).

## 1. Bronze Layer: Data Harvesting
The Bronze layer contains raw JSON data scraped from IndiaRailInfo based on internal IDs.

### 1.1 Fresh Scrape
Run the full scraper to fetch train data for a range of IDs.
```powershell
node tools/scrape_all_trains.mjs
```

### 1.2 Audit and Rescue
If there are failures or gaps, use the audit and rescue tools:
1. Identify missing IDs:
   ```powershell
   node tools/audit_ids.mjs
   ```
2. Scrape missing/failed IDs specifically:
   ```powershell
   node tools/scrape_missing.mjs
   ```

**Output**: Raw JSON files in `.tmp/raw/trains_by_id/`.

---

## 2. Silver Layer: Normalization & Cleaning
The Silver layer transforms raw, messy data into a clean, standardized format suitable for the application.

### 2.1 Run Transformation
This script applies regex-based cleaning (handling messy titles, bilingual text, etc.) and validates data integrity.
```powershell
node tools/silver_transform.mjs
```

**Output**: Standardized JSON files in `.tmp/silver/trains/`.

---

## 3. Gold Layer: Bulk Ingestion (PostgreSQL)
The Gold layer is the source for the application, stored in PostgreSQL for efficient querying.

### 3.1 Bulk Import
Run the importer script to sync the Silver JSON files into the database.
// turbo
```powershell
cd web
npx tsx scripts/import_bulk_sql.ts
```

**Result**: Populated `Train`, `Station`, `TrainStop`, and `CoachConfig` tables in PostgreSQL.

---

## Summary of Commands
| Layer | Step | Command |
| :--- | :--- | :--- |
| **Bronze** | Harvest | `node tools/scrape_all_trains.mjs` |
| **Silver** | Standardize | `node tools/silver_transform.mjs` |
| **Gold** | Ingest | `npx tsx scripts/import_bulk_sql.ts` (from `web/`) |

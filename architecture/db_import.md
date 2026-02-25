# Architecture SOP: DB Import
**Layer:** 1 — Architecture
**Status:** Draft

---

## Goal
Validate and import all scraped JSON files from `.tmp/raw/` into the PostgreSQL database via Prisma.

## Input Order (must follow this sequence — foreign key dependencies)
1. `zones.json` (static file, not scraped — defines all 18 zones)
2. `.tmp/raw/stations/*.json` → `Station` table
3. `.tmp/raw/trains/*.json` → `Train` table
4. `.tmp/raw/schedules/*.json` → `TrainStop` + `CoachConfig` tables

## Validation Rules (run BEFORE any DB write)
- station_code: must be 2–7 uppercase alphanumeric characters
- train_number: must be 5 digits
- latitude: -90 to 90, longitude: 0 to 180 (India range: lat 8–37, lon 68–97)
- arrival_time_mins / departure_time_mins: must be ≥ 0
- stop_sequence: must be unique per train_number (enforced by DB constraint)

## Steps
1. `python tools/import_to_db.py --entity zones` → seed Zone table
2. `python tools/import_to_db.py --entity stations` → upsert Station table
3. `python tools/import_to_db.py --entity trains` → upsert Train table
4. `python tools/import_to_db.py --entity schedules` → upsert TrainStop + CoachConfig

## Upsert Policy
- Use **upsert** (not insert) on all entities — re-running the importer is always safe.
- On conflict, update all fields (the scraped data is assumed to be the latest truth).

## Error Handling
- Validation failures → log to `.tmp/logs/import_errors.json`, skip the record, continue
- DB connection failure → abort immediately, do not partially import
- After import: write a summary to `.tmp/logs/import_summary_{timestamp}.json`

## Learnings
*(Updated as errors are encountered during the Repair Loop)*

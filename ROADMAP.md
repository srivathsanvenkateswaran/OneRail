# OneRail: Data Engineering & Implementation Roadmap

This document tracks the tasks and architectural decisions for the OneRail Indian Railways data platform.

## 🛠 Currently Running
- [ ] **Data Harvesting (Bronze Layer)**: Scraping IndiaRailInfo by ID (`tools/scrape_all_trains.mjs`).
  - Target: IDs 1 - 50,000.
  - Current Status: Mining in progress.

## 📋 Backlog: Data Engineering
### Phase 1: Normalization & Cleaning (Silver Layer)
- [x] **Schema Support for Rich Data**: 
  - Added `rake_share_text` to Train.
  - Added `xing` and `intermediate_stations` to TrainStop.
- [x] **Robust Transformer Module (`silver_transform.mjs`)**: 
  - Extracts clean `train_name` and `train_number` from messy titles via Regex.
  - Standardizes Coach CSS classes to codes.
  - Validates data integrity (distance checks, stop counts).
- [x] **ID Audit & Rescue**:
  - `tools/audit_ids.mjs`: Detects gaps in the bronze layer.
  - `tools/scrape_missing.mjs`: Fills the gaps efficiently.

### Phase 2: Bulk Ingestion (Gold Layer)
- [x] **Optimized Importer (`import_bulk_sql.ts`)**: 
  - Native PG SQL ingestion for high-speed loading.
  - Handles logical transactions and complex upserts.
- [x] **Station Master Resolution**:
  - Normalized station codes as the source of truth across all datasets.

## 📋 Backlog: Application Features
### Done ✅
- [x] **Train Search API**: Multi-parameter search (Number, Name).
- [x] **Global Search UI**: Premium, high-speed dropdown search in nav.
- [x] **Train Detail Page**: Comprehensive view of schedule and rake composition.

### Pending ⏳
- [ ] **Topological Map View**:
  - Use `intermediate_stations` counts to interpolate path density between major waypoints.
  - Integrate MapLibre for visualizing the national rail network.
- [ ] **Live "Running Status"**: Integrated or simulated status updates.

## 📝 Key Design Decisions
1. **Time Representation**: All times stored as `mins_from_midnight` (Int) for efficient SQL filtering and cross-day calculation.
2. **Technical Halts**: Flagged in DB, hidden by default in the UI.
3. **Database**: PostgreSQL with Prisma ORM for type-safe relational modeling.
4. **Architecture**: Medallion architecture (Bronze -> Silver -> Gold).

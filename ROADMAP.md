# OneRail: Data Engineering & Implementation Roadmap

This document tracks the tasks and architectural decisions for the OneRail Indian Railways data platform.

## 🛠 Currently Running
- [ ] **Data Harvesting (Bronze Layer)**: Scraping IndiaRailInfo by ID (`tools/scrape_all_trains.mjs`).
  - Target: IDs 1 - 25,000.
  - Current Batch: 1,000 - 2,000.

## 📋 Backlog: Data Engineering
### Phase 1: Normalization & Cleaning (Silver Layer)
- [ ] **Schema Support for Rich Data**: (DONE ✅)
  - Added `rake_share_text` to Train.
  - Added `xing` and `intermediate_stations` to TrainStop.
- [ ] **Robust Transformer Module**: Build a dedicated cleaning layer that:
  - Extracts clean `train_name` and `train_number` from messy titles via Regex.
  - Standardizes Coach CSS classes (e.g., `gen`, `sl`, `cc`) to internal enums.
  - Validates data integrity (detects missing stops or distance anomalies).
  - Handles "Imaginary" train flagging.
- [ ] **Station Master Resolution**:
  - Implement logic to ensure unique station codes (`MAS`, `NDLS`) are the source of truth, even if station names differ slightly between logs.

### Phase 2: Bulk Ingestion (Gold Layer)
- [ ] **Optimized Importer**: 
  - Fix Prisma v7 initialization in `import_train.ts`.
  - Implement bulk-insert/transaction logic to handle processing 1000+ files in seconds rather than minutes.
- [ ] **Idempotency Checks**: Ensure every data point can be re-run without duplication.

## 📋 Backlog: Application Features
- [ ] **Train Search API**: Multi-parameter search (Number, Name, Source/Dest).
- [ ] **Rake Visualization**: Frontend component to render the `rake_composition` JSON into a visual train layout.
- [ ] **Topological Map View**:
  - Use `intermediate_stations` counts to interpolate path density between major waypoints.
  - Integrate MapLibre for visualizing the national rail network.

## 📝 Key Design Decisions
1. **Time Representation**: All times stored as `mins_from_midnight` (Int) for efficient SQL filtering and cross-day calculation.
2. **Technical Halts**: Flagged in DB, hidden by default in the UI.
3. **Database**: PostgreSQL with Prisma ORM for type-safe relational modeling.

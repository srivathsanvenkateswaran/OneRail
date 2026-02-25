# OneRail — Findings & Research

## Data Sources

### Primary: IndiaRailInfo (indiarailinfo.com)
- Most comprehensive crowd-sourced Indian Railways database
- Contains: stations, schedules, coach composition, rake sharing, loco details, track type
- UI is dense/dated — this is exactly the gap OneRail aims to fill
- **Rate limiting:** Unknown — must test cautiously. Use delays between requests.
- **Scraping approach:** BeautifulSoup for static pages, Playwright for JS-rendered pages

### Secondary: data.gov.in
- Indian Railways publishes open datasets here (station coordinates, zone mapping)
- Useful for seeding baseline station data (lat/long, state, zone)
- URL: https://data.gov.in/catalog/indian-railways

### Reference: NTES (National Train Enquiry System)
- Official real-time running status source
- Not used in Phase 1 (we avoid real-time external calls)
- Could be integrated in a future "Live Tracking" phase

---

## Key Observations

### Volume Estimates
| Entity | Approximate Count |
|---|---|
| Stations | 7,000+ |
| Trains | 20,000+ |
| TrainStops (rows) | ~14M (avg 700 stops × 20,000 trains) |

### Performance Implications
- `TrainStop` table will be the largest — needs composite indexes on `(train_number, stop_sequence)` and `(station_code)`
- Train Search query is the most expensive: find all trains that have stop A before stop B. Needs careful indexing.
- Consider a **Materialized View** or a dedicated `StationTrainIndex` table for the Station page to avoid full table scans.

### Scraping Constraints
- Must respect robots.txt
- Add 1-2s delay between requests
- Store raw HTML in `.tmp/raw/` before parsing, so we can re-parse without re-fetching
- Session/cookie handling may be needed for IndiaRailInfo

---

## Open Questions (Discovery Phase)
*(To be answered by user — see current conversation)*
- Behavioral rules and tone of the UI
- Any "Do Not Show" data constraints
- Target deployment environment preferences
- Any specific train categories or zones to prioritize for initial data seeding

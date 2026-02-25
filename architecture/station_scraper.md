# Architecture SOP: Station Scraper
**Layer:** 1 — Architecture
**Status:** Draft

---

## Goal
Scrape all stations from the SR (Southern Railway) zone from IndiaRailInfo and produce structured JSON files in `.tmp/raw/stations/`.

## Input
- Zone code: `SR`
- Source URL pattern: `https://indiarailinfo.com/junction/{station_code}`
- Station list source: `https://indiarailinfo.com/zone/sr-southern-railway-stations`

## Output (JSON shape per station)
```json
{
  "station_code": "MAS",
  "station_name": "Chennai Central",
  "state": "Tamil Nadu",
  "zone_code": "SR",
  "latitude": 13.0827,
  "longitude": 80.2707,
  "elevation_m": 6,
  "station_category": "A1",
  "num_platforms": 17,
  "has_retiring_room": true,
  "has_waiting_room": true,
  "has_food_plaza": true,
  "has_wifi": true,
  "is_junction": false,
  "is_terminus": true
}
```

## Steps
1. Fetch station list page for SR zone → extract all station codes + names
2. For each station code, fetch the station detail page
3. Parse: coordinates, category, platforms, amenities, junctions
4. Write one JSON file per station to `.tmp/raw/stations/{station_code}.json`
5. Write a manifest `.tmp/raw/stations/_manifest.json` with count + timestamp

## Edge Cases & Learnings
- Add 1.5s delay between requests to avoid rate limiting
- Some stations have no coordinates — flag them with `latitude: null`
- Station codes may have aliases (e.g., "MAS" = "MS") — keep the primary code only
- Re-run safe: skip if `{station_code}.json` already exists (use `--force` flag to override)

## Rate Limiting Policy
- Max 1 request/1.5 seconds
- On HTTP 429: back off 30 seconds and retry up to 3 times
- Log all retries to `.tmp/logs/station_scraper.log`

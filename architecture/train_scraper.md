# Architecture SOP: Train Scraper
**Layer:** 1 — Architecture
**Status:** Draft

---

## Goal
Scrape all train metadata (not schedules) for trains originating from or passing through the SR zone.

## Input
- Zone: `SR`
- Source: IndiaRailInfo zone train listing pages

## Output (JSON shape per train)
```json
{
  "train_number": "12657",
  "train_name": "Chennai Central - Bengaluru City SF Express",
  "train_type": "Superfast Express",
  "source_station_code": "MAS",
  "destination_station_code": "SBC",
  "run_days": 127,
  "zone_code": "SR",
  "has_pantry": false,
  "locomotive_type": "Electric",
  "classes_available": ["2A", "3A", "SL", "GN"]
}
```

## Steps
1. Fetch SR zone train listing → extract list of train numbers
2. For each train number, fetch the train detail page
3. Parse: name, type, source, destination, run_days, pantry, loco type, classes
4. Write to `.tmp/raw/trains/{train_number}.json`
5. Write manifest to `.tmp/raw/trains/_manifest.json`

## run_days Bitmask Encoding
| Day | Bit |
|-----|-----|
| Mon | 1   |
| Tue | 2   |
| Wed | 4   |
| Thu | 8   |
| Fri | 16  |
| Sat | 32  |
| Sun | 64  |

Daily = 127, Mon+Thu = 9

## Edge Cases & Learnings
- Skip trains already in `.tmp/raw/trains/` unless `--force` flag passed
- Some trains are listed under SR but have a different home zone — record the home zone_code accurately
- Heritage/Tourist trains may have atypical types — store them accurately, UI will handle hiding

# Architecture SOP: Schedule Scraper
**Layer:** 1 — Architecture
**Status:** Draft

---

## Goal
For every train in `.tmp/raw/trains/`, scrape its full stop-by-stop schedule (all TrainStops) and coach composition.

## Input
- Train number list from `.tmp/raw/trains/_manifest.json`
- Source URL: `https://indiarailinfo.com/train/{train_number}/schedule`

## Output (JSON shape per train schedule)
```json
{
  "train_number": "12657",
  "stops": [
    {
      "stop_sequence": 1,
      "station_code": "MAS",
      "arrival_time_mins": null,
      "departure_time_mins": 370,
      "halt_duration_mins": 0,
      "day_number": 1,
      "distance_from_source_km": 0,
      "platform_number": "4",
      "is_technical_halt": false
    },
    {
      "stop_sequence": 2,
      "station_code": "MBM",
      "arrival_time_mins": 381,
      "departure_time_mins": 383,
      "halt_duration_mins": 2,
      "day_number": 1,
      "distance_from_source_km": 12,
      "platform_number": null,
      "is_technical_halt": false
    }
  ],
  "coach_config": [
    {
      "class_code": "GN",
      "coach_label": "GS1",
      "position_in_train": 1,
      "num_seats": 72
    }
  ],
  "rake_sharing": [
    "12658",
    "12659"
  ]
}
```

## Time Encoding Rule
- All times stored as **minutes from midnight of Day 1** (integer).
- Example: 06:10 = 370, 23:59 = 1439, 01:20 on Day 2 = 1520 (no reset — keep incrementing).
- Use `day_number` to show the correct calendar date to users.
- Source station: `arrival_time_mins = null`
- Destination station: `departure_time_mins = null`

## Steps
1. For each train number from manifest:
2. Fetch schedule page → parse stop table
3. Encode times per the rule above
4. Identify technical halts (IndiaRailInfo marks these explicitly)
5. Parse coach composition table
6. Parse rake sharing details (extract shared train numbers from the "Rake/Coach Position" section)
7. Write to `.tmp/raw/schedules/{train_number}.json`
8. Update manifest at `.tmp/raw/schedules/_manifest.json`

## Edge Cases & Learnings
- Overnight trains: times after midnight get incremented (don't reset to 0)
- Some trains skip platform data — leave as `null`
- Multi-day journeys: day_number resets at each station where the clock crosses midnight

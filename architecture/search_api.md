# Architecture SOP: Search API
**Layer:** 1 — Architecture
**Status:** Draft

---

## Goal
Power the Train Search page — find all trains running between two stations on a given day.

## Endpoint
`GET /api/search?from={station_code}&to={station_code}&date={YYYY-MM-DD}&class={class_code}`

## Parameters
| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `from` | ✅ | — | Departure station code |
| `to` | ✅ | — | Arrival station code |
| `date` | ✅ | — | Travel date (used to filter run_days bitmask) |
| `class` | ❌ | `all` | Filter by class availability |

## Response Shape
```json
{
  "from": { "code": "MAS", "name": "Chennai Central" },
  "to": { "code": "SBC", "name": "KSR Bengaluru" },
  "date": "2026-03-01",
  "day_of_week": "Sunday",
  "results": [
    {
      "train_number": "12657",
      "train_name": "Chennai Central - Bengaluru City SF Express",
      "train_type": "Superfast Express",
      "departure_time": "06:10",
      "arrival_time": "11:00",
      "duration_mins": 290,
      "distance_km": 362,
      "classes_available": ["2A", "3A", "SL", "GN"],
      "has_pantry": false,
      "runs_on_date": true
    }
  ],
  "total": 1
}
```

## Core Query Logic
```sql
-- Find trains with both a stop at FROM and a stop at TO,
-- where FROM stop_sequence < TO stop_sequence (correct direction)
SELECT
  t.*,
  s_from.departure_time_mins,
  s_to.arrival_time_mins,
  (s_to.distance_from_source_km - s_from.distance_from_source_km) AS distance_km
FROM "Train" t
JOIN "TrainStop" s_from ON s_from.train_number = t.train_number
  AND s_from.station_code = $from_code
JOIN "TrainStop" s_to   ON s_to.train_number = t.train_number
  AND s_to.station_code = $to_code
WHERE s_from.stop_sequence < s_to.stop_sequence
  AND (t.run_days & $day_bitmask) > 0
ORDER BY s_from.departure_time_mins ASC;
```

## Performance Notes
- The joint index `(train_number, station_code)` on TrainStop is critical for this query.
- Expected result set for SR zone: < 500ms with proper indexing.
- Add a 5-minute server-side cache (Next.js Route Cache) since schedule data is static.

## Learnings
*(Updated as errors are encountered)*

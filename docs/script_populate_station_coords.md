# Script Architecture: `populate_station_coords.ts`

## Executive Summary
Unlike `import_pbf_atlas.ts` which draws physical lines on the map, this script is explicitly built to find the absolute pinpoint coordinates (Lat/Long) for real-world Indian Railway stations and securely patch those coordinates into our schedule database without destroying the existing relational timetable grids.

## Architecture & Logic Flow

Because this script only looks for standalone points (Stations), it utilizes a heavily optimized **Single-Pass Streaming Architecture** against the OSM Protocolbuffer data.

**Logic Flow:**
1. **PBF Streaming:** Spawns a stream against the `india.osm.pbf` file via `osm-pbf-parser`.
2. **Node Filtering:** The generic parser yields `item` objects. The script specifically looks for `item.type === 'node'` layered with `item.tags.railway === 'station'` (or `halt`).
3. **IR Code Extraction:** OpenStreetMap volunteers meticulously tag stations with their official Indian Railway Codes (e.g., `MAS`, `NDLS`) under the `ref` key. The script isolates this tag, casts it to uppercase, and uses regex slicing (`split(/[,/]/)`) just in case volunteers tagged dual-code hubs.
4. **Memory Cache:** Valid nodes inject their exact `[item.lon, item.lat]` into a temporary JavaScript Hash Map (`stationCoords`).
5. **Database Patching:** The stream closes. The script iterates the Map arrays, running a Prisma `upsert` against the `Station` table matching exactly on the primary key `station_code`. 

## Seamless Timetable Integration

The genius of this script resides in the **Upsert Architecture**.
By the time this script runs, the database is typically already populated with thousands of `TrainStops` and `Station` nodes derived from IndiaRailInfo (via `scrape_all_trains.mjs`). However, IndiaRailInfo *lacks exact geographic coordinates*.
Instead of wiping the database, the `Prisma.upsert` selectively targets the matching `station_code`, updating the `latitude/longitude` rows silently in the background while keeping the relational Train Schedule matrices completely perfectly intact.

## Error Handing & Edge Cases

* **Missing Names:** If OSM contains the physical station coordinate and `ref` code but lacks the human readable `name`, the script injects `Unknown Station (CODE)` to prevent Prisma `String!` requirement crashes.
* **Orphaned OpenStreetMap Stops:** If OSM contains an obscure geographic halt code that doesn't exist in our IndiaRailInfo scraped schedules, Prisma treats it dynamically and uses `create` rather than `update` to add the new node blindly to the graph. 
* **CLI Progress Logging:** To prevent CLI buffer flooding (since parsing 100M+ nodes takes minutes), the `printProgress` utility leverages native `readline.cursorTo()` overrides to paint a static updating ticker rather than scrolling millions of shell rows into the void.

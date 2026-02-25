"""
scrape_stations.py — Scrape all station data for a given zone.

SOP: architecture/station_scraper.md

Usage:
    python scrape_stations.py --zone SR
    python scrape_stations.py --zone SR --force   # re-fetch even if cached
"""

import argparse
import json
import sys
from pathlib import Path

# Make sure sibling modules are importable
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    ZONE_CONFIG,
    ZONE_STATION_LIST_URL,
    STATION_URL,
    HTML_CACHE,
    STATIONS_DIR,
)
from utils import (
    RateLimitedSession,
    get_logger,
    save_json,
    load_json,
    update_manifest,
    validate_station_code,
    validate_coordinates,
)

logger = get_logger("scrape_stations")


# ─────────────────────────────────────────────
# Step 1: Get list of all station codes in the zone
# ─────────────────────────────────────────────

def fetch_station_list(session: RateLimitedSession, zone_code: str, force: bool) -> list[dict]:
    """
    Scrape the zone's station listing page and return a list of
    {"station_code": "MAS", "station_name": "Chennai Central"} dicts.

    IndiaRailInfo zone station page structure:
    - The page contains a table or list of stations with their codes and names.
    - Each row has: Station Code | Station Name | State | Zone
    - URL: https://indiarailinfo.com/zone/{zone_slug}-stations
    """
    zone_cfg = ZONE_CONFIG[zone_code]
    url = ZONE_STATION_LIST_URL.format(zone_slug=zone_cfg["slug"])
    soup = session.get(url, force=force)

    if not soup:
        logger.error(f"Could not fetch station list for zone {zone_code}")
        return []

    stations = []

    # IndiaRailInfo renders station lists in a table with class "trains" or similar.
    # The station code appears as a link text like "MAS", name follows in the next cell.
    # NOTE: Update selector if IndiaRailInfo's HTML structure changes.
    #       Run with --force to re-fetch and re-parse after any structure change.
    table = soup.find("table", class_="table")
    if not table:
        # Fallback: try any table on the page
        table = soup.find("table")

    if not table:
        logger.warning(f"No table found on station listing page for {zone_code}. Check HTML cache.")
        return []

    rows = table.find_all("tr")[1:]  # skip header row
    for row in rows:
        cols = row.find_all("td")
        if len(cols) < 2:
            continue

        # Station code is usually in the first column as a link
        code_cell = cols[0]
        name_cell = cols[1]

        code_link = code_cell.find("a")
        code = (code_link.text.strip() if code_link else code_cell.text.strip()).upper()
        name = name_cell.text.strip()

        if not validate_station_code(code):
            logger.warning(f"Skipping invalid station code: '{code}'")
            continue

        stations.append({"station_code": code, "station_name": name})

    logger.info(f"Found {len(stations)} stations for zone {zone_code}")
    return stations


# ─────────────────────────────────────────────
# Step 2: Scrape individual station detail page
# ─────────────────────────────────────────────

def scrape_station_detail(
    session: RateLimitedSession,
    station_code: str,
    station_name: str,
    zone_code: str,
    force: bool,
) -> dict | None:
    """
    Fetch and parse a single station's detail page on IndiaRailInfo.

    Extracts:
    - Coordinates (latitude, longitude) — often in a Google Maps link or meta tag
    - Station category (A1, A, B, C, D, E, F)
    - Number of platforms
    - State
    - Amenities: retiring room, waiting room, food plaza, Wi-Fi
    - Is junction / is terminus

    IndiaRailInfo station page URL: /junction/{lowercase_code}
    """
    out_path = STATIONS_DIR / f"{station_code}.json"
    if not force and out_path.exists():
        logger.debug(f"Skip (cached): {station_code}")
        return load_json(out_path)

    url = STATION_URL.format(station_code_lower=station_code.lower())
    soup = session.get(url, force=force)

    if not soup:
        logger.warning(f"Could not fetch station page for {station_code}")
        return None

    station = {
        "station_code": station_code,
        "station_name": station_name,
        "zone_code": zone_code,
        "state": None,
        "latitude": None,
        "longitude": None,
        "elevation_m": None,
        "station_category": None,
        "num_platforms": None,
        "has_retiring_room": False,
        "has_waiting_room": False,
        "has_food_plaza": False,
        "has_wifi": False,
        "is_junction": False,
        "is_terminus": False,
    }

    # ── Coordinates ──────────────────────────────────────────────────────────
    # IndiaRailInfo often embeds a Google Maps link with lat/lon in the URL.
    # e.g. href="https://maps.google.com/?q=13.0827,80.2707"
    maps_link = soup.find("a", href=lambda h: h and "maps.google.com" in h)
    if maps_link:
        try:
            query = maps_link["href"].split("?q=")[-1]
            lat_str, lon_str = query.split(",")
            lat, lon = float(lat_str.strip()), float(lon_str.strip())
            if validate_coordinates(lat, lon):
                station["latitude"] = lat
                station["longitude"] = lon
        except (ValueError, IndexError):
            logger.debug(f"Could not parse coordinates for {station_code}")

    # ── Station info table ────────────────────────────────────────────────────
    # Usually a definition list (dl/dt/dd) or a table with station metadata.
    info_table = soup.find("table", class_="station-info") or soup.find("dl")

    if info_table:
        text = info_table.text.lower()

        # Station category (A1, A, B, C, D, E, F)
        for cat in ["a1", "a", "b", "c", "d", "e", "f"]:
            if f"category {cat}" in text or f"category: {cat}" in text:
                station["station_category"] = cat.upper()
                break

        # Number of platforms
        import re
        plat_match = re.search(r"(\d+)\s+platform", text)
        if plat_match:
            station["num_platforms"] = int(plat_match.group(1))

        # Amenities — look for keywords in the page text
        full_text = soup.text.lower()
        station["has_retiring_room"] = "retiring room" in full_text
        station["has_waiting_room"] = "waiting room" in full_text
        station["has_food_plaza"] = any(x in full_text for x in ["food plaza", "food court", "cafeteria"])
        station["has_wifi"] = "wi-fi" in full_text or "wifi" in full_text

        # Is junction / terminus
        station["is_junction"] = "junction" in station_name.lower() or "jn" in station_name.lower()
        station["is_terminus"] = any(x in station_name.lower() for x in ["terminus", "terminal"])

    # ── State ─────────────────────────────────────────────────────────────────
    # State is usually in a breadcrumb or a small info block.
    state_el = soup.find(class_=lambda c: c and "state" in c.lower())
    if state_el:
        station["state"] = state_el.text.strip()
    else:
        # Fallback: try to find it in the page title or meta tags
        title = soup.find("title")
        if title and " - " in title.text:
            parts = title.text.split(" - ")
            # Typically: "Station Name - State - Zone Railway"
            if len(parts) >= 2:
                station["state"] = parts[1].strip()

    # Save to file
    save_json(out_path, station)
    logger.info(f"✓ Scraped station: {station_code} ({station_name})")
    return station


# ─────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape station data for a given Indian Railways zone.")
    parser.add_argument("--zone", required=True, help="Zone code, e.g. SR")
    parser.add_argument("--force", action="store_true", help="Re-fetch pages even if cached")
    args = parser.parse_args()

    zone_code = args.zone.upper()
    if zone_code not in ZONE_CONFIG:
        logger.error(f"Unknown zone: {zone_code}. Valid zones: {', '.join(ZONE_CONFIG.keys())}")
        sys.exit(1)

    session = RateLimitedSession(cache_dir=HTML_CACHE, logger=logger)

    # Step 1: Get station list
    stations = fetch_station_list(session, zone_code, args.force)
    if not stations:
        logger.error("No stations found. Aborting.")
        sys.exit(1)

    # Step 2: Scrape each station
    results = []
    for i, s in enumerate(stations, 1):
        logger.info(f"[{i}/{len(stations)}] {s['station_code']}")
        detail = scrape_station_detail(
            session,
            s["station_code"],
            s["station_name"],
            zone_code,
            args.force,
        )
        if detail:
            results.append(detail)

    # Step 3: Write manifest
    manifest_path = STATIONS_DIR / "_manifest.json"
    manifest_data = {
        "zone": zone_code,
        "total": len(results),
        "station_codes": [s["station_code"] for s in results],
    }
    save_json(manifest_path, manifest_data)

    logger.info(f"\n✅ Done. Scraped {len(results)}/{len(stations)} stations for zone {zone_code}.")
    logger.info(f"   Output:   {STATIONS_DIR}")
    logger.info(f"   Manifest: {manifest_path}")


if __name__ == "__main__":
    main()

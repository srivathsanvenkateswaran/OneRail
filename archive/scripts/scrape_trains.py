"""
scrape_trains.py — Scrape train metadata for a given zone.

SOP: architecture/train_scraper.md

Usage:
    python scrape_trains.py --zone SR
    python scrape_trains.py --zone SR --force
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import (
    ZONE_CONFIG,
    ZONE_TRAIN_LIST_URL,
    TRAIN_SCHEDULE_URL,
    HTML_CACHE,
    TRAINS_DIR,
    OBSCURE_TRAIN_TYPES,
    ALL_DAYS,
    DAY_BITS,
)
from utils import (
    RateLimitedSession,
    get_logger,
    save_json,
    load_json,
    parse_run_days,
    validate_train_number,
)

logger = get_logger("scrape_trains")

# ─────────────────────────────────────────────
# Train type normalisation map
# IndiaRailInfo uses various labels — we normalise them to a consistent set.
# ─────────────────────────────────────────────
TRAIN_TYPE_MAP = {
    "rajdhani express":   "Rajdhani",
    "shatabdi express":   "Shatabdi",
    "jan shatabdi":       "Jan Shatabdi",
    "vande bharat":       "Vande Bharat",
    "tejas express":      "Tejas",
    "duronto express":    "Duronto",
    "garib rath":         "Garib Rath",
    "double decker":      "Double Decker",
    "humsafar":           "Humsafar",
    "antyodaya":          "Antyodaya",
    "superfast express":  "Superfast Express",
    "superfast":          "Superfast Express",
    "express":            "Express",
    "intercity":          "Intercity Express",
    "passenger":          "Passenger",
    "emu":                "EMU",
    "memu":               "MEMU",
    "demu":               "DEMU",
    "heritage":           "Heritage",
    "tourist special":    "Tourist",
    "toy train":          "Toy Train",
    "special":            "Special",
}

def normalise_train_type(raw: str) -> str:
    """Map IndiaRailInfo's raw train type label to our canonical type string."""
    lower = raw.lower().strip()
    for key, canonical in TRAIN_TYPE_MAP.items():
        if key in lower:
            return canonical
    return raw.strip().title()  # fallback: title-case the original


# ─────────────────────────────────────────────
# Step 1: Fetch train number list for the zone
# ─────────────────────────────────────────────

def fetch_train_list(session: RateLimitedSession, zone_code: str, force: bool) -> list[str]:
    """
    Scrape the zone's train listing page and return a list of train numbers.

    IndiaRailInfo zone train page structure:
    - Table rows with: Train No | Train Name | Source | Destination | Type
    - Train number is a 5-digit string, presented as a link.
    """
    zone_cfg = ZONE_CONFIG[zone_code]
    url = ZONE_TRAIN_LIST_URL.format(zone_slug=zone_cfg["slug"])
    soup = session.get(url, force=force)

    if not soup:
        logger.error(f"Could not fetch train list for zone {zone_code}")
        return []

    train_numbers = []

    table = soup.find("table", class_="table") or soup.find("table")
    if not table:
        logger.warning(f"No table found on train listing page for {zone_code}")
        return []

    for row in table.find_all("tr")[1:]:
        cols = row.find_all("td")
        if not cols:
            continue
        # Train number is in the first column
        first_cell = cols[0]
        link = first_cell.find("a")
        raw_num = (link.text.strip() if link else first_cell.text.strip())
        # Strip any non-digit prefix (e.g. some show "Train 12657")
        number = re.sub(r"\D", "", raw_num)
        if validate_train_number(number):
            train_numbers.append(number)

    logger.info(f"Found {len(train_numbers)} trains for zone {zone_code}")
    return list(dict.fromkeys(train_numbers))  # deduplicate, preserve order


# ─────────────────────────────────────────────
# Step 2: Scrape individual train metadata page
# ─────────────────────────────────────────────

def scrape_train_detail(
    session: RateLimitedSession,
    train_number: str,
    zone_code: str,
    force: bool,
) -> dict | None:
    """
    Fetch and parse a train's main page on IndiaRailInfo.

    Extracts:
    - Train name
    - Train type (normalised)
    - Source station code & destination station code
    - run_days bitmask
    - Zone code (home zone — may differ from the zone being scraped)
    - has_pantry
    - locomotive_type (Electric / Diesel / Hybrid)
    - classes_available (list of class codes)

    NOTE: Schedule, coach composition, and rake sharing are scraped separately
          by scrape_schedule.py to keep each tool atomic.
    """
    out_path = TRAINS_DIR / f"{train_number}.json"
    if not force and out_path.exists():
        logger.debug(f"Skip (cached): {train_number}")
        return load_json(out_path)

    url = TRAIN_SCHEDULE_URL.format(train_number=train_number)
    soup = session.get(url, force=force)
    if not soup:
        logger.warning(f"Could not fetch train page for {train_number}")
        return None

    train: dict = {
        "train_number": train_number,
        "train_name": "",
        "train_type": "Express",
        "source_station_code": "",
        "destination_station_code": "",
        "total_distance_km": None,
        "total_duration_mins": None,
        "run_days": ALL_DAYS,
        "zone_code": zone_code,
        "has_pantry": False,
        "locomotive_type": None,
        "classes_available": [],
    }

    # ── Train name & type ─────────────────────────────────────────────────────
    # In IndiaRailInfo, the page title is usually: "12657 / Chennai Express ..."
    # and the type appears in a badge or small tag.
    title_tag = soup.find("h1") or soup.find("title")
    if title_tag:
        title_text = title_tag.text.strip()
        # Remove train number prefix if present
        name = re.sub(r"^\d{5}\s*/?\s*", "", title_text).split("|")[0].strip()
        train["train_name"] = name

    # Type: look for a span or badge with the type label
    type_el = (
        soup.find("span", class_=lambda c: c and "badge" in c.lower())
        or soup.find("span", class_=lambda c: c and "type" in c.lower())
        or soup.find("td", string=re.compile(r"express|rajdhani|shatabdi|passenger|emu|memu|demu", re.I))
    )
    if type_el:
        train["train_type"] = normalise_train_type(type_el.text.strip())

    # ── Source & Destination ──────────────────────────────────────────────────
    # Typically extracted from the route summary row: "MAS → SBC"
    # or from a metadata table with "Source" / "Destination" labels.
    source_el = soup.find(string=re.compile(r"source\s*station", re.I))
    dest_el   = soup.find(string=re.compile(r"destination\s*station", re.I))

    if source_el and source_el.parent:
        src_td = source_el.parent.find_next_sibling("td")
        if src_td:
            src_link = src_td.find("a")
            raw_code = (src_link.text if src_link else src_td.text).strip().upper()
            train["source_station_code"] = re.sub(r"\W", "", raw_code)

    if dest_el and dest_el.parent:
        dst_td = dest_el.parent.find_next_sibling("td")
        if dst_td:
            dst_link = dst_td.find("a")
            raw_code = (dst_link.text if dst_link else dst_td.text).strip().upper()
            train["destination_station_code"] = re.sub(r"\W", "", raw_code)

    # ── run_days ──────────────────────────────────────────────────────────────
    # IndiaRailInfo shows this as a row of day bubbles (Mon, Tue, ...) that are
    # highlighted (active) on running days and greyed-out on non-running days.
    # The active class is usually "active" or "yes".
    day_map: dict[str, bool] = {}
    for day_abbr in DAY_BITS:
        # Find the element containing the day abbreviation text
        day_el = soup.find(string=re.compile(rf"\b{day_abbr}\b", re.I))
        if day_el and day_el.parent:
            parent_class = " ".join(day_el.parent.get("class", []))
            day_map[day_abbr] = "active" in parent_class.lower() or "yes" in parent_class.lower()
        else:
            day_map[day_abbr] = False

    if any(day_map.values()):
        train["run_days"] = parse_run_days(day_map)
    # else: leave as ALL_DAYS (daily — safe default)

    # ── Classes available ─────────────────────────────────────────────────────
    # Shown as class badges (1A, 2A, 3A, SL, GN, CC, EC etc.)
    known_classes = {"1A", "2A", "3A", "SL", "GN", "CC", "EC", "FC", "2S", "UR"}
    found_classes = []
    for cls in known_classes:
        # search for the class code as standalone text in the page
        if soup.find(string=re.compile(rf"\b{re.escape(cls)}\b")):
            found_classes.append(cls)
    train["classes_available"] = sorted(found_classes, key=lambda c: known_classes)

    # ── Amenities ────────────────────────────────────────────────────────────
    full_text = soup.text.lower()
    train["has_pantry"]       = "pantry" in full_text or "catering" in full_text
    train["locomotive_type"]  = (
        "Electric" if "electric" in full_text
        else "Diesel" if "diesel" in full_text
        else "Hybrid" if "hybrid" in full_text
        else None
    )

    save_json(out_path, train)
    logger.info(f"✓ {train_number} — {train['train_name']} ({train['train_type']})")
    return train


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape train metadata for a given zone.")
    parser.add_argument("--zone",  required=True, help="Zone code, e.g. SR")
    parser.add_argument("--force", action="store_true", help="Re-fetch pages even if cached")
    args = parser.parse_args()

    zone_code = args.zone.upper()
    if zone_code not in ZONE_CONFIG:
        logger.error(f"Unknown zone: {zone_code}")
        sys.exit(1)

    session = RateLimitedSession(cache_dir=HTML_CACHE, logger=logger)

    train_numbers = fetch_train_list(session, zone_code, args.force)
    if not train_numbers:
        logger.error("No trains found. Aborting.")
        sys.exit(1)

    scraped = []
    for i, num in enumerate(train_numbers, 1):
        logger.info(f"[{i}/{len(train_numbers)}] Train {num}")
        result = scrape_train_detail(session, num, zone_code, args.force)
        if result:
            scraped.append(num)

    # Write manifest
    manifest = {
        "zone": zone_code,
        "total": len(scraped),
        "train_numbers": scraped,
    }
    save_json(TRAINS_DIR / "_manifest.json", manifest)

    logger.info(f"\n✅ Done. Scraped {len(scraped)}/{len(train_numbers)} trains for zone {zone_code}.")


if __name__ == "__main__":
    main()

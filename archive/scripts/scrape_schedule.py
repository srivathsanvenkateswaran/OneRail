"""
scrape_schedule.py — Scrape full timetable, coach composition, and rake sharing per train.

SOP: architecture/schedule_scraper.md

Usage:
    python scrape_schedule.py --zone SR
    python scrape_schedule.py --train 12657        # single train
    python scrape_schedule.py --zone SR --force    # re-fetch cached
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import (
    TRAIN_SCHEDULE_URL,
    TRAIN_COACH_URL,
    HTML_CACHE,
    TRAINS_DIR,
    SCHEDULES_DIR,
)
from utils import (
    RateLimitedSession,
    get_logger,
    save_json,
    load_json,
    parse_time_to_mins,
    mins_to_day_number,
    validate_station_code,
    validate_train_number,
)

logger = get_logger("scrape_schedule")


# ─────────────────────────────────────────────
# Stop parser
# ─────────────────────────────────────────────

def parse_schedule_table(soup, train_number: str) -> list[dict]:
    """
    Parse the timetable table on a train's IndiaRailInfo page.

    Expected table columns (in order, may vary slightly):
    [#] | Station | Arrival | Departure | Halt | Day | Distance | Speed | Elevation | Platform

    Returns a list of stop dicts ordered by stop_sequence.
    """
    stops = []

    # IndiaRailInfo's schedule table typically has id="timetableDiv" or class="train-route"
    table = (
        soup.find("table", id=re.compile(r"timetable|schedule|route", re.I))
        or soup.find("table", class_=re.compile(r"timetable|schedule|route|stop", re.I))
        or soup.find("table")   # last-resort fallback
    )

    if not table:
        logger.warning(f"[{train_number}] No schedule table found.")
        return []

    headers_row = table.find("tr")
    if not headers_row:
        return []

    # Map column headers to their index position for resilient parsing
    headers = [th.text.strip().lower() for th in headers_row.find_all(["th", "td"])]
    col = {
        "seq":      _find_col(headers, ["#", "sno", "no", "seq"]),
        "station":  _find_col(headers, ["station", "stn", "stop"]),
        "arrival":  _find_col(headers, ["arrival", "arr"]),
        "departure":_find_col(headers, ["departure", "dep"]),
        "halt":     _find_col(headers, ["halt", "halt(m)", "halt mins"]),
        "day":      _find_col(headers, ["day"]),
        "distance": _find_col(headers, ["distance", "dist", "km"]),
        "platform": _find_col(headers, ["platform", "plat", "pf"]),
    }

    running_time = 0  # tracks the latest departure_time_mins seen (for midnight detection)
    sequence = 0

    for row in table.find_all("tr")[1:]:  # skip header
        cells = row.find_all("td")
        if len(cells) < 3:
            continue

        def cell(idx) -> str:
            if idx is None or idx >= len(cells):
                return ""
            return cells[idx].text.strip()

        # Station code — usually a link with the 3-7 char code as text or href fragment
        station_cell = cells[col["station"]] if col["station"] is not None else cells[0]
        station_link = station_cell.find("a")
        raw_code     = (station_link.text.strip() if station_link else station_cell.text.strip()).upper()
        station_code = re.sub(r"[^A-Z0-9]", "", raw_code)

        if not validate_station_code(station_code):
            continue

        sequence += 1
        arr_raw  = cell(col["arrival"])
        dep_raw  = cell(col["departure"])
        halt_raw = cell(col["halt"])
        dist_raw = cell(col["distance"])
        pf_raw   = cell(col["platform"])

        arr_mins  = parse_time_to_mins(arr_raw,  running_time)
        dep_mins  = parse_time_to_mins(dep_raw,  arr_mins or running_time)
        halt_mins = _parse_halt(halt_raw)

        # Advance our running clock for midnight rollover detection
        if dep_mins is not None:
            running_time = dep_mins
        elif arr_mins is not None:
            running_time = arr_mins

        day_number = mins_to_day_number(running_time) if running_time > 0 else 1

        # Technical halt: rows sometimes have a distinct class like "techstop"
        is_tech = bool(
            row.get("class") and any("tech" in c.lower() for c in row.get("class", []))
        )

        stop = {
            "stop_sequence":            sequence,
            "station_code":             station_code,
            "arrival_time_mins":        arr_mins,
            "departure_time_mins":      dep_mins,
            "halt_duration_mins":       halt_mins,
            "day_number":               day_number,
            "distance_from_source_km":  _parse_float(dist_raw),
            "platform_number":          pf_raw if pf_raw and pf_raw != "-" else None,
            "is_technical_halt":        is_tech,
        }
        stops.append(stop)

    return stops


# ─────────────────────────────────────────────
# Coach composition parser
# ─────────────────────────────────────────────

def parse_coach_composition(soup, train_number: str) -> list[dict]:
    """
    Parse the coach composition section of the train page.

    IndiaRailInfo shows coaches as a horizontal scrollable block:
    [Loco] [GS] [S1] [S2] [B1] [A1] [GS] [Loco]

    Each coach cell typically shows:
    - Coach label (e.g. "A1", "S5")
    - Class code (e.g. "1A", "SL")
    - Number of seats (sometimes)
    """
    coaches = []

    # Coach section is often in a div with id/class containing "coach"
    coach_section = (
        soup.find(id=re.compile(r"coach", re.I))
        or soup.find(class_=re.compile(r"coach.?composition|rake.?position", re.I))
    )

    if not coach_section:
        logger.debug(f"[{train_number}] No coach composition section found.")
        return []

    # Each coach is usually a <td>, <div>, or <span> with the label inside
    coach_cells = coach_section.find_all(
        lambda tag: tag.name in ("td", "div", "span")
        and any(
            re.match(r"^(1A|2A|3A|SL|GN|GS|CC|EC|FC|2S|UR|SLR|LOCO|EOG|PC)$", t.strip(), re.I)
            for t in [tag.text.strip()]
        )
    )

    CLASS_PATTERN = re.compile(r"\b(1A|2A|3A|SL|GN|GS|CC|EC|FC|2S|UR)\b", re.I)
    LABEL_PATTERN = re.compile(r"\b([A-Z]{1,3}\d{1,2})\b")

    for pos, cell in enumerate(coach_cells, 1):
        text = cell.text.strip()
        class_match = CLASS_PATTERN.search(text)
        label_match = LABEL_PATTERN.search(text)

        if class_match:
            class_code  = class_match.group(1).upper()
            coach_label = label_match.group(1) if label_match else f"{class_code}{pos}"

            # Seat count — sometimes in a tooltip or a sub-span
            seat_span = cell.find("span", class_=re.compile(r"seat|count", re.I))
            num_seats = _parse_int(seat_span.text) if seat_span else None

            coaches.append({
                "class_code":        class_code,
                "coach_label":       coach_label,
                "position_in_train": pos,
                "num_seats":         num_seats,
            })

    return coaches


# ─────────────────────────────────────────────
# Rake sharing parser
# ─────────────────────────────────────────────

def parse_rake_sharing(soup, train_number: str) -> list[str]:
    """
    Extract the list of train numbers that share a rake with this train.

    IndiaRailInfo shows a "Rake Sharing" section like:
    "This train shares its rake with 12658/12659 Chennai–Coimbatore Express"

    Returns a list of 5-digit train number strings, excluding the current train.
    """
    shared = []

    # Look for a section mentioning rake sharing
    rake_section = soup.find(string=re.compile(r"rake\s+shar", re.I))
    if rake_section:
        # Search in the parent's wider text for any train numbers
        parent_text = rake_section.parent.text if rake_section.parent else ""
        # Train numbers: 5 consecutive digits
        found = re.findall(r"\b(\d{5})\b", parent_text)
        shared = [n for n in found if n != train_number and validate_train_number(n)]

    return list(dict.fromkeys(shared))  # deduplicate


# ─────────────────────────────────────────────
# Main scraper per train
# ─────────────────────────────────────────────

def scrape_train_schedule(
    session: RateLimitedSession,
    train_number: str,
    force: bool,
) -> dict | None:
    """Scrape, parse, and save the full schedule JSON for one train."""
    out_path = SCHEDULES_DIR / f"{train_number}.json"
    if not force and out_path.exists():
        logger.debug(f"Skip (cached): {train_number}")
        return load_json(out_path)

    # ── Fetch schedule page ───────────────────────────────────────────────────
    url = TRAIN_SCHEDULE_URL.format(train_number=train_number)
    soup = session.get(url, force=force)
    if not soup:
        logger.warning(f"Could not fetch schedule page for {train_number}")
        return None

    stops        = parse_schedule_table(soup, train_number)
    rake_sharing = parse_rake_sharing(soup, train_number)

    # ── Fetch coach composition (separate page) ───────────────────────────────
    coach_url  = TRAIN_COACH_URL.format(train_number=train_number)
    coach_soup = session.get(coach_url, force=force)
    coaches    = parse_coach_composition(coach_soup, train_number) if coach_soup else []

    if not stops:
        logger.warning(f"[{train_number}] Zero stops parsed — check HTML cache and selectors.")
        return None

    result = {
        "train_number": train_number,
        "stops":        stops,
        "coach_config": coaches,
        "rake_sharing": rake_sharing,
    }

    save_json(out_path, result)
    logger.info(
        f"✓ {train_number}: {len(stops)} stops, "
        f"{len(coaches)} coaches, "
        f"{len(rake_sharing)} rake-shares"
    )
    return result


# ─────────────────────────────────────────────
# Helper parsers
# ─────────────────────────────────────────────

def _find_col(headers: list[str], candidates: list[str]) -> int | None:
    """Return the index of the first matching header, or None."""
    for c in candidates:
        for i, h in enumerate(headers):
            if c in h:
                return i
    return None

def _parse_halt(raw: str) -> int | None:
    """Parse a halt duration string like '2', '2m', '0' into an integer."""
    if not raw or raw.strip() in ("-", "--", ""):
        return None
    match = re.search(r"(\d+)", raw)
    return int(match.group(1)) if match else None

def _parse_float(raw: str) -> float | None:
    try:
        return float(re.sub(r"[^\d.]", "", raw))
    except (ValueError, TypeError):
        return None

def _parse_int(raw: str) -> int | None:
    try:
        return int(re.sub(r"\D", "", raw))
    except (ValueError, TypeError):
        return None


# ─────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape schedules for all trains in a zone.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--zone",  help="Scrape all trains in a zone, e.g. SR")
    group.add_argument("--train", help="Scrape a single train number, e.g. 12657")
    parser.add_argument("--force", action="store_true", help="Re-fetch even if cached")
    args = parser.parse_args()

    session = RateLimitedSession(cache_dir=HTML_CACHE, logger=logger)

    # Build the list of train numbers to process
    if args.train:
        if not validate_train_number(args.train):
            logger.error(f"Invalid train number: {args.train}")
            sys.exit(1)
        train_numbers = [args.train]
    else:
        # Read from the manifest produced by scrape_trains.py
        manifest = load_json(TRAINS_DIR / "_manifest.json")
        if not manifest or "train_numbers" not in manifest:
            logger.error("No train manifest found. Run scrape_trains.py first.")
            sys.exit(1)
        train_numbers = manifest["train_numbers"]
        logger.info(f"Loaded {len(train_numbers)} trains from manifest (zone: {manifest.get('zone')})")

    scraped = []
    failed  = []

    for i, num in enumerate(train_numbers, 1):
        logger.info(f"[{i}/{len(train_numbers)}] Schedule for train {num}")
        result = scrape_train_schedule(session, num, args.force)
        if result:
            scraped.append(num)
        else:
            failed.append(num)

    # Update schedule manifest
    save_json(SCHEDULES_DIR / "_manifest.json", {
        "total":   len(scraped),
        "scraped": scraped,
        "failed":  failed,
    })

    logger.info(f"\n✅ Done. {len(scraped)} schedules scraped, {len(failed)} failed.")
    if failed:
        logger.warning(f"Failed train numbers: {failed}")


if __name__ == "__main__":
    main()

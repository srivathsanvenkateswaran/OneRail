"""
utils.py — Shared utilities for all OneRail scrapers.
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

from config import (
    HTTP_HEADERS,
    LOGS_DIR,
    MAX_RETRIES,
    REQUEST_DELAY_SECONDS,
    RETRY_BACKOFF_SECONDS,
    DAY_BITS,
    ALL_DAYS,
)

# ─────────────────────────────────────────────
# Logger setup
# ─────────────────────────────────────────────

def get_logger(name: str) -> logging.Logger:
    """Return a logger that writes to both console and a log file."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger  # already initialized

    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")

    # Console handler
    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    # File handler
    log_file = LOGS_DIR / f"{name}_{datetime.now().strftime('%Y%m%d')}.log"
    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    return logger

# ─────────────────────────────────────────────
# HTTP session with rate limiting
# ─────────────────────────────────────────────

class RateLimitedSession:
    """
    Wraps requests.Session to enforce:
    - A minimum delay between requests (REQUEST_DELAY_SECONDS)
    - Retry with backoff on HTTP 429 (rate limit) and 5xx errors
    - HTML caching: raw HTML saved to .tmp/raw/html/ by URL hash
    """

    def __init__(self, cache_dir: Path, logger: logging.Logger):
        self.session = requests.Session()
        self.session.headers.update(HTTP_HEADERS)
        self.cache_dir = cache_dir
        self.logger = logger
        self._last_request_time: float = 0.0

    def _cache_path(self, url: str) -> Path:
        """Stable cache filename derived from URL."""
        import hashlib
        url_hash = hashlib.md5(url.encode()).hexdigest()
        return self.cache_dir / f"{url_hash}.html"

    def get(self, url: str, force: bool = False) -> Optional[BeautifulSoup]:
        """
        Fetch URL and return a BeautifulSoup object.
        Uses cached HTML if available (unless force=True).
        Returns None on permanent failure.
        """
        cache_file = self._cache_path(url)

        # Serve from cache
        if not force and cache_file.exists():
            self.logger.debug(f"Cache HIT: {url}")
            html = cache_file.read_text(encoding="utf-8")
            return BeautifulSoup(html, "lxml")

        # Enforce rate limit
        elapsed = time.time() - self._last_request_time
        if elapsed < REQUEST_DELAY_SECONDS:
            time.sleep(REQUEST_DELAY_SECONDS - elapsed)

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                self.logger.info(f"GET [{attempt}/{MAX_RETRIES}]: {url}")
                resp = self.session.get(url, timeout=20)
                self._last_request_time = time.time()

                if resp.status_code == 200:
                    # Save to cache
                    cache_file.write_text(resp.text, encoding="utf-8")
                    return BeautifulSoup(resp.text, "lxml")

                elif resp.status_code == 429:
                    self.logger.warning(f"Rate limited (429). Backing off {RETRY_BACKOFF_SECONDS}s...")
                    time.sleep(RETRY_BACKOFF_SECONDS)

                elif resp.status_code == 404:
                    self.logger.warning(f"404 Not Found: {url}")
                    return None

                else:
                    self.logger.warning(f"HTTP {resp.status_code} for {url}")
                    time.sleep(REQUEST_DELAY_SECONDS * attempt)

            except requests.RequestException as e:
                self.logger.error(f"Request error on attempt {attempt}: {e}")
                time.sleep(REQUEST_DELAY_SECONDS * attempt)

        self.logger.error(f"All {MAX_RETRIES} attempts failed for: {url}")
        return None

# ─────────────────────────────────────────────
# JSON file helpers
# ─────────────────────────────────────────────

def save_json(path: Path, data: dict | list) -> None:
    """Write data to a JSON file with pretty-printing."""
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def load_json(path: Path) -> dict | list | None:
    """Load JSON from a file, return None if file doesn't exist or is invalid."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None

def update_manifest(manifest_path: Path, key: str, value: str) -> None:
    """Add or update an entry in a manifest JSON file."""
    manifest = load_json(manifest_path) or {}
    manifest[key] = value
    manifest["last_updated"] = datetime.now().isoformat()
    save_json(manifest_path, manifest)

# ─────────────────────────────────────────────
# Time utilities (per architecture/schedule_scraper.md spec)
# ─────────────────────────────────────────────

def parse_time_to_mins(time_str: str, base_day_mins: int = 0) -> Optional[int]:
    """
    Convert a time string like "06:10" or "23:45" to minutes from
    midnight of Day 1, accounting for carry-over across midnight.

    base_day_mins: the running total of minutes so far (for the previous stop).
    This lets us detect when the clock rolls past midnight and increment correctly.

    Returns None if the time string is empty/invalid (used for source/dest stations).
    """
    if not time_str or time_str.strip() in ("-", "--", ""):
        return None

    try:
        parts = time_str.strip().split(":")
        hours, mins = int(parts[0]), int(parts[1])
        raw_mins = hours * 60 + mins

        # Detect midnight rollover: if raw_mins < (base_day_mins % 1440),
        # the clock has crossed midnight — add 1440 to carry into the next day.
        day_offset = (base_day_mins // 1440) * 1440
        candidate = day_offset + raw_mins
        if candidate < base_day_mins:
            candidate += 1440  # crossed midnight
        return candidate

    except (ValueError, IndexError):
        return None

def mins_to_day_number(total_mins: int) -> int:
    """Convert total minutes since midnight Day 1 to the calendar day number (1-indexed)."""
    return (total_mins // 1440) + 1

def parse_run_days(day_indicators: dict[str, bool]) -> int:
    """
    Convert a dict of {day_abbr: is_running} to a bitmask integer.
    e.g. {"Mon": True, "Tue": False, ..., "Sun": True} → 65
    """
    bitmask = 0
    for day, runs in day_indicators.items():
        if runs and day in DAY_BITS:
            bitmask |= DAY_BITS[day]
    return bitmask if bitmask > 0 else ALL_DAYS  # default to daily if unparseable

def day_bitmask_for_date(date_str: str) -> int:
    """
    Given a date string (YYYY-MM-DD), return the bitmask for that day of week.
    Used by the Search API to filter trains.
    """
    from datetime import date
    d = date.fromisoformat(date_str)
    # Python weekday(): Monday=0, Sunday=6
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return DAY_BITS[day_names[d.weekday()]]

# ─────────────────────────────────────────────
# Validation helpers (per architecture/db_import.md)
# ─────────────────────────────────────────────

def validate_station_code(code: str) -> bool:
    return bool(code) and code.isalnum() and 2 <= len(code) <= 7

def validate_train_number(number: str) -> bool:
    return bool(number) and number.isdigit() and len(number) == 5

def validate_coordinates(lat: Optional[float], lon: Optional[float]) -> bool:
    if lat is None or lon is None:
        return True  # nulls are allowed (some stations lack GPS data)
    return 8.0 <= lat <= 37.0 and 68.0 <= lon <= 97.0

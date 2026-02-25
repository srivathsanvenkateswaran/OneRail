"""
config.py — Central configuration for OneRail scrapers.
Per B.L.A.S.T. protocol: update architecture/*.md SOPs if any URL or logic changes here.
"""

import os
from pathlib import Path

# ─────────────────────────────────────────────
# Directory structure
# ─────────────────────────────────────────────
ROOT_DIR   = Path(__file__).resolve().parent.parent
TOOLS_DIR  = ROOT_DIR / "tools"
TMP_DIR    = ROOT_DIR / ".tmp"

RAW_DIR       = TMP_DIR / "raw"
HTML_CACHE    = RAW_DIR / "html"       # cached raw HTML (avoids re-fetching)
STATIONS_DIR  = RAW_DIR / "stations"  # one JSON per station
TRAINS_DIR    = RAW_DIR / "trains"    # one JSON per train
SCHEDULES_DIR = RAW_DIR / "schedules" # one JSON per train schedule
LOGS_DIR      = TMP_DIR / "logs"

# Create all directories if they don't exist
for d in [HTML_CACHE, STATIONS_DIR, TRAINS_DIR, SCHEDULES_DIR, LOGS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────
# IndiaRailInfo URL patterns
# ─────────────────────────────────────────────
BASE_URL = "https://indiarailinfo.com"

# Zone station listing: lists all stations in a given zone
# e.g. /zone/sr-southern-railway-stations
ZONE_STATION_LIST_URL = BASE_URL + "/zone/{zone_slug}-stations"

# Individual station page
# e.g. /junction/mas/chennai-central
STATION_URL = BASE_URL + "/junction/{station_code_lower}"

# Zone train listing (trains that belong to or originate from a zone)
# e.g. /zone/sr-southern-railway-trains
ZONE_TRAIN_LIST_URL = BASE_URL + "/zone/{zone_slug}-trains"

# Train schedule/timetable page
# e.g. /train/12657/schedule
TRAIN_SCHEDULE_URL = BASE_URL + "/train/{train_number}"

# Train coach composition page
TRAIN_COACH_URL = BASE_URL + "/train/{train_number}/coach-composition"

# ─────────────────────────────────────────────
# Zone configuration
# Zone slug = used in URLs, e.g. "sr-southern-railway"
# ─────────────────────────────────────────────
ZONE_CONFIG = {
    "SR":  {"slug": "sr-southern-railway",      "name": "Southern Railway",             "headquarters": "Chennai"},
    "NR":  {"slug": "nr-northern-railway",       "name": "Northern Railway",             "headquarters": "New Delhi"},
    "CR":  {"slug": "cr-central-railway",        "name": "Central Railway",              "headquarters": "Mumbai"},
    "WR":  {"slug": "wr-western-railway",        "name": "Western Railway",              "headquarters": "Mumbai"},
    "ER":  {"slug": "er-eastern-railway",        "name": "Eastern Railway",              "headquarters": "Kolkata"},
    "SER": {"slug": "ser-south-eastern-railway", "name": "South Eastern Railway",        "headquarters": "Kolkata"},
    "SCR": {"slug": "scr-south-central-railway", "name": "South Central Railway",        "headquarters": "Secunderabad"},
    "SWR": {"slug": "swr-south-western-railway", "name": "South Western Railway",        "headquarters": "Hubballi"},
    "NWR": {"slug": "nwr-north-western-railway", "name": "North Western Railway",        "headquarters": "Jaipur"},
    "NER": {"slug": "ner-north-eastern-railway", "name": "North Eastern Railway",        "headquarters": "Gorakhpur"},
    "NFR": {"slug": "nfr-northeast-frontier-railway", "name": "Northeast Frontier Railway", "headquarters": "Maligaon"},
    "ECoR":{"slug": "ecor-east-coast-railway",   "name": "East Coast Railway",           "headquarters": "Bhubaneswar"},
    "ECR": {"slug": "ecr-east-central-railway",  "name": "East Central Railway",         "headquarters": "Hajipur"},
    "NCR": {"slug": "ncr-north-central-railway", "name": "North Central Railway",        "headquarters": "Prayagraj"},
    "WCR": {"slug": "wcr-west-central-railway",  "name": "West Central Railway",         "headquarters": "Jabalpur"},
    "SECR":{"slug": "secr-south-east-central-railway","name":"South East Central Railway","headquarters": "Bilaspur"},
    "KR":  {"slug": "kr-konkan-railway",         "name": "Konkan Railway",               "headquarters": "Navi Mumbai"},
    "Metro":{"slug": "metro-railway",            "name": "Metro Railway",                "headquarters": "Kolkata"},
}

# ─────────────────────────────────────────────
# HTTP / Rate limiting
# ─────────────────────────────────────────────
REQUEST_DELAY_SECONDS = 1.5     # sleep between requests
MAX_RETRIES           = 3
RETRY_BACKOFF_SECONDS = 30      # wait on HTTP 429

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# ─────────────────────────────────────────────
# Train type classification
# Types in this list are "obscure" — stored in DB but hidden by default in UI
# per gemini.md rule 5a
# ─────────────────────────────────────────────
OBSCURE_TRAIN_TYPES = {
    "Heritage",
    "Tourist",
    "Toy Train",
    "Rail Motor",
    "Special",
    "Inspection",
}

# ─────────────────────────────────────────────
# run_days bitmask
# ─────────────────────────────────────────────
DAY_BITS = {
    "Mon": 1,
    "Tue": 2,
    "Wed": 4,
    "Thu": 8,
    "Fri": 16,
    "Sat": 32,
    "Sun": 64,
}
ALL_DAYS = 127  # 1+2+4+8+16+32+64

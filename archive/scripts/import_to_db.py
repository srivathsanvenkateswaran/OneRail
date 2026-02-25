"""
import_to_db.py — Validate and import scraped JSON data into PostgreSQL.

SOP: architecture/db_import.md

Import order MUST be followed (foreign key dependencies):
  1. zones       → Zone table (static, from config.py)
  2. stations    → Station table
  3. trains      → Train table
  4. schedules   → TrainStop + CoachConfig + RakeGroup + RakeMember

Usage:
    python import_to_db.py --entity zones
    python import_to_db.py --entity stations
    python import_to_db.py --entity trains
    python import_to_db.py --entity schedules
    python import_to_db.py --all              # runs all four in order
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))

from config import (
    ZONE_CONFIG,
    STATIONS_DIR,
    TRAINS_DIR,
    SCHEDULES_DIR,
    LOGS_DIR,
)
from utils import (
    get_logger,
    load_json,
    save_json,
    validate_station_code,
    validate_train_number,
    validate_coordinates,
)

# Load .env from the web/ directory (where Prisma lives)
env_path = Path(__file__).parent.parent / "web" / ".env"
load_dotenv(env_path)

logger = get_logger("import_to_db")

# ─────────────────────────────────────────────
# DB connection
# ─────────────────────────────────────────────

def get_connection():
    """Connect to PostgreSQL using the DATABASE_URL from .env"""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set in web/.env")
    return psycopg2.connect(db_url)


# ─────────────────────────────────────────────
# Validation layer (per architecture/db_import.md)
# ─────────────────────────────────────────────

class ValidationError(Exception):
    pass

def validate_station(s: dict) -> None:
    if not validate_station_code(s.get("station_code", "")):
        raise ValidationError(f"Invalid station_code: {s.get('station_code')}")
    if not s.get("station_name"):
        raise ValidationError("Missing station_name")
    if not validate_coordinates(s.get("latitude"), s.get("longitude")):
        raise ValidationError(
            f"Out-of-range coordinates: ({s.get('latitude')}, {s.get('longitude')})"
        )

def validate_train(t: dict) -> None:
    if not validate_train_number(t.get("train_number", "")):
        raise ValidationError(f"Invalid train_number: {t.get('train_number')}")
    if not t.get("train_name"):
        raise ValidationError("Missing train_name")
    if not t.get("source_station_code") or not t.get("destination_station_code"):
        raise ValidationError("Missing source or destination station code")

def validate_stop(stop: dict, train_number: str) -> None:
    if not validate_station_code(stop.get("station_code", "")):
        raise ValidationError(
            f"Train {train_number}: invalid station_code '{stop.get('station_code')}' "
            f"at sequence {stop.get('stop_sequence')}"
        )
    seq = stop.get("stop_sequence")
    if not isinstance(seq, int) or seq < 1:
        raise ValidationError(f"Train {train_number}: invalid stop_sequence '{seq}'")
    arr = stop.get("arrival_time_mins")
    dep = stop.get("departure_time_mins")
    if arr is not None and arr < 0:
        raise ValidationError(f"Train {train_number}: negative arrival_time_mins")
    if dep is not None and dep < 0:
        raise ValidationError(f"Train {train_number}: negative departure_time_mins")


# ─────────────────────────────────────────────
# Importers
# ─────────────────────────────────────────────

def import_zones(conn) -> tuple[int, int]:
    """Seed the Zone table from ZONE_CONFIG in config.py."""
    rows = [
        (code, cfg["name"], cfg["headquarters"])
        for code, cfg in ZONE_CONFIG.items()
    ]
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO "Zone" (zone_code, zone_name, headquarters)
            VALUES %s
            ON CONFLICT (zone_code) DO UPDATE
              SET zone_name    = EXCLUDED.zone_name,
                  headquarters = EXCLUDED.headquarters
            """,
            rows,
        )
    conn.commit()
    logger.info(f"  Upserted {len(rows)} zones.")
    return len(rows), 0


def import_stations(conn) -> tuple[int, int]:
    """Import all station JSON files from .tmp/raw/stations/."""
    files = list(STATIONS_DIR.glob("*.json"))
    files = [f for f in files if f.name != "_manifest.json"]
    ok = err = 0
    errors = []

    rows = []
    for f in files:
        data = load_json(f)
        if not data:
            continue
        try:
            validate_station(data)
        except ValidationError as e:
            logger.warning(f"  SKIP station {f.name}: {e}")
            errors.append({"file": str(f.name), "error": str(e)})
            err += 1
            continue

        rows.append((
            data["station_code"],
            data["station_name"],
            data.get("state"),
            data.get("zone_code"),
            data.get("latitude"),
            data.get("longitude"),
            data.get("elevation_m"),
            data.get("station_category"),
            data.get("num_platforms"),
            bool(data.get("has_retiring_room", False)),
            bool(data.get("has_waiting_room",  False)),
            bool(data.get("has_food_plaza",    False)),
            bool(data.get("has_wifi",          False)),
            bool(data.get("is_junction",       False)),
            bool(data.get("is_terminus",       False)),
        ))
        ok += 1

    if rows:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO "Station" (
                    station_code, station_name, state, zone_code,
                    latitude, longitude, elevation_m, station_category,
                    num_platforms, has_retiring_room, has_waiting_room,
                    has_food_plaza, has_wifi, is_junction, is_terminus
                ) VALUES %s
                ON CONFLICT (station_code) DO UPDATE SET
                    station_name     = EXCLUDED.station_name,
                    state            = EXCLUDED.state,
                    zone_code        = EXCLUDED.zone_code,
                    latitude         = EXCLUDED.latitude,
                    longitude        = EXCLUDED.longitude,
                    elevation_m      = EXCLUDED.elevation_m,
                    station_category = EXCLUDED.station_category,
                    num_platforms    = EXCLUDED.num_platforms,
                    has_retiring_room= EXCLUDED.has_retiring_room,
                    has_waiting_room = EXCLUDED.has_waiting_room,
                    has_food_plaza   = EXCLUDED.has_food_plaza,
                    has_wifi         = EXCLUDED.has_wifi,
                    is_junction      = EXCLUDED.is_junction,
                    is_terminus      = EXCLUDED.is_terminus
                """,
                rows,
            )
        conn.commit()

    logger.info(f"  Upserted {ok} stations, skipped {err}.")
    return ok, err


def import_trains(conn) -> tuple[int, int]:
    """Import all train JSON files from .tmp/raw/trains/."""
    files = list(TRAINS_DIR.glob("*.json"))
    files = [f for f in files if f.name != "_manifest.json"]
    ok = err = 0

    rows = []
    for f in files:
        data = load_json(f)
        if not data:
            continue
        try:
            validate_train(data)
        except ValidationError as e:
            logger.warning(f"  SKIP train {f.name}: {e}")
            err += 1
            continue

        rows.append((
            data["train_number"],
            data["train_name"],
            data.get("train_type", "Express"),
            data["source_station_code"],
            data["destination_station_code"],
            data.get("total_distance_km"),
            data.get("total_duration_mins"),
            data.get("run_days", 127),
            data.get("zone_code"),
            bool(data.get("has_pantry", False)),
            data.get("locomotive_type"),
            data.get("classes_available", []),
        ))
        ok += 1

    if rows:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO "Train" (
                    train_number, train_name, train_type,
                    source_station_code, destination_station_code,
                    total_distance_km, total_duration_mins, run_days,
                    zone_code, has_pantry, locomotive_type, classes_available
                ) VALUES %s
                ON CONFLICT (train_number) DO UPDATE SET
                    train_name               = EXCLUDED.train_name,
                    train_type               = EXCLUDED.train_type,
                    source_station_code      = EXCLUDED.source_station_code,
                    destination_station_code = EXCLUDED.destination_station_code,
                    total_distance_km        = EXCLUDED.total_distance_km,
                    total_duration_mins      = EXCLUDED.total_duration_mins,
                    run_days                 = EXCLUDED.run_days,
                    zone_code                = EXCLUDED.zone_code,
                    has_pantry               = EXCLUDED.has_pantry,
                    locomotive_type          = EXCLUDED.locomotive_type,
                    classes_available        = EXCLUDED.classes_available
                """,
                rows,
            )
        conn.commit()

    logger.info(f"  Upserted {ok} trains, skipped {err}.")
    return ok, err


def import_schedules(conn) -> tuple[int, int]:
    """
    Import all schedule JSON files from .tmp/raw/schedules/.
    Handles: TrainStop, CoachConfig, RakeGroup, RakeMember.
    """
    files = list(SCHEDULES_DIR.glob("*.json"))
    files = [f for f in files if f.name != "_manifest.json"]
    ok = err = 0

    for f in files:
        data = load_json(f)
        if not data:
            continue

        train_number = data.get("train_number")
        if not validate_train_number(train_number or ""):
            err += 1
            continue

        stops        = data.get("stops", [])
        coach_config = data.get("coach_config", [])
        rake_sharing = data.get("rake_sharing", [])

        try:
            with conn.cursor() as cur:

                # ── TrainStop ─────────────────────────────────────────────────
                if stops:
                    # Delete existing stops for this train (clean re-import)
                    cur.execute('DELETE FROM "TrainStop" WHERE train_number = %s', (train_number,))

                    stop_rows = []
                    for stop in stops:
                        try:
                            validate_stop(stop, train_number)
                        except ValidationError as ve:
                            logger.warning(f"  SKIP stop: {ve}")
                            continue
                        stop_rows.append((
                            train_number,
                            stop["station_code"],
                            stop["stop_sequence"],
                            stop.get("arrival_time_mins"),
                            stop.get("departure_time_mins"),
                            stop.get("halt_duration_mins"),
                            stop.get("day_number", 1),
                            stop.get("distance_from_source_km"),
                            stop.get("platform_number"),
                            bool(stop.get("is_technical_halt", False)),
                        ))

                    if stop_rows:
                        execute_values(
                            cur,
                            """
                            INSERT INTO "TrainStop" (
                                train_number, station_code, stop_sequence,
                                arrival_time_mins, departure_time_mins, halt_duration_mins,
                                day_number, distance_from_source_km,
                                platform_number, is_technical_halt
                            ) VALUES %s
                            ON CONFLICT (train_number, stop_sequence) DO UPDATE SET
                                station_code           = EXCLUDED.station_code,
                                arrival_time_mins      = EXCLUDED.arrival_time_mins,
                                departure_time_mins    = EXCLUDED.departure_time_mins,
                                halt_duration_mins     = EXCLUDED.halt_duration_mins,
                                day_number             = EXCLUDED.day_number,
                                distance_from_source_km= EXCLUDED.distance_from_source_km,
                                platform_number        = EXCLUDED.platform_number,
                                is_technical_halt      = EXCLUDED.is_technical_halt
                            """,
                            stop_rows,
                        )

                # ── CoachConfig ───────────────────────────────────────────────
                if coach_config:
                    cur.execute('DELETE FROM "CoachConfig" WHERE train_number = %s', (train_number,))
                    coach_rows = [
                        (
                            train_number,
                            c["class_code"],
                            c["coach_label"],
                            c["position_in_train"],
                            c.get("num_seats"),
                        )
                        for c in coach_config
                    ]
                    if coach_rows:
                        execute_values(
                            cur,
                            """
                            INSERT INTO "CoachConfig"
                              (train_number, class_code, coach_label, position_in_train, num_seats)
                            VALUES %s
                            """,
                            coach_rows,
                        )

                # ── Rake Sharing ──────────────────────────────────────────────
                # Strategy: find or create a RakeGroup containing this train,
                # then add shared trains as members.
                if rake_sharing:
                    # Find existing group for this train
                    cur.execute(
                        'SELECT group_id FROM "RakeMember" WHERE train_number = %s LIMIT 1',
                        (train_number,)
                    )
                    row = cur.fetchone()
                    if row:
                        group_id = row[0]
                    else:
                        cur.execute(
                            'INSERT INTO "RakeGroup" (notes) VALUES (%s) RETURNING group_id',
                            (f"Rake group for {train_number}",)
                        )
                        group_id = cur.fetchone()[0]
                        cur.execute(
                            """
                            INSERT INTO "RakeMember" (group_id, train_number, sequence_in_group)
                            VALUES (%s, %s, 1)
                            ON CONFLICT (group_id, train_number) DO NOTHING
                            """,
                            (group_id, train_number)
                        )

                    for seq, shared_num in enumerate(rake_sharing, 2):
                        if validate_train_number(shared_num):
                            cur.execute(
                                """
                                INSERT INTO "RakeMember" (group_id, train_number, sequence_in_group)
                                VALUES (%s, %s, %s)
                                ON CONFLICT (group_id, train_number) DO NOTHING
                                """,
                                (group_id, shared_num, seq)
                            )

            conn.commit()
            ok += 1
            logger.info(f"  ✓ {train_number}: {len(stops)} stops, {len(coach_config)} coaches")

        except Exception as e:
            conn.rollback()
            logger.error(f"  ✗ {train_number}: {e}")
            err += 1

    logger.info(f"  Imported {ok} schedules, {err} failed.")
    return ok, err


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

ENTITY_ORDER = ["zones", "stations", "trains", "schedules"]

def run_entity(conn, entity: str):
    logger.info(f"\n── Importing: {entity.upper()} ──")
    if entity == "zones":
        return import_zones(conn)
    elif entity == "stations":
        return import_stations(conn)
    elif entity == "trains":
        return import_trains(conn)
    elif entity == "schedules":
        return import_schedules(conn)
    else:
        raise ValueError(f"Unknown entity: {entity}")


def main():
    parser = argparse.ArgumentParser(description="Import scraped JSON data into PostgreSQL.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--entity", choices=ENTITY_ORDER, help="Import a specific entity")
    group.add_argument("--all",    action="store_true",   help="Import all entities in order")
    args = parser.parse_args()

    try:
        conn = get_connection()
        logger.info("✅ DB connection established.")
    except Exception as e:
        logger.error(f"DB connection failed: {e}")
        sys.exit(1)

    summary = {}
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    try:
        entities = ENTITY_ORDER if args.all else [args.entity]
        for entity in entities:
            ok, err = run_entity(conn, entity)
            summary[entity] = {"ok": ok, "err": err}
    finally:
        conn.close()

    # Write import summary
    summary_path = LOGS_DIR / f"import_summary_{timestamp}.json"
    save_json(summary_path, summary)
    logger.info(f"\n📋 Import summary written to: {summary_path}")

    # Surface overall result
    total_err = sum(v["err"] for v in summary.values())
    if total_err:
        logger.warning(f"⚠️  Completed with {total_err} validation errors. Check logs.")
    else:
        logger.info("✅ All entities imported successfully.")


if __name__ == "__main__":
    main()

/**
 * API Route: GET /api/search
 *
 * SOP: architecture/search_api.md
 *
 * Query params:
 *   from   — departure station code (required)
 *   to     — arrival station code (required)
 *   date   — travel date YYYY-MM-DD (required)
 *   class  — class code filter, e.g. "SL" (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateToDayBit, minsToTimeStr, formatDuration, minsToDayNumber } from "@/lib/utils";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from")?.toUpperCase().trim();
    const to = searchParams.get("to")?.toUpperCase().trim();
    const date = searchParams.get("date");
    const cls = searchParams.get("class");

    // ── Input validation ──────────────────────────────────────────────────────
    if (!from || !to || !date) {
        return NextResponse.json(
            { error: "Missing required params: from, to, date" },
            { status: 400 }
        );
    }

    if (from === to) {
        return NextResponse.json(
            { error: "Source and destination cannot be the same station" },
            { status: 400 }
        );
    }

    let travelDate: Date;
    try {
        travelDate = new Date(date);
        if (isNaN(travelDate.getTime())) throw new Error("invalid date");
    } catch {
        return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
    }

    const dayBit = dateToDayBit(travelDate);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayOfWeek = dayNames[travelDate.getDay()];

    try {
        // ── Core query ────────────────────────────────────────────────────────
        // Find all trains that:
        //   1. Have a stop at `from` (s_from)
        //   2. Have a stop at `to` (s_to)
        //   3. s_from.stop_sequence < s_to.stop_sequence (correct direction)
        //   4. Run on the requested day (bitmask check)
        //   5. (Optional) have the requested class available
        //
        // We use Prisma's raw query for the self-join on TrainStop.
        const results = await prisma.$queryRaw<SearchResult[]>`
      SELECT
        t.train_number,
        t.train_name,
        t.train_type,
        t.run_days,
        t.has_pantry,
        t.locomotive_type,
        t.classes_available,
        s_from.departure_time_mins,
        s_from.day_number            AS dep_day,
        s_to.arrival_time_mins,
        s_to.day_number              AS arr_day,
        (s_to.distance_from_source_km - s_from.distance_from_source_km) AS distance_km,
        (
          COALESCE(s_to.arrival_time_mins, s_to.departure_time_mins)
          - COALESCE(s_from.departure_time_mins, s_from.arrival_time_mins)
        ) AS duration_mins
      FROM "Train" t
      JOIN "TrainStop" s_from
        ON s_from.train_number = t.train_number
       AND s_from.station_code = ${from}
       AND s_from.is_technical_halt = false
      JOIN "TrainStop" s_to
        ON s_to.train_number = t.train_number
       AND s_to.station_code = ${to}
       AND s_to.is_technical_halt = false
      WHERE s_from.stop_sequence < s_to.stop_sequence
        AND (t.run_days & ${dayBit}) > 0
        ${cls ? prisma.$queryRaw`AND ${cls} = ANY(t.classes_available)` : prisma.$queryRaw``}
      ORDER BY s_from.departure_time_mins ASC NULLS LAST
    `;

        // ── Fetch station info for the response header ─────────────────────────
        const [fromStation, toStation] = await Promise.all([
            prisma.station.findUnique({
                where: { station_code: from },
                select: { station_code: true, station_name: true },
            }),
            prisma.station.findUnique({
                where: { station_code: to },
                select: { station_code: true, station_name: true },
            }),
        ]);

        // ── Shape the response ─────────────────────────────────────────────────
        const shaped = results.map((r) => ({
            train_number: r.train_number,
            train_name: r.train_name,
            train_type: r.train_type,
            departure_time: minsToTimeStr(r.departure_time_mins),
            arrival_time: minsToTimeStr(r.arrival_time_mins),
            dep_day: minsToDayNumber(r.departure_time_mins ?? 0),
            arr_day: minsToDayNumber(r.arrival_time_mins ?? 0),
            duration_mins: r.duration_mins ? Number(r.duration_mins) : null,
            duration_label: formatDuration(r.duration_mins ? Number(r.duration_mins) : null),
            distance_km: r.distance_km ? Number(r.distance_km) : null,
            classes_available: r.classes_available,
            has_pantry: r.has_pantry,
        }));

        return NextResponse.json(
            {
                from: fromStation ?? { station_code: from, station_name: from },
                to: toStation ?? { station_code: to, station_name: to },
                date,
                day_of_week: dayOfWeek,
                total: shaped.length,
                results: shaped,
            },
            {
                headers: {
                    // Cache for 5 minutes — schedule data is static
                    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
                },
            }
        );
    } catch (err) {
        console.error("[/api/search] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface SearchResult {
    train_number: string;
    train_name: string;
    train_type: string;
    run_days: number;
    has_pantry: boolean;
    locomotive_type: string | null;
    classes_available: string[];
    departure_time_mins: number | null;
    arrival_time_mins: number | null;
    dep_day: number;
    arr_day: number;
    distance_km: bigint | number | null;
    duration_mins: bigint | number | null;
}

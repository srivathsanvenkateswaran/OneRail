/**
 * API Route: GET /api/station/[code]
 *
 * Returns full detail for a single station:
 *   - Station metadata (name, zone, state, amenities, platforms)
 *   - All trains stopping at this station (paginated)
 *   - Ordered by departure time ascending
 *
 * Query params:
 *   page     — page number for train list (default: 1)
 *   per_page — results per page (default: 50, max: 100)
 *   filter   — "departures" | "arrivals" | "all" (default: all)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { minsToTimeStr } from "@/lib/utils";

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ code: string }> }
) {
    const { code } = await params;
    const stationCode = code.toUpperCase().trim();

    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("per_page") ?? "50", 10)));
    const filter = (searchParams.get("filter") ?? "all") as "departures" | "arrivals" | "all";

    if (!/^[A-Z0-9]{2,7}$/.test(stationCode)) {
        return NextResponse.json({ error: "Invalid station code" }, { status: 400 });
    }

    try {
        // ── Station metadata ───────────────────────────────────────────────────
        const station = await prisma.station.findUnique({
            where: { station_code: stationCode },
            include: {
                zone: { select: { zone_code: true, zone_name: true } },
            },
        });

        if (!station) {
            return NextResponse.json({ error: "Station not found" }, { status: 404 });
        }

        // ── Trains at this station ─────────────────────────────────────────────
        // We query TrainStop directly and join Train for metadata.
        // Per gemini.md rule 5a: technical halts are returned but flagged.
        const offset = (page - 1) * perPage;

        // Build the filter for departure/arrival
        const timeFilter =
            filter === "departures"
                ? { departure_time_mins: { not: null } }
                : filter === "arrivals"
                    ? { arrival_time_mins: { not: null } }
                    : {};

        const [totalCount, stops] = await Promise.all([
            prisma.trainStop.count({
                where: { station_code: stationCode, ...timeFilter },
            }),
            prisma.trainStop.findMany({
                where: { station_code: stationCode, ...timeFilter },
                orderBy: { departure_time_mins: "asc" },
                skip: offset,
                take: perPage,
                include: {
                    train: {
                        select: {
                            train_number: true,
                            train_name: true,
                            train_type: true,
                            run_days: true,
                            classes_available: true,
                            has_pantry: true,
                            source_station_code: true,
                            destination_station_code: true,
                            source_station: {
                                select: { station_name: true },
                            },
                            destination_station: {
                                select: { station_name: true },
                            },
                        },
                    },
                },
            }),
        ]);

        const trainList = stops.map((s) => ({
            train_number: s.train.train_number,
            train_name: s.train.train_name,
            train_type: s.train.train_type,
            run_days: s.train.run_days,
            classes_available: s.train.classes_available,
            has_pantry: s.train.has_pantry,
            source: {
                code: s.train.source_station_code,
                name: s.train.source_station.station_name,
            },
            destination: {
                code: s.train.destination_station_code,
                name: s.train.destination_station.station_name,
            },
            arrival_time: minsToTimeStr(s.arrival_time_mins),
            departure_time: minsToTimeStr(s.departure_time_mins),
            halt_duration_mins: s.halt_duration_mins,
            day_number: s.day_number,
            platform_number: s.platform_number,
            is_technical_halt: s.is_technical_halt,
        }));

        return NextResponse.json(
            {
                station: {
                    station_code: station.station_code,
                    station_name: station.station_name,
                    state: station.state,
                    zone: station.zone,
                    latitude: station.latitude,
                    longitude: station.longitude,
                    elevation_m: station.elevation_m,
                    station_category: station.station_category,
                    num_platforms: station.num_platforms,
                    amenities: {
                        has_retiring_room: station.has_retiring_room,
                        has_waiting_room: station.has_waiting_room,
                        has_food_plaza: station.has_food_plaza,
                        has_wifi: station.has_wifi,
                    },
                    is_junction: station.is_junction,
                    is_terminus: station.is_terminus,
                },
                trains: {
                    filter,
                    page,
                    per_page: perPage,
                    total: totalCount,
                    total_pages: Math.ceil(totalCount / perPage),
                    items: trainList,
                },
            },
            {
                headers: {
                    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
                },
            }
        );
    } catch (err) {
        console.error(`[/api/station/${stationCode}] Error:`, err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

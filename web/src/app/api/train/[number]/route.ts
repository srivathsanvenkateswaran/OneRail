/**
 * API Route: GET /api/train/[number]
 *
 * Returns full detail for a single train:
 *   - Metadata (name, type, run days, classes, pantry, loco)
 *   - Complete stop list (with station names + coordinates for map)
 *   - Coach composition
 *   - Rake sharing partners
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { minsToTimeStr, formatDuration, minsToDayNumber } from "@/lib/utils";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ number: string }> }
) {
    const { number } = await params;
    const trainNumber = number.trim();

    if (!/^\d{5}$/.test(trainNumber)) {
        return NextResponse.json({ error: "Invalid train number" }, { status: 400 });
    }

    try {
        const train = await prisma.train.findUnique({
            where: { train_number: trainNumber },
            include: {
                // All stops, ordered by sequence, with station lat/lon for map
                stops: {
                    orderBy: { stop_sequence: "asc" },
                    include: {
                        station: {
                            select: {
                                station_code: true,
                                station_name: true,
                                latitude: true,
                                longitude: true,
                                station_category: true,
                                num_platforms: true,
                                is_junction: true,
                            },
                        },
                    },
                },
                // Coach composition ordered by position
                coach_configs: {
                    orderBy: { position_in_train: "asc" },
                },
                // Rake sharing: get all sibling trains in the same group
                rake_memberships: {
                    include: {
                        group: {
                            include: {
                                members: {
                                    include: {
                                        train: {
                                            select: {
                                                train_number: true,
                                                train_name: true,
                                                train_type: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                source_station: {
                    select: { station_code: true, station_name: true },
                },
                destination_station: {
                    select: { station_code: true, station_name: true },
                },
            },
        });

        if (!train) {
            return NextResponse.json({ error: "Train not found" }, { status: 404 });
        }

        // ── Filter & shape stops ───────────────────────────────────────────────
        // Per gemini.md rule 5a: technical halts are included in the data
        // but flagged so the UI can hide them by default.
        const stops = train.stops.map((s) => ({
            stop_sequence: s.stop_sequence,
            station_code: s.station_code,
            station_name: s.station.station_name,
            station_category: s.station.station_category,
            is_junction: s.station.is_junction,
            latitude: s.station.latitude,
            longitude: s.station.longitude,
            arrival_time: minsToTimeStr(s.arrival_time_mins),
            departure_time: minsToTimeStr(s.departure_time_mins),
            halt_duration_mins: s.halt_duration_mins,
            day_number: s.day_number,
            distance_from_source_km: s.distance_from_source_km,
            platform_number: s.platform_number,
            is_technical_halt: s.is_technical_halt,  // UI hides these by default
        }));

        // ── Rake sharing: deduplicate and exclude self ─────────────────────────
        const sharedTrains = new Map<string, { train_number: string; train_name: string; train_type: string }>();
        for (const membership of train.rake_memberships) {
            for (const member of membership.group.members) {
                if (member.train_number !== trainNumber) {
                    sharedTrains.set(member.train_number, {
                        train_number: member.train.train_number,
                        train_name: member.train.train_name,
                        train_type: member.train.train_type,
                    });
                }
            }
        }

        // ── Calculate total distance and duration from stops ───────────────────
        const lastStop = train.stops.at(-1);
        const firstStop = train.stops.at(0);
        const totalDist = lastStop?.distance_from_source_km ?? train.total_distance_km;
        const totalMins = train.total_duration_mins
            ?? (
                lastStop && firstStop
                    ? (lastStop.arrival_time_mins ?? 0) - (firstStop.departure_time_mins ?? 0)
                    : null
            );

        return NextResponse.json(
            {
                train_number: train.train_number,
                train_name: train.train_name,
                train_type: train.train_type,
                source_station: train.source_station,
                destination_station: train.destination_station,
                run_days: train.run_days,
                classes_available: train.classes_available,
                has_pantry: train.has_pantry,
                locomotive_type: train.locomotive_type,
                total_distance_km: totalDist,
                total_duration_mins: totalMins,
                total_duration_label: formatDuration(totalMins),
                stops,
                coach_config: train.coach_configs,
                rake_sharing: Array.from(sharedTrains.values()),
                // Map-ready coordinates (non-null stops only)
                route_coordinates: stops
                    .filter((s) => s.latitude !== null && s.longitude !== null)
                    .map((s) => ({
                        code: s.station_code,
                        name: s.station_name,
                        lat: s.latitude,
                        lon: s.longitude,
                        seq: s.stop_sequence,
                    })),
            },
            {
                headers: {
                    "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120",
                },
            }
        );
    } catch (err) {
        console.error(`[/api/train/${trainNumber}] Error:`, err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

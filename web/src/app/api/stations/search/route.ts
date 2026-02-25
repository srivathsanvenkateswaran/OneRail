/**
 * API Route: GET /api/stations/search
 *
 * Autocomplete search for stations — used in the Search page's
 * "From" and "To" inputs.
 *
 * Query params:
 *   q    — partial station name or code (min 2 chars)
 *   zone — optional zone filter (e.g. "SR")
 *
 * Returns up to 10 matching stations ordered by relevance.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const zone = req.nextUrl.searchParams.get("zone")?.toUpperCase().trim();

    if (q.length < 2) {
        return NextResponse.json({ results: [] });
    }

    try {
        const results = await prisma.station.findMany({
            where: {
                AND: [
                    zone ? { zone_code: zone } : {},
                    {
                        OR: [
                            // Exact prefix match on station code (highest priority)
                            { station_code: { startsWith: q.toUpperCase() } },
                            // Case-insensitive name match
                            { station_name: { contains: q, mode: "insensitive" } },
                        ],
                    },
                ],
            },
            select: {
                station_code: true,
                station_name: true,
                state: true,
                zone_code: true,
                station_category: true,
                is_junction: true,
            },
            orderBy: [
                // Prefer A1/A category (major stations) in results
                { station_category: "asc" },
                { station_name: "asc" },
            ],
            take: 10,
        });

        return NextResponse.json(
            { results },
            {
                headers: {
                    "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
                },
            }
        );
    } catch (err) {
        console.error("[/api/stations/search] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

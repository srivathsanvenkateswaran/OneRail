import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/atlas/geojson
 *
 * Query params:
 *   bbox=minLon,minLat,maxLon,maxLat  (optional, for viewport filtering)
 *   type=tracks|stations|all          (default: all)
 *   gauge=BG|MG|NG                    (optional filter)
 *   status=Operational|Under Construction  (optional filter)
 *   limit=<number>                    (default: 50000)
 */
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;

    const bboxParam = searchParams.get('bbox');
    const type = searchParams.get('type') || 'all';
    const gaugeFilter = searchParams.get('gauge');
    const statusFilter = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200000'), 300000);

    // Parse optional bbox
    let bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null = null;
    if (bboxParam) {
        const [minLon, minLat, maxLon, maxLat] = bboxParam.split(',').map(Number);
        if (!isNaN(minLon) && !isNaN(minLat) && !isNaN(maxLon) && !isNaN(maxLat)) {
            bbox = { minLon, minLat, maxLon, maxLat };
        }
    }

    try {
        const features: any[] = [];

        // ── TRACKS ────────────────────────────────────────────────────────────
        if (type === 'all' || type === 'tracks') {
            // Use raw SQL to include zone_code (Prisma client types may lag behind schema changes)
            const whereClauses: string[] = [];
            const sqlParams: any[] = [];
            let paramIdx = 1;

            if (gaugeFilter) {
                whereClauses.push(`t.gauge = $${paramIdx++}`);
                sqlParams.push(gaugeFilter);
            }
            if (statusFilter) {
                whereClauses.push(`t.status = $${paramIdx++}`);
                sqlParams.push(statusFilter);
            }
            sqlParams.push(limit);
            const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            const rawSql = `
                SELECT t.id, t.from_station_code, t.to_station_code,
                       t.gauge, t.electrified, t.status, t.track_type, t.zone_code,
                       t.path_coordinates,
                       fs.longitude AS from_lon, fs.latitude AS from_lat,
                       ts.longitude AS to_lon,   ts.latitude AS to_lat
                FROM "TrackSegment" t
                LEFT JOIN "Station" fs ON fs.station_code = t.from_station_code
                LEFT JOIN "Station" ts ON ts.station_code = t.to_station_code
                ${whereStr}
                LIMIT $${paramIdx}
            `;

            const trackSegments: any[] = await prisma.$queryRawUnsafe(rawSql, ...sqlParams);

            for (const seg of trackSegments) {
                let coords: number[][] = [];

                const rawPath = seg.path_coordinates;
                const parsedPath = typeof rawPath === 'string' ? JSON.parse(rawPath) : rawPath;
                if (parsedPath && Array.isArray(parsedPath) && parsedPath.length >= 2) {
                    coords = parsedPath;
                } else if (seg.from_lon && seg.from_lat && seg.to_lon && seg.to_lat) {
                    coords = [
                        [seg.from_lon, seg.from_lat],
                        [seg.to_lon, seg.to_lat]
                    ];
                }

                if (coords.length < 2) continue;

                // bbox filter — check if any coord falls within viewport
                if (bbox) {
                    const inBbox = coords.some(([lon, lat]) =>
                        lon >= bbox!.minLon && lon <= bbox!.maxLon &&
                        lat >= bbox!.minLat && lat <= bbox!.maxLat
                    );
                    if (!inBbox) continue;
                }

                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: {
                        type: 'track',
                        id: seg.id,
                        from: seg.from_station_code,
                        to: seg.to_station_code,
                        gauge: seg.gauge,
                        electrified: seg.electrified,
                        status: seg.status,
                        track_type: seg.track_type,
                        zone: seg.zone_code || null
                    }
                });
            }
        }

        // ── STATIONS ──────────────────────────────────────────────────────────
        if (type === 'all' || type === 'stations') {
            const stationWhere: any = {
                latitude: { not: null },
                longitude: { not: null }
            };

            // Exclude OSM virtual hubs from stations layer (they clutter the map)
            stationWhere.station_code = { not: { startsWith: 'OSM_' } };

            // Apply bbox filter at DB level if possible
            if (bbox) {
                stationWhere.AND = [
                    { latitude: { gte: bbox.minLat, lte: bbox.maxLat } },
                    { longitude: { gte: bbox.minLon, lte: bbox.maxLon } }
                ];
            }

            const stations = await prisma.station.findMany({
                where: stationWhere,
                select: {
                    station_code: true,
                    station_name: true,
                    latitude: true,
                    longitude: true,
                    zone_code: true,
                    is_junction: true
                },
                take: 50000
            });

            for (const st of stations) {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [st.longitude, st.latitude]
                    },
                    properties: {
                        type: 'station',
                        code: st.station_code,
                        name: st.station_name,
                        zone: st.zone_code,
                        is_junction: st.is_junction
                    }
                });
            }
        }

        const geojson = {
            type: 'FeatureCollection',
            features,
            metadata: {
                total: features.length,
                tracks: features.filter(f => f.properties.type === 'track').length,
                stations: features.filter(f => f.properties.type === 'station').length,
                generated_at: new Date().toISOString()
            }
        };

        return NextResponse.json(geojson, {
            headers: {
                // Cache for 5 minutes — atlas data doesn't change often
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
            }
        });

    } catch (error: any) {
        console.error('Atlas GeoJSON error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

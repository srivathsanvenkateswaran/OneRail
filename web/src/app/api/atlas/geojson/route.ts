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

        // ── TRACK SECTIONS (Logical corridors) ────────────────────────────────
        if (type === 'all' || type === 'tracks') {
            const rawSql = `
                SELECT ts.id, ts.from_node_code, ts.to_node_code,
                       f.station_name as from_name, t.station_name as to_name,
                       ts.distance_km, ts.num_stations, ts.track_type, ts.electrified, ts.gauge,
                       ts.status, ts.zone_code as zone, ts.mps, ts.path_coordinates
                FROM "TrackSection" ts
                LEFT JOIN "Station" f ON ts.from_node_code = f.station_code
                LEFT JOIN "Station" t ON ts.to_node_code = t.station_code
                LIMIT $1
            `;
            const sections: any[] = await prisma.$queryRawUnsafe(rawSql, limit);

            for (const sec of sections) {
                const rawPath = sec.path_coordinates;
                const coords = typeof rawPath === 'string' ? JSON.parse(rawPath) : rawPath;
                
                if (!coords || !Array.isArray(coords) || coords.length < 2) continue;

                if (bbox) {
                    const inBbox = coords.some(([lon, lat]: [number, number]) =>
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
                        id: sec.id,
                        from: sec.from_name || sec.from_node_code,
                        to: sec.to_name || sec.to_node_code,
                        distance_km: sec.distance_km,
                        num_stations: sec.num_stations,
                        track_type: sec.track_type,
                        electrified: sec.electrified,
                        gauge: sec.gauge,
                        status: sec.status || 'Operational',
                        zone: sec.zone,
                        mps: sec.mps
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
                    is_junction: true,
                    is_terminus: true
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
                        is_junction: st.is_junction,
                        is_terminus: st.is_terminus
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
        return NextResponse.json({ 
            error: error.message,
            stack: error.stack,
            hint: 'Check if TrackSection table exists and prisma generate was run.'
        }, { status: 500 });
    }
}

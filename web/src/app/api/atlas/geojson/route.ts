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
    const limit = Math.min(parseInt(searchParams.get('limit') || '50000'), 100000);

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
            const trackWhere: any = {};
            if (gaugeFilter) trackWhere.gauge = gaugeFilter;
            if (statusFilter) trackWhere.status = statusFilter;

            const trackSegments = await prisma.trackSegment.findMany({
                where: trackWhere,
                select: {
                    id: true,
                    from_station_code: true,
                    to_station_code: true,
                    gauge: true,
                    electrified: true,
                    status: true,
                    track_type: true,
                    path_coordinates: true,
                    from_station: { select: { latitude: true, longitude: true } },
                    to_station: { select: { latitude: true, longitude: true } }
                },
                take: limit
            });

            for (const seg of trackSegments) {
                let coords: number[][] = [];

                if (seg.path_coordinates && Array.isArray(seg.path_coordinates) && (seg.path_coordinates as any[]).length >= 2) {
                    coords = seg.path_coordinates as number[][];
                } else if (
                    seg.from_station?.longitude && seg.from_station?.latitude &&
                    seg.to_station?.longitude && seg.to_station?.latitude
                ) {
                    coords = [
                        [seg.from_station.longitude, seg.from_station.latitude],
                        [seg.to_station.longitude, seg.to_station.latitude]
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
                        track_type: seg.track_type
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
                take: 10000
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

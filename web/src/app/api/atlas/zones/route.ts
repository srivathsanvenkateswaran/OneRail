import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ── Convex Hull (Graham Scan) ────────────────────────────────────────────────
function cross(O: number[], A: number[], B: number[]) {
    return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
}

function convexHull(points: number[][]): number[][] {
    const n = points.length;
    if (n < 3) return points;
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lower: number[][] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
            lower.pop();
        lower.push(p);
    }
    const upper: number[][] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
            upper.pop();
        upper.push(p);
    }
    upper.pop();
    lower.pop();
    return [...lower, ...upper];
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function GET() {
    // Fetch all stations that have a zone and coordinates
    const stations = await prisma.station.findMany({
        where: {
            zone_code: { not: null },
            latitude:  { not: null },
            longitude: { not: null },
        },
        select: { zone_code: true, longitude: true, latitude: true }
    });

    // Group by zone
    const zoneMap = new Map<string, number[][]>();
    for (const s of stations) {
        const pts = zoneMap.get(s.zone_code!) ?? [];
        pts.push([s.longitude!, s.latitude!]);
        zoneMap.set(s.zone_code!, pts);
    }

    // Build GeoJSON FeatureCollection — one Feature per zone
    const features: any[] = [];
    for (const [zoneCode, pts] of zoneMap.entries()) {
        if (pts.length < 3) continue;
        const hull = convexHull(pts);
        if (hull.length < 3) continue;
        // Close the ring
        const ring = [...hull, hull[0]];

        features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: { zone: zoneCode }
        });
    }

    return NextResponse.json(
        { type: 'FeatureCollection', features },
        { headers: { 'Cache-Control': 'public, max-age=86400' } }
    );
}

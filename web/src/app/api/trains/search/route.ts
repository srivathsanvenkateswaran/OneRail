import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Cleans a raw train name from the DB.
 * Raw format examples:
 *   "12941/Parasnath Express (PT)पारसनाथBVC --> ASN"
 *   "01501⇒01501XX/Ratnagiri - Madgaon Express Specialरत्..."
 * We want just the English name: "Parasnath Express" / "Ratnagiri - Madgaon Express Special"
 */
function cleanTrainName(raw: string): string {
    // Strip everything after the first non-ASCII (Hindi/Unicode) character block
    // and also strip the "NUMBER/..." prefix that sometimes leaks through
    let name = raw;

    // Remove leading NUMBER⇒NUMBER/ or NUMBER/ prefix
    name = name.replace(/^\d+[⇒→\-]*\w*\//, '');

    // Strip from first occurrence of a Hindi/Devanagari character onwards
    name = name.replace(/[\u0900-\u097F].*/u, '');

    // Strip trailing junk like "3 RailFans", source/dest station codes
    name = name.replace(/\s+\d+\s+RailFans.*$/i, '');
    name = name.replace(/\s*[A-Z]{2,4}\/.*$/, ''); // strip "BVC/Bhavnagar Terminus..."

    // Strip suffix in parentheses at the end like "(PT)" — keep the clean name
    name = name.replace(/\s*\([A-Z]+\)\s*$/, '');

    return name.trim();
}

export async function GET(req: NextRequest) {
    const query = req.nextUrl.searchParams.get('q');

    if (!query || query.length < 2) {
        return NextResponse.json([]);
    }

    try {
        const trains = await prisma.train.findMany({
            where: {
                OR: [
                    { train_number: { contains: query, mode: 'insensitive' } },
                    { train_name: { contains: query, mode: 'insensitive' } },
                ],
            },
            select: {
                train_number: true,
                train_name: true,
                train_type: true,
                source_station: {
                    select: { station_code: true, station_name: true }
                },
                destination_station: {
                    select: { station_code: true, station_name: true }
                },
            },
            take: 20,
        });

        // Clean names before returning
        const result = trains.map(t => ({
            ...t,
            train_name: cleanTrainName(t.train_name),
        }));

        return NextResponse.json(result);
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

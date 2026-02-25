import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const count = await prisma.train.count();
        return NextResponse.json({ success: true, count, db_url_set: !!process.env.DATABASE_URL });
    } catch (err: any) {
        return NextResponse.json({
            success: false,
            error: err.message,
            stack: err.stack,
            env: process.env.NODE_ENV
        }, { status: 500 });
    }
}

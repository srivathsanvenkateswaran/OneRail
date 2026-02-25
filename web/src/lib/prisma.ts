/**
 * lib/prisma.ts — Prisma 7 Client Singleton for Next.js
 *
 * Prisma 7 removed direct URL connection from PrismaClient.
 * It now requires a Driver Adapter. We use @prisma/adapter-pg
 * which wraps a pg.Pool.
 *
 * See: https://pris.ly/d/prisma7-client-config
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
    // PrismaPg accepts a pg.PoolConfig object directly
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
    globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

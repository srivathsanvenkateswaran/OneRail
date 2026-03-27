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

import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
    // We create a pg Pool explicitly which is more robust for SCRAM-SHA-256
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
    globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

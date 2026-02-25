/**
 * lib/prisma.ts — Singleton Prisma client for Next.js.
 *
 * In development, Next.js hot-reload creates new module instances
 * on every change, which would exhaust the DB connection pool.
 * This pattern stores one client on the global object so it persists
 * across hot reloads.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log:
            process.env.NODE_ENV === "development"
                ? ["query", "error", "warn"]
                : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const activity = await prisma.$queryRaw<any[]>`
        SELECT pid, usename, application_name, state, wait_event_type, wait_event,
               left(query, 80) as query,
               (now() - query_start)::text as duration
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
        ORDER BY query_start ASC NULLS LAST
    `;

    console.log(`\nActive connections: ${activity.length}`);
    for (const r of activity) {
        console.log(`  PID ${String(r.pid).padEnd(6)} | ${(r.state ?? 'idle').padEnd(12)} | wait: ${(r.wait_event ?? '-').padEnd(20)} | dur: ${(r.duration ?? '').slice(0,12).padEnd(14)} | ${r.query ?? ''}`);
    }

    const locks = await prisma.$queryRaw<any[]>`
        SELECT l.pid, l.locktype, l.mode, l.granted, a.state, left(a.query, 80) as query
        FROM pg_locks l
        JOIN pg_stat_activity a ON l.pid = a.pid
        WHERE NOT l.granted OR l.mode ILIKE '%Exclusive%'
        ORDER BY l.granted, l.pid
    `;

    console.log(`\nBlocking / exclusive locks: ${locks.length}`);
    for (const r of locks) {
        console.log(`  PID ${r.pid} | ${r.locktype} | ${r.mode} | granted=${r.granted} | ${r.query}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

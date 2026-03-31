import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const pids = [8272, 36296, 38328, 38968];
    for (const pid of pids) {
        const result = await prisma.$queryRaw<any[]>`SELECT pg_terminate_backend(${pid}::int) as killed`;
        console.log(`PID ${pid}: terminated=${result[0].killed}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const classes = await prisma.coachConfig.findMany({
        select: { class_code: true },
        distinct: ['class_code'],
    });
    console.log(classes.map(c => c.class_code));
}

main().catch(console.error).finally(() => prisma.$disconnect());

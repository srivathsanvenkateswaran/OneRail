import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const trainCount = await prisma.train.count();
        console.log(`Connection successful! Total trains in DB: ${trainCount}`);
    } catch (error) {
        console.error('Failed to connect to DB:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();

import { prisma } from '../src/lib/prisma';

async function testLibPrisma() {
    console.log('Testing lib/prisma.ts connection...');
    try {
        const count = await prisma.train.count();
        console.log('Connection successful! Train count:', count);
    } catch (err) {
        console.error('Connection failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testLibPrisma();

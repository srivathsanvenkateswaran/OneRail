import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function testSearchFinal() {
    console.log('Testing Search Logic...');
    const prisma = new (PrismaClient as any)({
        datasourceUrl: process.env.DATABASE_URL
    });

    const query = '01011';
    try {
        const trains = await prisma.train.findMany({
            where: {
                OR: [
                    { train_number: { contains: query, mode: 'insensitive' } },
                    { train_name: { contains: query, mode: 'insensitive' } },
                ],
            },
            include: {
                source_station: true,
                destination_station: true,
            },
            take: 5,
        });

        console.log(`Results for "${query}":`, trains.length);
        trains.forEach(t => console.log(`- ${t.train_number}: ${t.train_name}`));
    } catch (err) {
        console.error('Search Logic Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testSearchFinal();

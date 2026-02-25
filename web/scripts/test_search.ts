import { prisma } from '../src/lib/prisma';

async function testSearch() {
    const query = '11019'; // Known train from previous view_file
    console.log(`Searching for: ${query}`);

    const results = await prisma.train.findMany({
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
        take: 5
    });

    console.log('Results found:', results.length);
    results.forEach(t => console.log(`- ${t.train_number}: ${t.train_name}`));
}

testSearch().catch(console.error).finally(() => prisma.$disconnect());

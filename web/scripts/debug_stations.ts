import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const missingJunctions = await prisma.station.findMany({
    where: {
      is_junction: true,
      OR: [
        { latitude: null },
        { longitude: null }
      ]
    },
    select: {
      station_code: true,
      station_name: true
    }
  });

  console.log(`Found ${missingJunctions.length} junctions with missing coordinates:`);
  console.log(missingJunctions);
  await prisma.$disconnect();
}
main();

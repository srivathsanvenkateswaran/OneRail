import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const count = await prisma.trackSegment.count({
    where: {
      status: 'Under Construction'
    }
  });
  console.log('Under Construction segments count:', count);

  const sample = await prisma.trackSegment.findFirst({
    where: {
      status: 'Under Construction'
    }
  });
  console.log('Sample Under Construction segment:', sample);
}

main().catch(console.error).finally(() => prisma.$disconnect());

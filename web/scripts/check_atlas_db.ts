import dotenv from 'dotenv';
dotenv.config();
import { prisma } from '../src/lib/prisma';

async function check() {
  console.log('DATABASE_URL is set:', !!process.env.DATABASE_URL);
  try {
    const trackCount = await prisma.trackSegment.count();
    const stationCount = await prisma.station.count();
    
    console.log(`Tracks: ${trackCount}`);
    console.log(`Stations: ${stationCount}`);
  } catch (err) {
    console.error('Prisma connection error detail:', err);
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());

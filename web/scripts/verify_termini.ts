import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const names = ['Kanniyakumari', 'Chennai Central', 'Bodinayakannur', 'Thoothukudi', 'Rameshwaram', 'Udhagamandalam', 'Puducherry', 'Thiruchendur', 'Vasco', 'Howrah', 'CSMT', 'Mumbai CST'];
    for (const n of names) {
        const s = await prisma.station.findFirst({
            where: { station_name: { contains: n } },
            select: { station_code: true, station_name: true, is_junction: true, is_terminus: true }
        });
        if (s) {
            console.log(`${n}: ${s.station_name} (${s.station_code}) junction=${s.is_junction} terminus=${s.is_terminus}`);
        } else {
            console.log(`${n}: NOT FOUND`);
        }
    }
    await prisma.$disconnect();
}

main().catch(console.error);

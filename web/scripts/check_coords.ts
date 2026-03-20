import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

async function checkStations() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    await client.connect();
    const res = await client.query('SELECT COUNT(*) as count FROM "Station" WHERE latitude IS NOT NULL AND longitude IS NOT NULL');
    console.log(`Stations with coordinates: ${res.rows[0].count}`);

    const total = await client.query('SELECT COUNT(*) as count FROM "Station"');
    console.log(`Total stations: ${total.rows[0].count}`);

    if (res.rows[0].count === '0') {
        console.log("No stations have coordinates. We need to scrape them.");
    }

    await client.end();
}

checkStations().catch(console.error);

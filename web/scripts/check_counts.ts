import 'dotenv/config';
import pg from 'pg';

async function check() {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const trainCount = await client.query('SELECT COUNT(*) FROM "Train"');
    const stopCount = await client.query('SELECT COUNT(*) FROM "TrainStop"');
    const stationCount = await client.query('SELECT COUNT(*) FROM "Station"');
    const coachCount = await client.query('SELECT COUNT(*) FROM "CoachConfig"');

    console.log(`📊 Database Status Check:`);
    console.log(`- Trains:   ${trainCount.rows[0].count}`);
    console.log(`- Stops:    ${stopCount.rows[0].count}`);
    console.log(`- Stations: ${stationCount.rows[0].count}`);
    console.log(`- Coaches:  ${coachCount.rows[0].count}`);

    await client.end();
}

check().catch(console.error);

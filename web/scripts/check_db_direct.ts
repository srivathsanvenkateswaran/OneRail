import pg from 'pg';
const { Client } = pg;

async function checkDb() {
    const client = new Client({
        connectionString: "postgresql://postgres:Srivathsan37@localhost:5432/onerail"
    });

    await client.connect();
    console.log('Connected to DB');

    const res = await client.query('SELECT count(*) FROM "Train"');
    console.log('Total trains in DB:', res.rows[0].count);

    const sample = await client.query('SELECT train_number, train_name FROM "Train" LIMIT 5');
    console.log('Sample trains:');
    sample.rows.forEach(r => console.log(`- ${r.train_number}: ${r.train_name}`));

    await client.end();
}

checkDb().catch(console.error);

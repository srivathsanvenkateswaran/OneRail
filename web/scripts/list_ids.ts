import pg from 'pg';
const { Client } = pg;

async function checkIds() {
    const client = new Client({
        connectionString: "postgresql://postgres:Srivathsan37@localhost:5432/onerail"
    });

    await client.connect();
    const res = await client.query('SELECT train_number FROM "Train" ORDER BY train_number ASC LIMIT 20');
    console.log('First 20 IDs in DB:');
    res.rows.forEach(r => console.log(r.train_number));

    const res2 = await client.query('SELECT train_number FROM "Train" ORDER BY train_number DESC LIMIT 20');
    console.log('\nLast 20 IDs in DB:');
    res2.rows.forEach(r => console.log(r.train_number));

    await client.end();
}

checkIds().catch(console.error);

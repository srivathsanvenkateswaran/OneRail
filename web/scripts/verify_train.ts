import pg from 'pg';
const { Client } = pg;

async function findTrain() {
    const client = new Client({
        connectionString: "postgresql://postgres:Srivathsan37@localhost:5432/onerail"
    });

    await client.connect();
    const query = '12621';
    const res = await client.query('SELECT * FROM "Train" WHERE train_number = $1', [query]);
    console.log(`Searching for ${query}...`);
    if (res.rows.length === 0) {
        console.log('Train not found!');
    } else {
        console.log('Train found:', res.rows[0].train_name);
    }
    await client.end();
}

findTrain().catch(console.error);

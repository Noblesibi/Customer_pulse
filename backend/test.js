const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/customer_pulse' });
client.connect().then(() => client.query(`SELECT * FROM "Contacts" WHERE "accountId" = 'acc-25687z2jn'`))
.then(res => console.log('Count:', res.rows.length))
.finally(() => client.end());

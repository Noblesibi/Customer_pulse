const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/customer_pulse' });
client.connect().then(() => client.query(`SELECT "contactId", "name", "accountId" FROM "Contacts"`))
.then(res => console.table(res.rows))
.finally(() => client.end());

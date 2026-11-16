const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/customer_pulse'
});
async function run() {
  await client.connect();
  
  const uid = 'ldap-rhkufekom';
  const name = 'Amina Rashad';
  const accId = 'acc-amina-1';
  const conId = 'con-amina-1';
  const intId = 'int-amina-1';
  const taskId = 'task-amina-1';

  // Delete existing just in case
  await client.query('DELETE FROM "Tasks" WHERE "taskId" = $1', [taskId]);
  await client.query('DELETE FROM "Interactions" WHERE "interactionId" = $1', [intId]);
  await client.query('DELETE FROM "Contacts" WHERE "contactId" = $1', [conId]);
  await client.query('DELETE FROM "Accounts" WHERE "accountId" = $1', [accId]);

  // Insert Account
  await client.query(`
    INSERT INTO "Accounts" 
    ("accountId", "companyName", "industry", "region", "healthScore", "ownerId", "ownerName", "journeyStage")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [accId, 'Amina Test Corp', 'Technology', 'North America', 85, uid, name, 'Consideration']);

  // Insert Contact
  await client.query(`
    INSERT INTO "Contacts" 
    ("contactId", "accountId", "name", "email", "designation", "hierarchyTag", "ownerId")
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [conId, accId, 'John Doe CEO', 'john.doe@aminatest.com', 'Chief Executive Officer', 'CXO', uid]);

  // Insert Interaction
  await client.query(`
    INSERT INTO "Interactions" 
    ("interactionId", "accountId", "contactId", "source", "subject", "messageText", "date", "time", "loggedByUid", "loggedByName", "sentiment", "businessOpportunities")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [intId, accId, conId, 'Meeting', 'Initial Sync', 'Discussed project scope and expansion opportunities for Q4.', new Date().toISOString().split('T')[0], '14:00', uid, name, 'Positive', 'Expansion into Q4']);

  // Insert Task
  await client.query(`
    INSERT INTO "Tasks" 
    ("taskId", "title", "description", "assignedToUid", "assignedToName", "assignedByUid", "assignedByName", "accountId", "status", "priority", "dueDate")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [taskId, 'Follow up on Q4 expansion', 'Send proposal for Q4 expansion as discussed in the meeting.', uid, name, uid, name, accId, 'Open', 'High', new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]]);

  console.log('Dummy data successfully added to PostgreSQL!');
  await client.end();
}
run().catch(console.error);

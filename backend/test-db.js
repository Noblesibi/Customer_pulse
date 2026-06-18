import dotenv from 'dotenv';
import { db, initializeDatabase } from './src/config/mssql.js';

dotenv.config();

console.log('🏁 Starting SQL Server Adapter verification test...');
console.log(`Server: ${process.env.DB_SERVER || 'localhost'}`);
console.log(`Database: ${process.env.DB_DATABASE || 'CustomerPulse'}`);

async function runTests() {
  try {
    // 1. Initialize DB (Schema check & Seeding)
    console.log('\nStep 1: Initializing database and tables...');
    await initializeDatabase();
    console.log('✅ Step 1 passed.');

    // 2. Insert test user document using set()
    console.log('\nStep 2: Testing INSERT/UPSERT using db.collection().doc().set()...');
    const testUserUid = 'test-user-123';
    const testUserData = {
      uid: testUserUid,
      email: 'testuser@pulse.com',
      name: 'Test User Profile',
      role: 'Employee',
      position: 'Senior Tester',
      department: 'Quality Assurance',
      projects: [{ name: 'Apex Financial Services', role: 'Tester' }],
      employees: ['Assistant 1'],
      createdAt: new Date().toISOString()
    };
    
    await db.collection('users').doc(testUserUid).set(testUserData);
    console.log('✅ Test user document set.');

    // 3. Read test user document using get()
    console.log('\nStep 3: Testing document fetch using db.collection().doc().get()...');
    let docSnap = await db.collection('users').doc(testUserUid).get();
    if (!docSnap.exists) {
      throw new Error('Test user document does not exist!');
    }
    const retrievedData = docSnap.data();
    console.log('Retrieved user info:', JSON.stringify(retrievedData, null, 2));
    
    if (retrievedData.email !== testUserData.email) {
      throw new Error(`Email mismatch! Expected ${testUserData.email}, got ${retrievedData.email}`);
    }
    if (!Array.isArray(retrievedData.projects) || retrievedData.projects[0].name !== 'Apex Financial Services') {
      throw new Error('Projects array JSON deserialization failed!');
    }
    console.log('✅ Step 3 passed. Document fetched and JSON parsed correctly.');

    // 4. Update document using update()
    console.log('\nStep 4: Testing update using db.collection().doc().update()...');
    await db.collection('users').doc(testUserUid).update({
      position: 'QA Lead',
      name: 'Test User Profile Updated'
    });
    
    docSnap = await db.collection('users').doc(testUserUid).get();
    const updatedData = docSnap.data();
    console.log('Updated user info:', JSON.stringify(updatedData, null, 2));
    if (updatedData.position !== 'QA Lead' || updatedData.name !== 'Test User Profile Updated') {
      throw new Error('Update failed or values mismatched!');
    }
    console.log('✅ Step 4 passed.');

    // 5. Test query using where().get()
    console.log('\nStep 5: Testing query using db.collection().where().get()...');
    const querySnap = await db.collection('users').where('email', '==', 'testuser@pulse.com').get();
    console.log(`Query returned ${querySnap.size} document(s).`);
    if (querySnap.size === 0) {
      throw new Error('Query by email returned 0 records!');
    }
    
    let found = false;
    querySnap.docs.forEach(doc => {
      console.log(`Found doc: ${doc.id} - ${doc.data().name} (${doc.data().email})`);
      if (doc.id === testUserUid) found = true;
    });
    
    if (!found) {
      throw new Error('Expected document was not found in query results!');
    }
    console.log('✅ Step 5 passed.');

    // 6. Test delete document
    console.log('\nStep 6: Testing delete using doc().delete()...');
    await db.collection('users').doc(testUserUid).delete();
    
    docSnap = await db.collection('users').doc(testUserUid).get();
    if (docSnap.exists) {
      throw new Error('Document still exists after deletion!');
    }
    console.log('✅ Step 6 passed. Document successfully deleted.');

    console.log('\n🎉 ALL DATABASE TESTS PASSED SUCCESSFULLY! The SQL Server Firestore-adapter is working perfectly.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ DATABASE TESTS FAILED:', err.message);
    process.exit(1);
  }
}

runTests();

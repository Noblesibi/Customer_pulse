import express from 'express';
import accountRouter from './src/routes/account.routes.js';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

app.use('/api/accounts', accountRouter);

app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const server = app.listen(5001, async () => {
  console.log('Test server running on port 5001');
  
  const token = jwt.sign(
    { uid: 'test', name: 'Test', role: 'Admin', email: 'test@test.com' },
    process.env.JWT_SECRET || 'customer-pulse-super-secret-key'
  );

  try {
    const res = await fetch('http://localhost:5001/api/accounts/bulk-delete', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ ids: ['test-id'] })
    });
    
    console.log('Status:', res.status);
    const json = await res.json();
    console.log('Response:', json);
  } catch (err) {
    console.error('Fetch error:', err);
  } finally {
    server.close();
  }
});

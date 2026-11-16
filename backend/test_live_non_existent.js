import express from 'express';
import accountRouter from './src/routes/account.routes.js';
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  { uid: 'test', name: 'Test', role: 'Admin', email: 'test@test.com' },
  process.env.JWT_SECRET || 'customer-pulse-super-secret-key'
);

async function run() {
  try {
    const res = await fetch('http://localhost:5000/api/accounts/non-existent-route', {
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
  }
}
run();

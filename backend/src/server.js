import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';

// Routes imports
import authRouter from './routes/auth.routes.js';
import accountRouter from './routes/account.routes.js';
import contactRouter from './routes/contact.routes.js';
import interactionRouter from './routes/interaction.routes.js';
import riskRouter from './routes/risk.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';
import summaryRouter from './routes/summary.routes.js';
import notificationRouter from './routes/notification.routes.js';

// Webhook imports
import { handleOutlookWebhook, handleTeamsWebhook } from './controllers/webhook.controller.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Standard Middlewares
app.use(cors({
  origin: '*', // Allow all client links for sandbox development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));

// Webhook Endpoints (Mounted before authenticateToken since Microsoft Graph bypasses jwt auth)
app.post('/api/webhooks/outlook', handleOutlookWebhook);
app.post('/api/webhooks/teams', handleTeamsWebhook);

// REST API Routes
app.use('/api/auth', authRouter);
app.use('/api/accounts', accountRouter);
app.use('/api/contacts', contactRouter);
app.use('/api/interactions', interactionRouter);
app.use('/api/risks', riskRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/notifications', notificationRouter);

// Service Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: {
      firebaseMode: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'Production' : 'Mock/Development',
      geminiMode: process.env.GEMINI_API_KEY ? 'Gemini API' : 'Local NLP Fallback'
    }
  });
});

// 404 Route handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Customer Pulse Backend running on port ${PORT}`);
  console.log(`🔗 Health check available at http://localhost:${PORT}/api/health`);
});

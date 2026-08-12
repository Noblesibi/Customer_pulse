import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import path from 'path';

// Routes imports
import authRouter from './routes/auth.routes.js';
import accountRouter from './routes/account.routes.js';
import contactRouter from './routes/contact.routes.js';
import interactionRouter from './routes/interaction.routes.js';
import taskRouter from './routes/task.routes.js';
import riskRouter from './routes/risk.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';
import summaryRouter from './routes/summary.routes.js';
import notificationRouter from './routes/notification.routes.js';
import activityRouter from './routes/activity.routes.js';
import aiRouter from './routes/ai.routes.js';
import employeeRouter from './routes/employee.routes.js';

// Webhook imports
import { handleOutlookWebhook, handleTeamsWebhook } from './controllers/webhook.controller.js';

// Sync scheduler import
import { startSyncScheduler } from './services/userSync.service.js';
import { startEmailScheduler } from './services/notification/EmailScheduler.js';
import emailEngineRouter from './routes/email-engine.routes.js';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security Headers (Helmet) ──────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "*"],
      connectSrc: ["'self'", "http://localhost:5000", "http://localhost:5173", "http://10.15.0.191", "https://hrapps.nestdigital.com:8085"]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ── Rate Limiting (Brute-force & DoS protection) ───────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit login/auth attempts to 30 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// ── Secure CORS Configuration ───────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests or allowed origins
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy: Origin not allowed.'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan('dev'));

// Static Uploads Folder
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Webhook Endpoints (Mounted before authenticateToken since Microsoft Graph bypasses jwt auth)
app.post('/api/webhooks/outlook', handleOutlookWebhook);
app.post('/api/webhooks/teams', handleTeamsWebhook);

// REST API Routes
app.use('/api/auth', authRouter);
app.use('/api/accounts', accountRouter);
app.use('/api/contacts', contactRouter);
app.use('/api/interactions', interactionRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/risks', riskRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/activity-logs', activityRouter);
app.use('/api/ai', aiRouter);
app.use('/api/employees', employeeRouter);
app.use('/api/email-engine', emailEngineRouter);

// Service Health check
app.get('/api/health', (req, res) => {
  const ldapEnabled = process.env.LDAP_ENABLED || 'false';
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: {
      database:  process.env.DB_TYPE    || 'mock',
      ldap:      ldapEnabled === 'true' ? `enabled (${process.env.LDAP_URL || 'unconfigured'})`
               : ldapEnabled === 'mock' ? 'mock (simulation mode)'
               : 'disabled',
      rbac:      'enabled',
      ai:        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
               ? 'Gemini API' : 'Local NLP Fallback'
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
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({
    error: 'Internal Server Error',
    message: isDev ? err.message : 'An unexpected internal error occurred. Please contact system administrator.'
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Customer Pulse Backend running on port ${PORT}`);
  console.log(`🔗 Health check available at http://localhost:${PORT}/api/health`);
  
  // Start the background employee sync scheduler
  startSyncScheduler();
  // Start the email notification engine scheduler
  startEmailScheduler();
});

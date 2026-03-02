const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars from the correct path regardless of where it's run from
dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');
const jobScheduler = require('./jobs');
const http = require('http');
const socketService = require('./services/SocketService');

connectDB();

const app = express();
app.use(cookieParser());
const server = http.createServer(app);

// Initialize Socket.io
socketService.init(server);

// Middleware
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.originalUrl.startsWith('/api/payment/webhook')) {
      req.rawBody = buf;
    }
  }
}));
// CORS — allow Vercel frontend + localhost dev
const allowedOrigins = [
  'https://skill-dad-client.vercel.app',
  'https://skilldad.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-csrf-token', 'X-CSRF-Token'],
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/enrollment', require('./routes/enrollmentRoutes'));
app.use('/api/university', require('./routes/universityRoutes'));
app.use('/api/partner', require('./routes/partnerRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/sessions', require('./routes/liveSessionRoutes'));
app.use('/api/finance', require('./routes/financeRoutes'));
app.use('/api/enquiries', require('./routes/enquiryRoutes'));
app.use('/api/exams', require('./routes/examRoutes'));
app.use('/api/documents', require('./routes/documentRoutes'));
app.use('/api/projects', require('./routes/projectRoutes'));
app.use('/api/support', require('./routes/supportRoutes'));
app.use('/api/public', require('./routes/publicRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/webhooks', require('./routes/webhookRoutes'));
app.use('/api/discount', require('./routes/discountRoutes'));

// Payment Routes
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/admin/payment', require('./routes/adminPaymentRoutes'));
app.use('/api/admin/reconciliation', require('./routes/reconciliationRoutes'));
app.use('/api/admin/monitoring', require('./routes/monitoringRoutes'));


app.get('/', (req, res) => {
  res.send('API is running...');
});

// Health check endpoint (used by keep-alive ping and uptime monitors)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok-v2', timestamp: new Date().toISOString() });
});

// Debug routes endpoint (DANGEROUS - ONLY FOR FIXING 404s)
app.get('/debug-routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) { // routes registered directly on the app
      routes.push(`${Object.keys(middleware.route.methods).join(',').toUpperCase()} ${middleware.route.path}`);
    } else if (middleware.name === 'router') { // router middleware
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          const path = handler.route.path;
          const methods = Object.keys(handler.route.methods).join(',').toUpperCase();
          routes.push(`${methods} ${middleware.regexp.toString().replace('/^\\', '').replace('\\/?(?=\\/|$)/i', '')}${path}`);
        }
      });
    }
  });
  const fs = require('fs');
  const path = require('path');
  const files = fs.readdirSync(__dirname);
  const routesDir = fs.existsSync(path.join(__dirname, 'routes')) ? fs.readdirSync(path.join(__dirname, 'routes')) : 'MISSING';

  res.json({
    cwd: process.cwd(),
    dirname: __dirname,
    rootFiles: files,
    routesFiles: routesDir,
    routes
  });
});

app.use(errorHandler);

// Initialize scheduled jobs
try {
  jobScheduler.initializeJobs();
  console.log('Scheduled jobs initialized successfully');
} catch (error) {
  console.error('Failed to initialize scheduled jobs:', error);
}

const PORT = process.env.PORT || 3030;
console.log('[Server] Attempting to start on port:', PORT);

// Log warning if ZOOM_MOCK_MODE is enabled (Requirement 13.4)
if (process.env.ZOOM_MOCK_MODE === 'true') {
  console.warn('');
  console.warn('⚠️  ═══════════════════════════════════════════════════════════════');
  console.warn('⚠️  WARNING: ZOOM_MOCK_MODE IS ENABLED');
  console.warn('⚠️  ═══════════════════════════════════════════════════════════════');
  console.warn('⚠️  ');
  console.warn('⚠️  Zoom integration is running in MOCK MODE for development.');
  console.warn('⚠️  ');
  console.warn('⚠️  - Mock Zoom meetings will be created (no real Zoom API calls)');
  console.warn('⚠️  - Mock recording data will be generated automatically');
  console.warn('⚠️  - Webhook simulator available for testing');
  console.warn('⚠️  ');
  console.warn('⚠️  DO NOT USE IN PRODUCTION!');
  console.warn('⚠️  Set ZOOM_MOCK_MODE=false and configure real Zoom credentials.');
  console.warn('⚠️  ');
  console.warn('⚠️  ═══════════════════════════════════════════════════════════════');
  console.warn('');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);

  // Self-ping every 14 minutes to prevent Render free-tier cold starts
  // Render spins down after 15 minutes of inactivity on the free plan
  if (process.env.NODE_ENV === 'production') {
    // Use RENDER_EXTERNAL_URL if set, otherwise fall back to the hardcoded Render URL
    const pingUrl = process.env.RENDER_EXTERNAL_URL
      ? `${process.env.RENDER_EXTERNAL_URL}/health`
      : 'https://skilldad-server.onrender.com/health';

    console.log(`[KeepAlive] Starting self-ping every 14 min -> ${pingUrl}`);

    setInterval(() => {
      const https = require('https');
      const http = require('http');
      const client = pingUrl.startsWith('https') ? https : http;
      client.get(pingUrl, (res) => {
        console.log(`[KeepAlive] Ping -> ${res.statusCode}`);
      }).on('error', (err) => {
        console.warn('[KeepAlive] Ping failed:', err.message);
      });
    }, 14 * 60 * 1000); // every 14 minutes
  }
});
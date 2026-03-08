const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');
const compression = require('compression');

// Load env vars from the correct path regardless of where it's run from
dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const { connectPostgres } = require('./config/postgres');
const { errorHandler } = require('./middleware/errorMiddleware');
const jobScheduler = require('./jobs');
const http = require('http');
const socketService = require('./services/SocketService');

const fs = require('fs');

connectDB();
connectPostgres();

// Registry of upload paths
const uploads = {
  ROOT: path.join(__dirname, 'uploads'),
  DOCS: path.join(__dirname, 'uploads/documents'),
  PROJECTS: path.join(__dirname, 'uploads/projects')
};

// Ensure upload directories exist with better error reporting
console.log('[Storage] Starting directory verification...');
const uploadsSucceeded = [];
const uploadsFailed = [];

Object.entries(uploads).forEach(([key, dirPath]) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`[Storage] Created ${key}: ${dirPath}`);
    } else {
      // Test writability
      const testFile = path.join(dirPath, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`[Storage] Verified ${key} (Writable): ${dirPath}`);
    }
    uploadsSucceeded.push(dirPath);
  } catch (err) {
    console.error(`[Storage] CRITICAL FAILURE for ${key}: ${dirPath}`, err.message);
    uploadsFailed.push({ path: dirPath, error: err.message });
  }
});

// Expose root path for routes to use consistently
global.BASE_UPLOAD_PATH = uploads.ROOT;
global.STORAGE_STATUS = { succeeded: uploadsSucceeded, failed: uploadsFailed };

const app = express();
app.use(compression());
app.use(cookieParser());
const server = http.createServer(app);

// Initialize Socket.io
socketService.init(server);

// Initialize Exam WebSocket Service
const examWebSocketService = require('./services/examWebSocketService');
examWebSocketService.init();

// Start timers for ongoing exams (after DB connection)
setTimeout(() => {
  examWebSocketService.startTimersForOngoingExams();
}, 2000); // Wait 2 seconds for DB connection to be ready

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
// Payment Routes
const routeFiles = [
  ['/api/users', './routes/userRoutes'],
  ['/api/db-status', './routes/dbStatusRoutes'],
  ['/api/courses', './routes/courseRoutes'],
  ['/api/courses', './routes/interactiveContentRoutes'],
  ['/api/submissions', './routes/submissionRoutes'],
  ['/api/grading', './routes/manualGradingQueueRoutes'],
  ['/api/analytics', './routes/analyticsRoutes'],
  ['/api/progress', './routes/progressRoutes'],
  ['/api/enrollment', './routes/enrollmentRoutes'],
  ['/api/university', './routes/universityRoutes'],
  ['/api/partner', './routes/partnerRoutes'],
  ['/api/admin', './routes/adminRoutes'],
  ['/api/admin/skilldad-universities', './routes/skillDadUniversityRoutes'],
  ['/api/admin/migrations', './routes/migrationRoutes'],
  ['/api/sessions', './routes/liveSessionRoutes'],
  ['/api/finance', './routes/financeRoutes'],
  ['/api/enquiries', './routes/enquiryRoutes'],
  ['/api/exams', './routes/examRoutes'],
  ['/api/results', './routes/resultRoutes'],
  ['/api', './routes/questionRoutes'],
  ['/api/documents', './routes/documentRoutes'],
  ['/api/projects', './routes/projectRoutes'],
  ['/api/support', './routes/supportRoutes'],
  ['/api/faqs', './routes/faqRoutes'],
  ['/api/public', './routes/publicRoutes'],
  ['/api/notifications', './routes/notificationRoutes'],
  ['/api/webhooks', './routes/webhookRoutes'],
  ['/api/discount', './routes/discountRoutes'],
  ['/api/payment', './routes/paymentRoutes'],
  ['/api/admin/payment', './routes/adminPaymentRoutes'],
  ['/api/admin/reconciliation', './routes/reconciliationRoutes'],
  ['/api/admin/monitoring', './routes/monitoringRoutes']
];

routeFiles.forEach(([path, routeFile]) => {
  try {
    console.log(`[Server] Loading route ${path} from ${routeFile}`);
    app.use(path, require(routeFile));
  } catch (error) {
    console.error(`[Server] CRITICAL ERROR loading route ${path} from ${routeFile}:`, error);
    process.exit(1);
  }
});

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Health check endpoint with storage and DB status
app.get('/health', async (req, res) => {
  const mongoose = require('mongoose');
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  res.status(200).json({
    status: 'ok-v4',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    storage: global.STORAGE_STATUS || 'UNKNOWN'
  });
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  examWebSocketService.cleanup();
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  examWebSocketService.cleanup();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

require('dotenv').config();
const express = require('express');
const path = require('path');
// Import the stocks routes
const stocksRouter = require('./stocks');
// Import and mount the prices routes under /api
const pricesRouter = require('./routes/prices');
// Import and mount the technicals routes under /api
const technicalsRouter = require('./routes/technicals');
// Import and mount the news routes under /api
const newsRouter = require('./routes/news');
// Import and mount the search routes under /api
const searchRouter = require('./routes/search');
// Import and mount the charts routes under /api
const chartsRouter = require('./routes/charts');

const cookieParser = require('cookie-parser');
const authMiddleware = require('./middleware/authMiddleware');

// Import new routes
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = 3001;

// Enable JSON body parsing and cookies
app.use(express.json());
app.use(cookieParser());

// Request logger for debugging deployment
app.use((req, res, next) => {
  console.log(`🌐 [${req.method}] ${req.url}`);
  next();
});

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.get('/api/ping', async (req, res) => {
  try {
    const dbStatus = require('./database/db');
    res.json({
      message: 'pong',
      timestamp: new Date(),
      database: dbStatus.db ? 'Ready' : 'Unavailable',
      engine: dbStatus.engine,
      env: process.env.NODE_ENV,
      isNetlify: !!(process.env.NETLIFY || process.env.NETLIFY_ID)
    });
  } catch (e) {
    res.json({ message: 'pong', error: e.message });
  }
});

// Public API routes
app.use('/api/auth', authRouter);

// Protected API routes
app.use('/api', authMiddleware, stocksRouter);
app.use('/api', authMiddleware, pricesRouter);
app.use('/api', authMiddleware, technicalsRouter);
app.use('/api', authMiddleware, newsRouter);
app.use('/api', authMiddleware, searchRouter);
app.use('/api/charts', authMiddleware, chartsRouter);

// Admin routes
app.use('/api/admin', adminRouter);

// 404 Catch-all for API
app.use('/api/*', (req, res) => {
  console.warn(`⚠️ 404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: `Path ${req.originalUrl} not found on this server` });
});

// Export the app for serverless deployment
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
}

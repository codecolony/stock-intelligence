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

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
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

// Start server
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

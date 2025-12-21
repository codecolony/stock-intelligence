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

const app = express();
const PORT = 3001;

// Enable JSON body parsing
app.use(express.json());

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Mount them under /api
app.use('/api', stocksRouter);
app.use('/api', pricesRouter);
app.use('/api', technicalsRouter);
app.use('/api', newsRouter);
app.use('/api', searchRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

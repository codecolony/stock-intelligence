const express = require('express');
const router = express.Router();
const { fetchStockNews } = require('../fetchers/newsFetcher');

// GET /news/:symbol -> get news for a symbol
router.get('/news/:symbol', async (req, res) => {
  const symbol = req.params.symbol;

  // Handle case where symbol is missing
  if (!symbol || symbol.trim() === '') {
    return res.status(400).json({
      error: 'Symbol is required'
    });
  }

  try {
    const newsList = await fetchStockNews(symbol);
    res.json(newsList);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch news data',
      message: error.message
    });
  }
});

module.exports = router;

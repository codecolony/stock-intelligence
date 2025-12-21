const express = require('express');
const router = express.Router();
const { getNSEPrice } = require('../fetchers/nseFetcher');

// GET /prices/:symbol -> get price for a symbol
router.get('/prices/:symbol', async (req, res) => {
  // Decode the symbol from URL (handles spaces and special characters)
  const symbol = decodeURIComponent(req.params.symbol);

  // Handle case where symbol is missing
  if (!symbol || symbol.trim() === '') {
    return res.status(400).json({
      error: 'Symbol is required'
    });
  }

  try {
    const priceData = await getNSEPrice(symbol);
    res.json(priceData);
  } catch (error) {
    console.error(`Error in prices route for ${symbol}:`, error);
    res.status(500).json({
      error: 'Failed to fetch price data',
      message: error.message
    });
  }
});

module.exports = router;

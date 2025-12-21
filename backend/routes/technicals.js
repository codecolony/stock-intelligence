const express = require('express');
const router = express.Router();
const { analyzeTechnicals } = require('../analyzers/technicals');

/**
 * Generate fake historical price data for testing
 * @param {number} days - Number of days of data to generate
 * @returns {number[]} Array of closing prices
 */
function generateFakeHistoricalData(days = 100) {
  const prices = [];
  let basePrice = 100; // Starting price
  
  for (let i = 0; i < days; i++) {
    // Add some randomness and trend
    const change = (Math.random() - 0.48) * 2; // Slight upward bias
    basePrice += change;
    basePrice = Math.max(50, Math.min(200, basePrice)); // Keep within reasonable bounds
    prices.push(Math.round(basePrice * 100) / 100); // Round to 2 decimal places
  }
  
  return prices;
}

// GET /technicals/:symbol -> get technical analysis events for a symbol
router.get('/technicals/:symbol', (req, res) => {
  const symbol = req.params.symbol;

  // Handle case where symbol is missing
  if (!symbol || symbol.trim() === '') {
    return res.status(400).json({
      error: 'Symbol is required'
    });
  }

  try {
    // Generate fake historical data (100 days should be enough for 50 DMA)
    const closingPrices = generateFakeHistoricalData(100);
    
    // Analyze technical indicators
    const events = analyzeTechnicals(closingPrices);
    
    res.json({
      symbol: symbol.toUpperCase(),
      events: events,
      dataPoints: closingPrices.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to analyze technical indicators',
      message: error.message
    });
  }
});

module.exports = router;

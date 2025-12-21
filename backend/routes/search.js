const express = require('express');
const router = express.Router();
const { searchNSEStocks } = require('../fetchers/nseSearchFetcher');

// GET /search?q=query -> search for stocks
router.get('/search', async (req, res) => {
  const query = req.query.q;

  // Handle case where query is missing or too short
  if (!query || query.trim().length < 2) {
    return res.json([]);
  }

  try {
    const suggestions = await searchNSEStocks(query);
    res.json(suggestions);
  } catch (error) {
    console.error('Error in search route:', error);
    // Return empty array on error instead of error response
    res.json([]);
  }
});

module.exports = router;

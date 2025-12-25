const express = require('express');
const router = express.Router();

const db = require('./database/db');

// POST /stocks -> add stock to user watchlist
router.post('/stocks', async (req, res) => {
  const { symbol, name } = req.body;
  const userId = req.user.id;

  if (!symbol || !name) {
    return res.status(400).json({ error: 'Symbol and name are required' });
  }

  const upperSymbol = symbol.toUpperCase();

  try {
    await db.run('INSERT INTO user_stocks (user_id, symbol, name) VALUES (?, ?, ?)', [userId, upperSymbol, name]);

    res.status(201).json({
      symbol: upperSymbol,
      name,
      addedAt: new Date().toISOString()
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Stock already in your watchlist' });
    }
    console.error('Error adding stock:', err);
    res.status(500).json({ error: 'Failed to add stock' });
  }
});

// GET /stocks -> list user's stocks
router.get('/stocks', async (req, res) => {
  const userId = req.user.id;

  try {
    const stocks = await db.all('SELECT symbol, name, added_at as addedAt FROM user_stocks WHERE user_id = ?', [userId]);
    res.json(stocks);
  } catch (err) {
    console.error('Error loading stocks:', err);
    res.status(500).json({ error: 'Failed to load watchlist' });
  }
});

// DELETE /stocks/:symbol -> remove stock from user watchlist
router.delete('/stocks/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const userId = req.user.id;

  try {
    const result = await db.run('DELETE FROM user_stocks WHERE user_id = ? AND symbol = ?', [userId, symbol]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Stock not found in your watchlist' });
    }

    res.json({ message: 'Stock removed from watchlist' });
  } catch (err) {
    console.error('Error removing stock:', err);
    res.status(500).json({ error: 'Failed to remove stock' });
  }
});

module.exports = router;

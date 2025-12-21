const express = require('express');
const router = express.Router();

// In-memory array to store stocks
let stocks = [];

// POST /stocks -> add stock
router.post('/stocks', (req, res) => {
  const { symbol, name } = req.body;

  // Validate required fields
  if (!symbol || !name) {
    return res.status(400).json({ 
      error: 'Symbol and name are required' 
    });
  }

  // Validate that symbol is uppercase
  if (symbol !== symbol.toUpperCase()) {
    return res.status(400).json({ 
      error: 'Symbol must be uppercase' 
    });
  }

  // Prevent duplicates (case-insensitive check for safety)
  const existingStock = stocks.find(
    stock => stock.symbol.toUpperCase() === symbol.toUpperCase()
  );
  
  if (existingStock) {
    return res.status(409).json({ 
      error: 'Stock with this symbol already exists' 
    });
  }

  // Create new stock object
  const newStock = {
    symbol: symbol.toUpperCase(), // Ensure uppercase
    name,
    addedAt: new Date().toISOString()
  };

  stocks.push(newStock);
  
  res.status(201).json(newStock);
});

// GET /stocks -> list stocks
router.get('/stocks', (req, res) => {
  res.json(stocks);
});

// DELETE /stocks/:symbol -> remove stock
router.delete('/stocks/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  
  const index = stocks.findIndex(
    stock => stock.symbol.toUpperCase() === symbol
  );

  if (index === -1) {
    return res.status(404).json({ 
      error: 'Stock not found' 
    });
  }

  const deletedStock = stocks.splice(index, 1)[0];
  res.json({ message: 'Stock deleted', stock: deletedStock });
});

module.exports = router;

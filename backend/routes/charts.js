const express = require('express');
const router = express.Router();
const { getChartData } = require('../fetchers/nseFetcher');
const { detectTechnicalEvents } = require('../fetchers/technicalAnalysis');

// Get stock chart data with technical events
router.get('/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;
        if (!symbol) {
            return res.status(400).json({ error: 'Symbol is required' });
        }

        console.log(`GET /api/charts/${symbol}`);
        const data = await getChartData(symbol);

        // Detect technical events from price data
        let technicalEvents = [];
        if (data && data.datasets) {
            const priceDataset = data.datasets.find(d => d.metric === 'Price');
            if (priceDataset && priceDataset.values) {
                try {
                    technicalEvents = detectTechnicalEvents(priceDataset.values);
                    console.log(`Detected ${technicalEvents.length} technical events for ${symbol}`);
                } catch (taError) {
                    console.error(`Error detecting technical events for ${symbol}:`, taError.message);
                }
            }
        }

        // Add technical events to response
        res.json({
            ...data,
            technicalEvents: technicalEvents
        });
    } catch (error) {
        console.error(`Error in GET /api/charts/${req.params.symbol}:`, error);
        res.status(500).json({ error: 'Failed to fetch chart data' });
    }
});

module.exports = router;

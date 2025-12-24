const { SMA, RSI, MACD, BollingerBands, EMA } = require('technicalindicators');

/**
 * Detect technical analysis events from historical price data
 * @param {Array} priceData - Array of [date, price] pairs
 * @returns {Array} Array of technical events with date, type, and description
 */
function detectTechnicalEvents(priceData) {
    if (!priceData || priceData.length < 200) {
        console.log('Not enough data for technical analysis (need at least 200 days)');
        return [];
    }

    const events = [];
    const dates = priceData.map(d => d[0]);
    const prices = priceData.map(d => parseFloat(d[1]));

    // Calculate indicators
    const sma20 = SMA.calculate({ period: 20, values: prices });
    const sma50 = SMA.calculate({ period: 50, values: prices });
    const sma200 = SMA.calculate({ period: 200, values: prices });
    const ema12 = EMA.calculate({ period: 12, values: prices });
    const ema26 = EMA.calculate({ period: 26, values: prices });

    const rsiValues = RSI.calculate({ period: 14, values: prices });

    const macdResult = MACD.calculate({
        values: prices,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });

    const bbands = BollingerBands.calculate({
        period: 20,
        values: prices,
        stdDev: 2
    });

    // Offset to align indicators with dates
    const sma20Offset = prices.length - sma20.length;
    const sma50Offset = prices.length - sma50.length;
    const sma200Offset = prices.length - sma200.length;
    const rsiOffset = prices.length - rsiValues.length;
    const macdOffset = prices.length - macdResult.length;
    const bbOffset = prices.length - bbands.length;

    // Detect Golden Cross and Death Cross (50 SMA vs 200 SMA)
    for (let i = 1; i < sma50.length && i < sma200.length; i++) {
        const idx50 = i;
        const idx200 = i - (sma50Offset - sma200Offset);

        if (idx200 < 1 || idx200 >= sma200.length) continue;

        const dateIndex = sma200Offset + idx200;

        const prev50 = sma50[idx50 - 1];
        const curr50 = sma50[idx50];
        const prev200 = sma200[idx200 - 1];
        const curr200 = sma200[idx200];

        // Golden Cross: 50 SMA crosses above 200 SMA
        if (prev50 <= prev200 && curr50 > curr200) {
            events.push({
                date: dates[dateIndex],
                type: 'golden_cross',
                name: 'Golden Cross',
                description: '50-day SMA crossed above 200-day SMA (Bullish)',
                signal: 'bullish',
                price: prices[dateIndex]
            });
        }

        // Death Cross: 50 SMA crosses below 200 SMA
        if (prev50 >= prev200 && curr50 < curr200) {
            events.push({
                date: dates[dateIndex],
                type: 'death_cross',
                name: 'Death Cross',
                description: '50-day SMA crossed below 200-day SMA (Bearish)',
                signal: 'bearish',
                price: prices[dateIndex]
            });
        }
    }

    // Detect MACD Crossovers
    for (let i = 1; i < macdResult.length; i++) {
        const prev = macdResult[i - 1];
        const curr = macdResult[i];
        const dateIndex = macdOffset + i;

        if (!prev.MACD || !prev.signal || !curr.MACD || !curr.signal) continue;

        // MACD crosses above signal line (Bullish)
        if (prev.MACD <= prev.signal && curr.MACD > curr.signal) {
            events.push({
                date: dates[dateIndex],
                type: 'macd_bullish',
                name: 'MACD Bullish Crossover',
                description: 'MACD crossed above signal line',
                signal: 'bullish',
                price: prices[dateIndex]
            });
        }

        // MACD crosses below signal line (Bearish)
        if (prev.MACD >= prev.signal && curr.MACD < curr.signal) {
            events.push({
                date: dates[dateIndex],
                type: 'macd_bearish',
                name: 'MACD Bearish Crossover',
                description: 'MACD crossed below signal line',
                signal: 'bearish',
                price: prices[dateIndex]
            });
        }
    }

    // Detect RSI Overbought/Oversold reversals
    for (let i = 1; i < rsiValues.length; i++) {
        const prev = rsiValues[i - 1];
        const curr = rsiValues[i];
        const dateIndex = rsiOffset + i;

        // RSI exits overbought (>70) - potential sell signal
        if (prev >= 70 && curr < 70) {
            events.push({
                date: dates[dateIndex],
                type: 'rsi_overbought_exit',
                name: 'RSI Overbought Exit',
                description: `RSI dropped from overbought zone (${prev.toFixed(1)} → ${curr.toFixed(1)})`,
                signal: 'bearish',
                price: prices[dateIndex]
            });
        }

        // RSI exits oversold (<30) - potential buy signal
        if (prev <= 30 && curr > 30) {
            events.push({
                date: dates[dateIndex],
                type: 'rsi_oversold_exit',
                name: 'RSI Oversold Exit',
                description: `RSI rose from oversold zone (${prev.toFixed(1)} → ${curr.toFixed(1)})`,
                signal: 'bullish',
                price: prices[dateIndex]
            });
        }
    }

    // Detect Bollinger Band Breakouts
    for (let i = 1; i < bbands.length; i++) {
        const dateIndex = bbOffset + i;
        const price = prices[dateIndex];
        const prevPrice = prices[dateIndex - 1];
        const bb = bbands[i];
        const prevBb = bbands[i - 1];

        // Price crosses above upper band (potential overbought/breakout)
        if (prevPrice <= prevBb.upper && price > bb.upper) {
            events.push({
                date: dates[dateIndex],
                type: 'bb_upper_breakout',
                name: 'Bollinger Upper Breakout',
                description: 'Price broke above upper Bollinger Band',
                signal: 'bullish',
                price: price
            });
        }

        // Price crosses below lower band (potential oversold/breakdown)
        if (prevPrice >= prevBb.lower && price < bb.lower) {
            events.push({
                date: dates[dateIndex],
                type: 'bb_lower_breakout',
                name: 'Bollinger Lower Breakdown',
                description: 'Price broke below lower Bollinger Band',
                signal: 'bearish',
                price: price
            });
        }
    }

    // Detect 20 SMA crossovers (short-term trend changes)
    for (let i = 1; i < sma20.length; i++) {
        const dateIndex = sma20Offset + i;
        const price = prices[dateIndex];
        const prevPrice = prices[dateIndex - 1];
        const sma = sma20[i];
        const prevSma = sma20[i - 1];

        // Price crosses above 20 SMA
        if (prevPrice <= prevSma && price > sma) {
            events.push({
                date: dates[dateIndex],
                type: 'sma20_bullish',
                name: 'Price Above 20 SMA',
                description: 'Price crossed above 20-day SMA',
                signal: 'bullish',
                price: price
            });
        }

        // Price crosses below 20 SMA
        if (prevPrice >= prevSma && price < sma) {
            events.push({
                date: dates[dateIndex],
                type: 'sma20_bearish',
                name: 'Price Below 20 SMA',
                description: 'Price crossed below 20-day SMA',
                signal: 'bearish',
                price: price
            });
        }
    }

    // Sort events by date
    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Filter to only significant events (reduce noise) - prioritize major events
    const majorEventTypes = ['golden_cross', 'death_cross', 'rsi_overbought_exit', 'rsi_oversold_exit'];
    const majorEvents = events.filter(e => majorEventTypes.includes(e.type));
    const minorEvents = events.filter(e => !majorEventTypes.includes(e.type));

    // Return all major events + limit minor events to prevent chart clutter
    const limitedMinorEvents = minorEvents.slice(-20); // Last 20 minor events

    return [...majorEvents, ...limitedMinorEvents].sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = { detectTechnicalEvents };

/**
 * Calculate Simple Moving Average (SMA)
 * @param {number[]} prices - Array of closing prices
 * @param {number} period - Number of periods for the moving average
 * @returns {number[]} Array of SMA values (same length as input, with nulls for insufficient data)
 */
function calculateSMA(prices, period) {
  if (!Array.isArray(prices) || prices.length === 0) {
    return [];
  }

  if (period <= 0 || period > prices.length) {
    return prices.map(() => null);
  }

  const sma = [];

  // First (period - 1) values are null (insufficient data)
  for (let i = 0; i < period - 1; i++) {
    sma.push(null);
  }

  // Calculate SMA for remaining values
  for (let i = period - 1; i < prices.length; i++) {
    // Sum prices for the current period
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += prices[j];
    }
    
    // Calculate average
    const average = sum / period;
    sma.push(average);
  }

  return sma;
}

/**
 * Detect when 20 DMA crosses above 50 DMA
 * @param {number[]} closingPrices - Array of closing prices
 * @returns {Array} Array of detected technical events
 *   Each event: { type: 'golden_cross', index: number, date: number, price20: number, price50: number }
 */
function detectGoldenCross(closingPrices) {
  if (!Array.isArray(closingPrices) || closingPrices.length < 50) {
    return [];
  }

  // Calculate both moving averages
  const sma20 = calculateSMA(closingPrices, 20);
  const sma50 = calculateSMA(closingPrices, 50);

  const events = [];

  // Start checking from index 50 (first valid 50 DMA value)
  for (let i = 50; i < closingPrices.length; i++) {
    const prev20 = sma20[i - 1];
    const curr20 = sma20[i];
    const prev50 = sma50[i - 1];
    const curr50 = sma50[i];

    // Skip if any value is null (insufficient data)
    if (prev20 === null || curr20 === null || prev50 === null || curr50 === null) {
      continue;
    }

    // Check for golden cross: 20 DMA was below 50 DMA yesterday, but above today
    const wasBelow = prev20 < prev50;
    const isAbove = curr20 > curr50;

    if (wasBelow && isAbove) {
      events.push({
        type: 'golden_cross',
        index: i,
        price20: curr20,
        price50: curr50
      });
    }
  }

  return events;
}

/**
 * Analyze technical indicators for a given array of closing prices
 * @param {number[]} closingPrices - Array of closing prices
 * @returns {Array} Array of all detected technical events
 */
function analyzeTechnicals(closingPrices) {
  const events = [];

  // Detect golden cross (20 DMA crossing above 50 DMA)
  const goldenCrosses = detectGoldenCross(closingPrices);
  events.push(...goldenCrosses);

  return events;
}

module.exports = {
  calculateSMA,
  detectGoldenCross,
  analyzeTechnicals
};

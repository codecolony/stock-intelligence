const https = require('https');
const http = require('http');

// Cache to store results for 1 minute
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute in milliseconds

// Session cookie storage
let sessionCookie = null;
let cookieExpiry = null;
const COOKIE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Makes an HTTP request with retry logic and timeout
 * @param {string} url - URL to fetch
 * @param {Object} options - Request options
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<Object>} Response data
 */
function makeRequest(url, options = {}, retries = 3) {
  return new Promise((resolve, reject) => {
    const timeout = 10000; // 10 seconds timeout
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = JSON.parse(data);
            resolve({ data: jsonData, headers: res.headers });
          } catch (error) {
            resolve({ data: data, headers: res.headers });
          }
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          // Session expired, clear cookie and retry
          sessionCookie = null;
          cookieExpiry = null;
          if (retries > 0) {
            setTimeout(() => {
              makeRequest(url, options, retries - 1)
                .then(resolve)
                .catch(reject);
            }, 1000);
          } else {
            reject(new Error(`Request failed with status ${res.statusCode}`));
          }
        } else if (res.statusCode >= 500 && retries > 0) {
          // Server error, retry
          setTimeout(() => {
            makeRequest(url, options, retries - 1)
              .then(resolve)
              .catch(reject);
          }, 1000);
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      if (retries > 0) {
        setTimeout(() => {
          makeRequest(url, options, retries - 1)
            .then(resolve)
            .catch(reject);
        }, 1000);
      } else {
        reject(error);
      }
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      if (retries > 0) {
        setTimeout(() => {
          makeRequest(url, options, retries - 1)
            .then(resolve)
            .catch(reject);
        }, 1000);
      } else {
        reject(new Error('Request timeout'));
      }
    });

    req.end();
  });
}

/**
 * Gets a session cookie from Screener.in (if needed)
 * @returns {Promise<string>} Session cookie (empty string if not needed)
 */
async function getSessionCookie() {
  // Screener.in doesn't always require cookies, but we'll try to get them if needed
  // Check if we have a configured cookie from environment
  if (process.env.SCREENER_COOKIE) {
    return process.env.SCREENER_COOKIE;
  }

  // Check if we have a valid cached cookie
  if (sessionCookie && cookieExpiry && Date.now() < cookieExpiry) {
    return sessionCookie;
  }

  try {
    const url = 'https://www.screener.in/';
    const options = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    const response = await makeRequest(url, options);

    // Extract cookies from Set-Cookie header
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
      const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      const cookieString = cookies
        .map(cookie => cookie.split(';')[0])
        .join('; ');

      sessionCookie = cookieString;
      cookieExpiry = Date.now() + COOKIE_TTL;
      return sessionCookie;
    }

    // Return empty string if no cookies needed
    return '';
  } catch (error) {
    console.error('Error getting session cookie:', error.message);
    // Return empty string on error - screener.in might work without cookies
    return '';
  }
}

/**
 * Searches for Indian stocks by symbol or name and returns the company slug
 * @param {string} symbol - Stock symbol
 * @returns {Promise<string>} Company slug
 */
async function findCompanySlug(symbol) {
  const normalizedSymbol = symbol.toUpperCase().trim();

  try {
    // Get session cookie
    const cookie = await getSessionCookie();

    // Search for the company to get the correct slug
    const searchUrl = `https://www.screener.in/api/company/search/?q=${encodeURIComponent(normalizedSymbol)}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      'Referer': 'https://www.screener.in/',
      'Origin': 'https://www.screener.in'
    };

    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const response = await makeRequest(searchUrl, { method: 'GET', headers: headers });
    const data = response.data;

    // Extract results
    let results = [];
    if (Array.isArray(data)) {
      results = data;
    } else if (data.results && Array.isArray(data.results)) {
      results = data.results;
    } else if (data.data && Array.isArray(data.data)) {
      results = data.data;
    }

    if (results && results.length > 0) {
      // 1. Prioritize exact symbol matches
      const exactSymbolMatch = results.find(r => {
        const rSymbol = (r.symbol || r.code || r.ticker || '').toUpperCase();
        return rSymbol === normalizedSymbol;
      });

      // 2. Prioritize exact name matches (if no exact symbol)
      const exactNameMatch = results.find(r => (r.name || '').toUpperCase() === normalizedSymbol);

      // 3. Fallback to existing fuzzy logic but still verify consolidated
      const match = exactSymbolMatch || exactNameMatch || results.find(r => {
        const rSymbol = (r.symbol || r.code || r.ticker || r.name || '').toUpperCase();
        const rName = (r.name || '').toUpperCase();
        return rSymbol.includes(normalizedSymbol) || rName.includes(normalizedSymbol);
      }) || results[0];

      console.log(`Found match for ${normalizedSymbol}: ${match.name} (${match.url})`);

      // Get slug from match - prioritize full URL path to preserve /consolidated/ if present
      if (match.url) {
        // Extract full path after /company/ e.g. "531889/consolidated"
        const fullSlug = match.url.replace(/^\/company\//, '').replace(/\/$/, '');
        if (fullSlug) {
          console.log(`Using full company slug: ${fullSlug}`);
          return fullSlug;
        }
      }

      if (match.slug) return match.slug;
      if (match.name) return match.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }

    // Fallback: convert symbol to slug format
    const fallbackSlug = normalizedSymbol
      .replace(/\s+(LTD|LIMITED|INC|INCORPORATED).*$/i, '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    return fallbackSlug;
  } catch (error) {
    console.error(`Error finding slug for ${normalizedSymbol}:`, error.message);
    return normalizedSymbol.toLowerCase().replace(/\s+/g, '-');
  }
}

/**
 * Fetches real stock price data from Screener.in
 * @param {string} symbol - Stock symbol (e.g., 'RELIANCE', 'TCS')
 * @returns {Promise<Object>} Normalized price data
 */
async function getNSEPrice(symbol) {
  const normalizedSymbol = symbol.toUpperCase().trim();

  // Check cache first
  const cacheKey = normalizedSymbol;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Get session cookie (optional for screener.in)
    const cookie = await getSessionCookie();

    // Find the correct company slug
    const companySlug = await findCompanySlug(normalizedSymbol);

    // Fetch the company page HTML
    const url = `https://www.screener.in/company/${companySlug}/`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      'Referer': 'https://www.screener.in/',
      'Upgrade-Insecure-Requests': '1'
    };

    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const response = await makeRequest(url, { method: 'GET', headers: headers });
    const html = typeof response.data === 'string' ? response.data : String(response.data);

    // Extract JSON data from script tags
    let data = {};
    const patterns = [
      /window\.companyData\s*=\s*({[\s\S]*?});/,
      /window\.data\s*=\s*({[\s\S]*?});/,
      /id="company-data"[^>]*>([\s\S]*?)<\/script>/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        try {
          data = JSON.parse(match[1]);
          break;
        } catch (e) { }
      }
    }

    // Extract basic metrics from HTML if JSON parse failed or missing fields
    let lastPrice = 0;
    let previousClose = 0;
    let changePercent = 0;
    let volume = 0;

    // Try multiple data structures
    if (data.company && data.company.currentPrice) lastPrice = parseFloat(data.company.currentPrice);
    else if (data.currentPrice) lastPrice = parseFloat(data.currentPrice);
    else {
      // Extract from HTML span
      const priceMatch = html.match(/Current Price[\s\S]*?<span[^>]*>([\d,.]+)/);
      if (priceMatch) lastPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
    }

    // Normalize fundamental ratios
    const fundamentals = {};
    // Improved regex to capture the entire nowrap value span even if it contains nested tags
    const ratioPattern = /<li[^>]*>[\s\S]*?<span[^>]*class="name"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<span[^>]*class="nowrap value"[^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi;

    let ratioMatch;
    while ((ratioMatch = ratioPattern.exec(html)) !== null) {
      const name = ratioMatch[1].trim();
      let value = ratioMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      fundamentals[name] = value;
    }

    // Fallback extraction from meta description (if some key ratios are missing)
    const metaMatch = html.match(/<meta name="description" content="([^"]+)"/);
    if (metaMatch && metaMatch[1]) {
      const desc = metaMatch[1];
      const patterns = {
        "Promoter holding": /Promoter holding(?: of|:)?\s*(\d+\.?\d*)%/i,
        "ROCE": /ROCE(?: of|:)?\s*(\d+\.?\d*)%/i,
        "ROE": /ROE(?: of|:)?\s*(\d+\.?\d*)%/i,
        "Debt to equity": /Debt to equity(?: of|:)?\s*(\d+\.?\d*)/i,
        "Sales growth": /Sales growth(?: of|:)?\s*(\d+\.?\d*)%/i,
        "Profit growth": /Profit growth(?: of|:)?\s*(\d+\.?\d*)%/i
      };

      for (const [key, pattern] of Object.entries(patterns)) {
        if (!fundamentals[key]) {
          const m = desc.match(pattern);
          if (m && m[1]) fundamentals[key] = m[1] + (key.toLowerCase().includes('ratio') || key.toLowerCase().includes('equity') ? '' : '%');
        }
      }
    }

    // Extra patterns for additional ratios that might be in different blocks
    const extraPatterns = [
      { key: "High / Low", pattern: /High \/ Low[\s\S]*?<span[^>]*class="number"[^>]*>([\d,.\s\/]+)<\/span>/i },
      { key: "Face Value", pattern: /Face Value[\s\S]*?<span[^>]*class="number"[^>]*>([\d.]+)/i },
      { key: "Industry PE", pattern: /Industry PE[\s\S]*?<span[^>]*class="number"[^>]*>([\d.]+)/i },
      { key: "Current Price", pattern: /Current Price[\s\S]*?<span[^>]*class="number"[^>]*>([\d,.]+)/i },
      { key: "Book Value", pattern: /Book Value[\s\S]*?<span[^>]*class="number"[^>]*>([\d,.]+)/i }
    ];

    extraPatterns.forEach(p => {
      if (!fundamentals[p.key]) {
        const m = html.match(p.pattern);
        if (m && m[1]) {
          fundamentals[p.key] = m[1].replace(/,/g, '').trim();
        }
      }
    });

    // Try to find TTM EPS from the quarters table if missing
    if (!fundamentals["EPS"]) {
      const epsMatch = html.match(/EPS in Rs[\s\S]*?<td[^>]*>([\d.-]+)<\/td>\s*<\/tr>/i);
      if (epsMatch && epsMatch[1]) fundamentals["EPS"] = epsMatch[1];
    }

    const result = {
      price: lastPrice,
      changePercent: changePercent,
      volume: volume,
      fundamentals: fundamentals,
      updatedAt: new Date().toISOString()
    };

    // Cache result
    cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return result;
  } catch (error) {
    console.error(`Error fetching price for ${normalizedSymbol}:`, error.message);
    throw error;
  }
}

/**
 * Fetches historical chart data from Screener.in
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} Chart data
 */
async function getChartData(symbol) {
  const normalizedSymbol = symbol.toUpperCase().trim();

  // Check cache
  const cacheKey = `CHART_${normalizedSymbol}`;
  const CHART_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CHART_CACHE_TTL) {
    return cached.data;
  }

  try {
    const cookie = await getSessionCookie();
    const companySlug = await findCompanySlug(normalizedSymbol);
    const companyUrl = `https://www.screener.in/company/${companySlug}/`;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.screener.in/'
    };
    if (cookie) headers['Cookie'] = cookie;

    const pageResponse = await makeRequest(companyUrl, { method: 'GET', headers: headers });
    const html = pageResponse.data;

    const companyMatch = html.match(/data-company-id="(\d+)"/);
    if (!companyMatch) throw new Error('Could not find company ID');

    const companyId = companyMatch[1];
    // Use q=Price instead of Price-Volume as it sometimes causes weird scaling for combined charts
    const chartUrl = `https://www.screener.in/api/company/${companyId}/chart/?q=Price&days=365`;

    const chartResponse = await makeRequest(chartUrl, { method: 'GET', headers: headers });
    let chartData = chartResponse.data;

    // Normalize chart data if it's returning multiple datasets, ensure Price is prioritized
    if (chartData && chartData.datasets) {
      const priceDataset = chartData.datasets.find(d => d.metric === 'Price');
      if (priceDataset && priceDataset.values) {
        // Basic validation: if last value is > 3x current price, it might be an unadjusted or mislabeled metric
        // But actually, Screener's 'Price' metric should be the stock price.
      }
    }

    cache.set(cacheKey, { data: chartData, timestamp: Date.now() });
    return chartData;
  } catch (error) {
    console.error(`Error fetching chart data for ${normalizedSymbol}:`, error.message);
    throw error;
  }
}

module.exports = { getNSEPrice, getChartData };

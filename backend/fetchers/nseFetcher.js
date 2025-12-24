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
 * Searches for company slug on Screener.in
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
      // Find exact match or first result
      const exactMatch = results.find(r => {
        const rSymbol = (r.symbol || r.code || r.ticker || r.name || '').toUpperCase();
        const rName = (r.name || '').toUpperCase();
        // Try to match symbol or name (handle partial matches for names with "LTD", "LIMITED", etc.)
        return rSymbol === normalizedSymbol ||
          rName === normalizedSymbol ||
          rSymbol.includes(normalizedSymbol) ||
          rName.includes(normalizedSymbol) ||
          normalizedSymbol.includes(rSymbol) ||
          normalizedSymbol.includes(rName.replace(/\s+(LTD|LIMITED|INC|INCORPORATED).*$/i, '').trim());
      });
      const match = exactMatch || results[0];

      console.log(`Found match for ${normalizedSymbol}:`, match);

      // Get slug from match - prioritize URL extraction as it's most accurate
      if (match.url) {
        // Extract slug from URL if available (most reliable)
        // URL format: /company/INFY/consolidated/ or /company/INFY/
        const urlMatch = match.url.match(/\/company\/([^\/]+)\//);
        if (urlMatch && urlMatch[1]) {
          console.log(`Extracted slug from URL: ${urlMatch[1]}`);
          return urlMatch[1];
        }
      }

      if (match.slug) {
        console.log(`Using slug from match: ${match.slug}`);
        return match.slug;
      } else if (match.name) {
        // Convert name to slug format
        const slug = match.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        console.log(`Generated slug from name: ${slug}`);
        return slug;
      }
    }

    // Fallback: convert symbol to slug format (remove common suffixes)
    const fallbackSlug = normalizedSymbol
      .replace(/\s+(LTD|LIMITED|INC|INCORPORATED).*$/i, '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    console.log(`Using fallback slug: ${fallbackSlug}`);
    return fallbackSlug;
  } catch (error) {
    console.error(`Error finding slug for ${normalizedSymbol}:`, error.message);
    // Fallback: convert symbol to slug format
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
    // Check if using cookie
    if (cookie) {
      console.log(`Fetching price for ${normalizedSymbol} using slug: ${companySlug} (Authenticated)`);
    } else {
      console.log(`Fetching price for ${normalizedSymbol} using slug: ${companySlug} (Public View - Set SCREENER_COOKIE for more data)`);
    }

    // Fetch the company page HTML
    // Don't double-encode, companySlug should already be URL-safe
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

    const options = {
      method: 'GET',
      headers: headers
    };

    const response = await makeRequest(url, options);
    const html = typeof response.data === 'string' ? response.data : String(response.data);

    // Extract JSON data from script tags
    // Screener.in embeds company data in script tags with various patterns
    let data = null;

    // Try multiple patterns to find embedded JSON data
    const patterns = [
      // Look for window.companyData or similar assignments
      /window\.companyData\s*=\s*({[\s\S]+?});/,
      /var\s+companyData\s*=\s*({[\s\S]+?});/,
      /window\.pageData\s*=\s*({[\s\S]+?});/,
      /const\s+companyData\s*=\s*({[\s\S]+?});/,
      // Look for script tags with id="company-data" or similar
      /<script[^>]*id="company-data"[^>]*>([\s\S]+?)<\/script>/,
      /<script[^>]*id="page-data"[^>]*>([\s\S]+?)<\/script>/,
      // Look for any script tag containing companyData
      /<script[^>]*>[\s\S]*?companyData[\s\S]*?=\s*({[\s\S]+?});[\s\S]*?<\/script>/,
      // Look for React/Vue component data
      /<script[^>]*>[\s\S]*?window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});[\s\S]*?<\/script>/,
      // Look for JSON-LD structured data
      /<script[^>]*type="application\/json"[^>]*>([\s\S]+?)<\/script>/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          let jsonStr = match[1].trim();
          // Clean up the JSON string if needed
          jsonStr = jsonStr.replace(/^[\s\n\r]+|[\s\n\r]+$/g, '');
          data = JSON.parse(jsonStr);
          if (data && (data.price || data.currentPrice || data.quote || data.company)) {
            break;
          }
        } catch (parseError) {
          // Try next pattern
          continue;
        }
      }
    }

    // If no JSON found, try to extract price from HTML directly using more patterns
    if (!data) {
      // Look for price in various HTML structures
      const pricePatterns = [
        // Look for price in data attributes
        /data-price="([\d,]+\.?\d*)"/i,
        /data-current-price="([\d,]+\.?\d*)"/i,
        // Look for price in span/div with price-related classes
        /<span[^>]*class="[^"]*price[^"]*"[^>]*>[\s\S]*?₹?\s*([\d,]+\.?\d*)/i,
        /<div[^>]*class="[^"]*price[^"]*"[^>]*>[\s\S]*?₹?\s*([\d,]+\.?\d*)/i,
        // Look for price in text content
        /Current\s+Price[\s\S]{0,200}?₹?\s*([\d,]+\.?\d*)/i,
        /Last\s+Price[\s\S]{0,200}?₹?\s*([\d,]+\.?\d*)/i,
        /Market\s+Price[\s\S]{0,200}?₹?\s*([\d,]+\.?\d*)/i,
        // Look for price near "₹" symbol
        /₹\s*([\d,]+\.?\d*)/i
      ];

      for (const pattern of pricePatterns) {
        const priceMatch = html.match(pattern);
        if (priceMatch) {
          const priceValue = parseFloat(priceMatch[1].replace(/,/g, ''));
          if (priceValue > 0 && priceValue < 1000000) { // Sanity check
            data = {
              price: priceValue,
              currentPrice: priceValue
            };
            break;
          }
        }
      }

      if (!data) {
        console.error(`Could not extract data from HTML for ${normalizedSymbol}. HTML length: ${html.length}`);
        // Log a snippet of HTML for debugging
        const htmlSnippet = html.substring(0, 2000);
        console.error(`HTML snippet: ${htmlSnippet.substring(0, 500)}...`);
        throw new Error('Company data not found in HTML. The page structure may have changed.');
      }
    }

    // Extract price data from various possible response structures
    let lastPrice = 0;
    let previousClose = 0;
    let changePercent = 0;
    let volume = 0;

    // Debug: log data structure if available
    if (data && Object.keys(data).length > 0) {
      console.log(`Data keys for ${normalizedSymbol}:`, Object.keys(data).slice(0, 10));
    }

    // Try different data structures from screener.in
    // Check nested structures first
    if (data.company && data.company.currentPrice) {
      lastPrice = parseFloat(data.company.currentPrice) || 0;
    } else if (data.company && data.company.price) {
      lastPrice = parseFloat(data.company.price) || 0;
    } else if (data.currentPrice !== undefined && data.currentPrice !== null) {
      lastPrice = parseFloat(String(data.currentPrice).replace(/,/g, '')) || 0;
    } else if (data.price !== undefined && data.price !== null) {
      lastPrice = parseFloat(String(data.price).replace(/,/g, '')) || 0;
    } else if (data.quote && data.quote.price) {
      lastPrice = parseFloat(String(data.quote.price).replace(/,/g, '')) || 0;
    } else if (data.marketCap && data.shares) {
      // Calculate price from market cap and shares if available
      const marketCap = parseFloat(String(data.marketCap).replace(/,/g, '')) || 0;
      const shares = parseFloat(String(data.shares).replace(/,/g, '')) || 0;
      if (shares > 0) {
        lastPrice = marketCap / shares;
      }
    } else if (data.company && data.company.marketCap && data.company.shares) {
      const marketCap = parseFloat(String(data.company.marketCap).replace(/,/g, '')) || 0;
      const shares = parseFloat(String(data.company.shares).replace(/,/g, '')) || 0;
      if (shares > 0) {
        lastPrice = marketCap / shares;
      }
    }

    // Extract previous close
    if (data.previousClose) {
      previousClose = parseFloat(String(data.previousClose).replace(/,/g, '')) || lastPrice;
    } else if (data.close) {
      previousClose = parseFloat(String(data.close).replace(/,/g, '')) || lastPrice;
    } else if (data.quote && data.quote.previousClose) {
      previousClose = parseFloat(String(data.quote.previousClose).replace(/,/g, '')) || lastPrice;
    } else {
      previousClose = lastPrice;
    }

    // Extract change percent
    if (data.changePercent !== undefined) {
      changePercent = parseFloat(data.changePercent) || 0;
    } else if (data.pChange !== undefined) {
      changePercent = parseFloat(data.pChange) || 0;
    } else if (data.change && previousClose) {
      const change = parseFloat(String(data.change).replace(/,/g, '')) || 0;
      changePercent = (change / previousClose) * 100;
    } else if (previousClose && lastPrice && previousClose !== lastPrice) {
      changePercent = ((lastPrice - previousClose) / previousClose) * 100;
    }

    // Extract volume
    if (data.volume) {
      volume = parseInt(String(data.volume).replace(/,/g, '')) || 0;
    } else if (data.totalVolume) {
      volume = parseInt(String(data.totalVolume).replace(/,/g, '')) || 0;
    } else if (data.quote && data.quote.volume) {
      volume = parseInt(String(data.quote.volume).replace(/,/g, '')) || 0;
    }

    // Extract Fundamental Ratios
    const fundamentals = {};
    const ratioPattern = /<li[^>]*>[\s\S]*?<span[^>]*class="name"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<span[^>]*class="nowrap value"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi;

    let match;
    while ((match = ratioPattern.exec(html)) !== null) {
      const name = match[1].trim();
      // Clean value: remove HTML tags, extra spaces, newlines
      let value = match[2].replace(/<[^>]+>/g, '').replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

      // Remove currency symbols (₹) but keep units like %, Cr. if desired. 
      // Actually, let's keep it as string for display, but maybe parse if needed.
      // The user wants to color code, so we might need numeric values.
      // Let's store raw string for display, and a parsed numeric value for logic.

      fundamentals[name] = value;
    }

    // fallback: Try to extract Promoter Holding from meta description if missing
    if (!fundamentals['Promoter holding']) {
      const metaMatch = html.match(/<meta name="description" content="([^"]+)"/);
      if (metaMatch) {
        const content = metaMatch[1];
        const promoterMatch = content.match(/Promoter Holding:\s*([\d.]+%?)/i);
        if (promoterMatch) {
          fundamentals['Promoter holding'] = promoterMatch[1];
        }
      }
    }

    // Normalize keys to standard names if needed, or just send valid map.
    // Common keys from screener: "Market Cap", "Current Price", "High / Low", "Stock P/E", "Book Value", "Dividend Yield", "ROCE", "ROE", "Face Value"

    // Fetch additional quick_ratios from API (only if authenticated)
    if (cookie) {
      try {
        // Extract warehouse ID from HTML
        const warehouseMatch = html.match(/data-warehouse-id="(\d+)"/);
        if (warehouseMatch && warehouseMatch[1]) {
          const warehouseId = warehouseMatch[1];
          const quickRatiosUrl = `https://www.screener.in/api/company/${warehouseId}/quick_ratios/`;

          const quickRatiosResponse = await makeRequest(quickRatiosUrl, { method: 'GET', headers: headers });
          const quickRatiosHtml = typeof quickRatiosResponse.data === 'string' ? quickRatiosResponse.data : String(quickRatiosResponse.data);

          // Parse quick ratios using same pattern
          let qrMatch;
          while ((qrMatch = ratioPattern.exec(quickRatiosHtml)) !== null) {
            const name = qrMatch[1].trim();
            let value = qrMatch[2].replace(/<[^>]+>/g, '').replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
            // Don't overwrite existing values
            if (!fundamentals[name]) {
              fundamentals[name] = value;
            }
          }
          console.log(`Fetched ${Object.keys(fundamentals).length} fundamentals for ${normalizedSymbol}`);
        }
      } catch (qrError) {
        console.error(`Error fetching quick_ratios for ${normalizedSymbol}:`, qrError.message);
        // Continue without quick ratios - we still have the basic ones
      }
    }

    // Normalize the response format
    const normalizedData = {
      symbol: normalizedSymbol,
      price: lastPrice || 0,
      changePercent: parseFloat(changePercent.toFixed(2)),
      volume: volume,
      fundamentals: fundamentals,
      updatedAt: new Date().toISOString()
    };

    // Cache the result
    cache.set(cacheKey, {
      data: normalizedData,
      timestamp: Date.now()
    });

    return normalizedData;
  } catch (error) {
    console.error(`Error fetching price from Screener.in for ${normalizedSymbol}:`, error.message);

    // Return cached data if available, even if expired
    const staleCache = cache.get(cacheKey);
    if (staleCache) {
      console.log(`Returning stale cache for ${normalizedSymbol}`);
      return staleCache.data;
    }

    // If all else fails, throw error
    throw new Error(`Failed to fetch price for ${normalizedSymbol}: ${error.message}`);
  }
}


/**
 * Fetches historical chart data from Screener.in
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object>} Chart data
 */
async function getChartData(symbol) {
  const normalizedSymbol = symbol.toUpperCase().trim();

  // Check cache (separate cache key for charts)
  const cacheKey = `CHART_${normalizedSymbol}`;
  const CHART_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CHART_CACHE_TTL) {
    return cached.data;
  }

  try {
    // Get session cookie
    const cookie = await getSessionCookie();

    // Find company slug
    const companySlug = await findCompanySlug(normalizedSymbol);

    // 1. Fetch company page to get warehouse ID
    const companyUrl = `https://www.screener.in/company/${companySlug}/`;
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

    const pageResponse = await makeRequest(companyUrl, { method: 'GET', headers: headers });
    const html = typeof pageResponse.data === 'string' ? pageResponse.data : String(pageResponse.data);

    // Extract warehouse ID
    const warehouseMatch = html.match(/data-warehouse-id="(\d+)"/);
    if (!warehouseMatch || !warehouseMatch[1]) {
      throw new Error('Could not find warehouse ID');
    }

    const warehouseId = warehouseMatch[1];

    // 2. Fetch chart data
    const chartUrl = `https://www.screener.in/api/company/${warehouseId}/chart/?q=Price-Volume&days=365`;
    // API headers same as above
    const chartResponse = await makeRequest(chartUrl, { method: 'GET', headers: headers });
    const chartData = chartResponse.data;

    // Cache result
    cache.set(cacheKey, {
      data: chartData,
      timestamp: Date.now()
    });

    return chartData;

  } catch (error) {
    console.error(`Error fetching chart data for ${normalizedSymbol}:`, error.message);
    throw error;
  }
}

module.exports = { getNSEPrice, getChartData };

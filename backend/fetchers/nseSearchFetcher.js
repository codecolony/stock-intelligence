const https = require('https');
const http = require('http');

// Cache to store search results for 5 minutes
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Session cookie storage (reuse from nseFetcher pattern)
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
  // Check if we have a valid cookie
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
 * Searches for Indian stocks using Screener.in
 * @param {string} query - Search query (symbol or company name)
 * @returns {Promise<Array>} Array of stock suggestions
 */
async function searchNSEStocks(query) {
  const normalizedQuery = query.trim();
  
  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }
  
  // Check cache first
  const cacheKey = normalizedQuery.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    // Get session cookie (optional for screener.in)
    const cookie = await getSessionCookie();
    
    // Fetch search results from Screener.in API
    const url = `https://www.screener.in/api/company/search/?q=${encodeURIComponent(normalizedQuery)}`;
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
    
    const options = {
      method: 'GET',
      headers: headers
    };
    
    const response = await makeRequest(url, options);
    const data = response.data;
    
    // Normalize the response format
    let suggestions = [];
    
    // Helper function to extract symbol and name from item
    const extractStockInfo = (item) => {
      // Screener.in typically returns: name (company name), slug (URL slug), and sometimes symbol
      const symbol = item.symbol || item.code || item.ticker || item.name || item.slug || '';
      const name = item.company || item.companyName || item.name || item.slug || '';
      const exchange = item.exchange || item.stockExchange || 'NSE';
      
      // If symbol is the slug, try to extract a better symbol
      // Screener.in slugs are usually lowercase with hyphens
      const cleanSymbol = symbol.toUpperCase().replace(/-/g, '');
      
      return {
        symbol: cleanSymbol || symbol.toUpperCase(),
        name: name,
        exchange: exchange
      };
    };
    
    if (Array.isArray(data)) {
      suggestions = data.map(extractStockInfo).filter(item => item.symbol);
    } else if (data.results && Array.isArray(data.results)) {
      suggestions = data.results.map(extractStockInfo).filter(item => item.symbol);
    } else if (data.data && Array.isArray(data.data)) {
      suggestions = data.data.map(extractStockInfo).filter(item => item.symbol);
    } else if (data.companies && Array.isArray(data.companies)) {
      suggestions = data.companies.map(extractStockInfo).filter(item => item.symbol);
    }
    
    // Limit to top 10 suggestions
    suggestions = suggestions.slice(0, 10);
    
    // Cache the result
    cache.set(cacheKey, {
      data: suggestions,
      timestamp: Date.now()
    });
    
    return suggestions;
  } catch (error) {
    console.error(`Error searching stocks on Screener.in for ${normalizedQuery}:`, error.message);
    
    // Return cached data if available, even if expired
    const staleCache = cache.get(cacheKey);
    if (staleCache) {
      console.log(`Returning stale cache for ${normalizedQuery}`);
      return staleCache.data;
    }
    
    // Return empty array on error (don't throw, just return no results)
    return [];
  }
}

module.exports = { searchNSEStocks };

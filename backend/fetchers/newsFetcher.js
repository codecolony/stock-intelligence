const Parser = require('rss-parser');
const parser = new Parser();

/**
 * Fetches latest stock news for a given symbol from Google News RSS feed
 * @param {string} symbol - Stock symbol (e.g., 'RELIANCE', 'TCS')
 * @returns {Promise<Array>} Array of news items with title, source, link, publishedAt (max 5 items)
 */
async function fetchStockNews(symbol) {
  try {
    // Google News RSS feed URL for stock search
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(symbol)}+stock&hl=en&gl=IN&ceid=IN:en`;
    
    // Parse the RSS feed
    const feed = await parser.parseURL(rssUrl);
    
    // Check if feed has items
    if (!feed.items || feed.items.length === 0) {
      return [];
    }
    
    // Extract and format the news items (limit to 5)
    const newsItems = feed.items.slice(0, 5).map(item => {
      // Extract source from the title (Google News format: "Title - Source")
      const titleParts = item.title ? item.title.split(' - ') : ['', ''];
      const title = titleParts[0] || item.title || '';
      const source = titleParts[1] || item.source?.name || 'Unknown';
      
      return {
        title: title,
        source: source,
        link: item.link || item.guid || '',
        publishedAt: item.pubDate || item.isoDate || new Date().toISOString()
      };
    });
    
    return newsItems;
  } catch (error) {
    // If RSS fails, return empty array
    console.error(`Error fetching news for ${symbol}:`, error.message);
    return [];
  }
}

module.exports = { fetchStockNews };

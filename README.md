# Stock Screener

A web application for tracking and analyzing Indian stocks using data from Screener.in. The application provides real-time stock prices, technical analysis, news, and an autocomplete search feature.

## Features

- 🔍 **Auto-suggest Search**: Type-ahead search with autocomplete suggestions for Indian stocks
- 📊 **Real-time Stock Prices**: Fetch current stock prices, change percentages, and trading volume from Screener.in
- 📈 **Technical Analysis**: View technical indicators and events for stocks
- 📰 **Stock News**: Get the latest news articles related to stocks
- 💾 **Stock Tracking**: Add and manage a watchlist of stocks
- ⚡ **Caching**: Intelligent caching system (1 minute for prices, 5 minutes for search results)
- 🔄 **Retry Logic**: Automatic retry mechanism with timeout handling for reliable data fetching

## Tech Stack

### Backend
- **Node.js** with Express.js
- **HTTP/HTTPS** modules for API requests
- **RSS Parser** for news feeds

### Frontend
- **Vanilla JavaScript** (no frameworks)
- **HTML5** and **CSS3**
- Responsive design

## Project Structure

```
stocks-screener/
├── backend/
│   ├── analyzers/
│   │   └── technicals.js          # Technical analysis logic
│   ├── fetchers/
│   │   ├── nseFetcher.js          # Price data fetcher from Screener.in
│   │   ├── nseSearchFetcher.js   # Stock search fetcher from Screener.in
│   │   └── newsFetcher.js        # News fetcher from Google News RSS
│   ├── routes/
│   │   ├── prices.js             # Price API endpoint
│   │   ├── search.js             # Search API endpoint
│   │   ├── technicals.js         # Technical analysis endpoint
│   │   └── news.js               # News API endpoint
│   ├── stocks.js                 # Stock management routes
│   ├── index.js                  # Express server setup
│   └── package.json              # Dependencies
├── frontend/
│   ├── index.html                # Main HTML file
│   └── script.js                 # Frontend JavaScript
└── README.md                     # This file
```

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm (Node Package Manager)

### Setup Steps

1. **Clone or navigate to the project directory**
   ```bash
   cd stocks-screener
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Start the backend server**
   ```bash
   npm start
   ```

   The server will start on `http://localhost:3001`

4. **Open the application**
   - Open your browser and navigate to `http://localhost:3001`
   - The frontend will be served automatically by the Express server

## Usage

### Adding a Stock

1. Type a stock symbol or company name in the search box (e.g., "RELIANCE", "TCS", "INFOSYS")
2. Select a stock from the autocomplete dropdown
3. Click "Add Stock" or press Enter
4. The stock will be added to your watchlist

### Viewing Stock Details

1. Click on any stock in your watchlist
2. The application will fetch and display:
   - **Price**: Current price, change percentage, and trading volume
   - **Technical Events**: Technical analysis indicators and events
   - **News**: Latest news articles related to the stock

### Keyboard Shortcuts

- **Arrow Up/Down**: Navigate autocomplete suggestions
- **Enter**: Select suggestion or add stock
- **Escape**: Close autocomplete dropdown

## API Endpoints

### Stock Management
- `GET /api/stocks` - Get all tracked stocks
- `POST /api/stocks` - Add a new stock
  ```json
  {
    "symbol": "RELIANCE",
    "name": "RELIANCE"
  }
  ```
- `DELETE /api/stocks/:id` - Remove a stock

### Stock Data
- `GET /api/prices/:symbol` - Get current price data
  ```json
  {
    "symbol": "RELIANCE",
    "price": 2450.50,
    "changePercent": 1.2,
    "volume": 1234567,
    "updatedAt": "2024-01-01T12:00:00.000Z"
  }
  ```

- `GET /api/search?q=query` - Search for stocks
  ```json
  [
    {
      "symbol": "RELIANCE",
      "name": "Reliance Industries Ltd",
      "exchange": "NSE"
    }
  ]
  ```

- `GET /api/technicals/:symbol` - Get technical analysis
  ```json
  {
    "symbol": "RELIANCE",
    "events": ["Price crossed above 50 DMA", "RSI above 70"],
    "dataPoints": 100
  }
  ```

- `GET /api/news/:symbol` - Get stock news
  ```json
  [
    {
      "title": "Stock News Title",
      "source": "Source Name",
      "link": "https://...",
      "publishedAt": "2024-01-01T12:00:00.000Z"
    }
  ]
  ```

### Health Check
- `GET /health` - Server health check

## Features in Detail

### Auto-suggest Search
- Debounced search (300ms delay)
- Fetches suggestions from Screener.in API
- Keyboard navigation support
- Click outside to close

### Price Fetching
- Fetches real-time data from Screener.in
- Handles session cookies automatically
- Retry logic with 3 attempts
- 10-second timeout per request
- 1-minute caching for price data

### Error Handling
- Graceful error handling with user-friendly messages
- Fallback to stale cache when API fails
- Detailed error logging for debugging

## Configuration

### Backend Port
The backend server runs on port `3001` by default. To change it, modify `PORT` in `backend/index.js`.

### Cache TTL
- Price data: 1 minute (configurable in `nseFetcher.js`)
- Search results: 5 minutes (configurable in `nseSearchFetcher.js`)

### API Timeout
- Request timeout: 10 seconds (configurable in fetcher files)
- Retry attempts: 3 (configurable in fetcher files)

## Troubleshooting

### Stock details not showing
- Check browser console (F12) for errors
- Verify backend server is running
- Check network tab for failed API requests

### Search not working
- Ensure backend server is running
- Check if Screener.in API is accessible
- Verify network connectivity

### Price data not loading
- Check backend console logs for detailed error messages
- Verify the stock symbol is correct
- Try refreshing the page

## Development

### Adding New Features

1. **Backend**: Add new routes in `backend/routes/` or fetchers in `backend/fetchers/`
2. **Frontend**: Update `frontend/script.js` and `frontend/index.html`

### Code Style
- Use consistent indentation (spaces)
- Add comments for complex logic
- Follow existing code patterns

## License

This project is open source and available for personal use.

## Acknowledgments

- **Screener.in** for providing stock data
- **Google News** for RSS feed integration

## Notes

- The application uses Screener.in's public API endpoints
- Rate limiting may apply - caching helps reduce API calls
- Stock data is cached for 1 minute to improve performance
- Search results are cached for 5 minutes

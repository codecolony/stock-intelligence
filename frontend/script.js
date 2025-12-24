const API_BASE = 'http://localhost:3001/api';

// State management
let stocks = [];
let loadingStates = new Map(); // Track loading state per symbol
let searchTimeout = null;
let currentSuggestions = [];
let selectedSuggestionIndex = -1;
let stockCharts = new Map(); // Map to store chart instances per symbol

// Initialize: Load stocks from backend on page load
async function init() {
    try {
        await loadStocks();
    } catch (error) {
        console.error('Failed to load stocks on init:', error);
        showError('Failed to load stocks. Please refresh the page.');
    }
}

// Load stocks from backend
async function loadStocks() {
    try {
        const response = await fetch(`${API_BASE}/stocks`);

        if (!response.ok) {
            throw new Error(`Failed to fetch stocks: ${response.status} ${response.statusText}`);
        }

        stocks = await response.json();
        renderStocks();
    } catch (error) {
        console.error('Error loading stocks:', error);
        throw error;
    }
}

// Add stock using POST /api/stocks
async function addStock() {
    const input = document.getElementById('symbolInput');
    const symbol = input.value.trim().toUpperCase();

    if (!symbol) {
        showError('Please enter a stock symbol');
        return;
    }

    // Check if already exists locally (optimistic check)
    if (stocks.find(s => s.symbol.toUpperCase() === symbol)) {
        showError('Stock already added');
        return;
    }

    // Show loading state for add button
    const button = input.nextElementSibling;
    const originalButtonText = button.textContent;
    button.disabled = true;
    button.textContent = 'Adding...';

    try {
        const response = await fetch(`${API_BASE}/stocks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                symbol: symbol,
                name: symbol // Use symbol as name since backend requires both
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 409) {
                throw new Error('Stock with this symbol already exists');
            } else if (response.status === 400) {
                throw new Error(errorData.error || 'Invalid stock symbol');
            } else {
                throw new Error(errorData.error || `Failed to add stock: ${response.status}`);
            }
        }

        const newStock = await response.json();
        stocks.push(newStock);
        input.value = '';
        renderStocks();
        clearError();
    } catch (error) {
        console.error('Error adding stock:', error);
        showError(error.message || 'Failed to add stock. Please try again.');
    } finally {
        button.disabled = false;
        button.textContent = originalButtonText;
    }
}

// Utility function to sanitize symbol for use in HTML IDs
function sanitizeSymbolForId(symbol) {
    return symbol.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase();
}

// Render stocks list
function renderStocks() {
    const list = document.getElementById('stocksList');
    list.innerHTML = '';

    if (stocks.length === 0) {
        list.innerHTML = '<li style="padding: 20px; text-align: center; color: #666;">No stocks added yet. Add a stock to get started.</li>';
        return;
    }

    stocks.forEach(stock => {
        const li = document.createElement('li');
        li.className = 'stock-item';
        const isLoading = loadingStates.get(stock.symbol) || false;
        if (isLoading) {
            li.classList.add('loading');
        }

        // Create the details div first with sanitized ID
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'stock-details';
        const sanitizedId = sanitizeSymbolForId(stock.symbol);
        detailsDiv.id = `details-${sanitizedId}`;

        li.innerHTML = `
            <div class="stock-symbol">${stock.symbol}</div>
            ${stock.name && stock.name !== stock.symbol ? `<div style="font-size: 14px; color: #666; margin-bottom: 5px;">${stock.name}</div>` : ''}
        `;

        // Append details div
        li.appendChild(detailsDiv);

        // Attach click handler - use addEventListener for better debugging
        li.addEventListener('click', function (e) {
            e.stopPropagation();
            console.log('Stock clicked:', stock.symbol, 'Element:', li);
            fetchStockData(stock.symbol, li);
        });

        // Also add cursor pointer style
        li.style.cursor = 'pointer';

        list.appendChild(li);
    });
}



// Fetch price, technicals, and news for a stock
async function fetchStockData(symbol, element) {
    console.log('fetchStockData called for:', symbol);
    const sanitizedId = sanitizeSymbolForId(symbol);
    const detailsDiv = element.querySelector(`#details-${sanitizedId}`);

    if (!detailsDiv) {
        console.error('Details div not found for symbol:', symbol, 'sanitized ID:', sanitizedId);
        // Try to find it by class instead
        const allDetails = element.querySelectorAll('.stock-details');
        if (allDetails.length > 0) {
            const foundDiv = allDetails[0];
            console.log('Found details div by class:', foundDiv);
            // Continue with the found div
            await fetchStockDataInternal(symbol, element, foundDiv);
            return;
        }
        return;
    }

    await fetchStockDataInternal(symbol, element, detailsDiv);
}

// Internal function to fetch stock data
async function fetchStockDataInternal(symbol, element, detailsDiv) {

    // If already loaded and visible, toggle it
    if (detailsDiv.classList.contains('show') && detailsDiv.innerHTML.trim() !== '' && !loadingStates.get(symbol)) {
        detailsDiv.classList.remove('show');
        return;
    }

    // Set loading state
    loadingStates.set(symbol, true);
    element.classList.add('loading');
    detailsDiv.classList.add('show');
    detailsDiv.innerHTML = '<div style="padding: 10px; text-align: center;">Loading...</div>';

    console.log('Fetching data for:', symbol);

    const sanitizedId = sanitizeSymbolForId(symbol);

    try {
        // Fetch all data in parallel
        const fetchWithErrorHandling = async (url) => {
            try {
                const res = await fetch(url);
                const data = res.ok ? await res.json() : null;
                return { ok: res.ok, status: res.status, data, error: res.ok ? null : `HTTP ${res.status}` };
            } catch (e) {
                return { ok: false, status: 0, data: null, error: e.message };
            }
        };

        // Encode symbol for URL (handles spaces and special characters)
        const encodedSymbol = encodeURIComponent(symbol);

        const [priceRes, technicalsRes, newsRes, chartRes] = await Promise.all([
            fetchWithErrorHandling(`${API_BASE}/prices/${encodedSymbol}`),
            fetchWithErrorHandling(`${API_BASE}/technicals/${encodedSymbol}`),
            fetchWithErrorHandling(`${API_BASE}/news/${encodedSymbol}`),
            fetchWithErrorHandling(`${API_BASE}/charts/${encodedSymbol}?_=${Date.now()}`)
        ]);

        console.log(`Requested chart from: ${API_BASE}/charts/${encodedSymbol}`);

        let html = '';

        // Price
        html += '<div class="detail-section">';
        html += '<h3>Price</h3>';
        if (priceRes.ok && priceRes.data) {
            const priceData = priceRes.data;
            console.log('Price data received:', priceData);
            if (priceData.price !== undefined && priceData.price > 0) {
                html += `<div class="price">₹${priceData.price.toFixed(2)}</div>`;

                // Show change percent if available
                if (priceData.changePercent !== undefined) {
                    const changeColor = priceData.changePercent >= 0 ? '#28a745' : '#dc3545';
                    const changeSymbol = priceData.changePercent >= 0 ? '+' : '';
                    html += `<div style="font-size: 14px; color: ${changeColor}; margin-top: 5px;">${changeSymbol}${priceData.changePercent.toFixed(2)}%</div>`;
                }

                // Show volume if available
                if (priceData.volume && priceData.volume > 0) {
                    const volumeFormatted = priceData.volume.toLocaleString('en-IN');
                    html += `<div style="font-size: 12px; color: #666; margin-top: 5px;">Volume: ${volumeFormatted}</div>`;
                }
            } else {
                html += '<div class="error">Price data not available</div>';
            }
        } else {
            const errorMsg = priceRes.error || `Failed to fetch price (Status: ${priceRes.status || 'Unknown'})`;
            console.error('Price fetch error:', errorMsg);
            html += `<div class="error">${errorMsg}</div>`;
        }
        html += '</div>';

        // Chart Section
        html += '<div class="detail-section" style="width: 100%;">';
        html += '<h3>1 Year Price Chart</h3>';
        html += '<div class="chart-container" style="position: relative; height: 300px; width: 100%;">';
        html += `<canvas id="chart-${sanitizedId}"></canvas>`;
        html += '</div>';
        if (!chartRes.ok || !chartRes.data) {
            const errorMsg = chartRes.error || 'Failed to fetch chart data';
            html += `<div class="error">${errorMsg}</div>`;
        }
        html += '</div>';

        // Technical Events
        html += '<div class="detail-section">';
        html += '<h3>Technical Events</h3>';
        if (technicalsRes.ok && technicalsRes.data) {
            const technicalsData = technicalsRes.data;
            if (technicalsData.events && technicalsData.events.length > 0) {
                html += '<ul class="events-list">';
                technicalsData.events.forEach(event => {
                    html += `<li class="event-item">${escapeHtml(event)}</li>`;
                });
                html += '</ul>';
            } else {
                html += '<div style="color: #666;">No technical events</div>';
            }
        } else {
            const errorMsg = technicalsRes.error || 'Failed to fetch technical events';
            html += `<div class="error">${errorMsg}</div>`;
        }
        html += '</div>';

        // News
        html += '<div class="detail-section">';
        html += '<h3>News</h3>';
        if (newsRes.ok && newsRes.data) {
            const newsData = newsRes.data;
            if (Array.isArray(newsData) && newsData.length > 0) {
                html += '<ul class="news-list">';
                newsData.forEach(news => {
                    html += '<li class="news-item">';
                    html += `<div class="news-title">${escapeHtml(news.title || 'No title')}</div>`;
                    if (news.source) {
                        html += `<div style="font-size: 12px; color: #666; margin: 3px 0;">${escapeHtml(news.source)}</div>`;
                    }
                    if (news.link || news.url) {
                        html += `<a href="${news.link || news.url}" target="_blank" class="news-link">Read more</a>`;
                    }
                    html += '</li>';
                });
                html += '</ul>';
            } else {
                html += '<div style="color: #666;">No news available</div>';
            }
        } else {
            const errorMsg = newsRes.error || 'Failed to fetch news';
            html += `<div class="error">${errorMsg}</div>`;
        }
        html += '</div>';

        detailsDiv.innerHTML = html;
        console.log('Details HTML set for:', symbol, 'HTML length:', html.length);

        detailsDiv.innerHTML = html;
        console.log('Details HTML set for:', symbol, 'HTML length:', html.length);

        // Render Chart if data available
        if (chartRes.ok && chartRes.data) {
            // Need to wait for DOM update
            setTimeout(() => {
                renderChart(symbol, sanitizedId, chartRes.data);
            }, 0);
        }

        // Ensure the details div is visible
        if (!detailsDiv.classList.contains('show')) {
            detailsDiv.classList.add('show');
        }

        // Force a reflow to ensure display
        detailsDiv.offsetHeight;
    } catch (error) {
        console.error('Error fetching stock data:', error);
        detailsDiv.innerHTML = `<div class="error">Error: ${escapeHtml(error.message || 'Failed to fetch stock data')}</div>`;
        if (!detailsDiv.classList.contains('show')) {
            detailsDiv.classList.add('show');
        }
    } finally {
        loadingStates.set(symbol, false);
        element.classList.remove('loading');
        console.log('Loading complete for:', symbol);
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show error message
function showError(message) {
    // Remove existing error
    clearError();

    // Create error element
    const errorDiv = document.createElement('div');
    errorDiv.id = 'errorMessage';
    errorDiv.className = 'error';
    errorDiv.style.cssText = 'background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 10px; margin-bottom: 20px; border-radius: 4px;';
    errorDiv.textContent = message;

    // Insert before the add-stock section
    const addStockDiv = document.querySelector('.add-stock');
    addStockDiv.parentNode.insertBefore(errorDiv, addStockDiv);

    // Auto-hide after 5 seconds
    setTimeout(() => {
        clearError();
    }, 5000);
}

// Clear error message
function clearError() {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.remove();
    }
}

// Search for stock suggestions
async function searchStocks(query) {
    if (!query || query.trim().length < 2) {
        hideSuggestions();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error('Search failed');
        }

        const suggestions = await response.json();
        currentSuggestions = suggestions;
        displaySuggestions(suggestions);
    } catch (error) {
        console.error('Error searching stocks:', error);
        hideSuggestions();
    }
}

// Display autocomplete suggestions
function displaySuggestions(suggestions) {
    const suggestionsDiv = document.getElementById('autocompleteSuggestions');

    if (!suggestions || suggestions.length === 0) {
        hideSuggestions();
        return;
    }

    suggestionsDiv.innerHTML = '';
    suggestions.forEach((suggestion, index) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            <div class="suggestion-symbol">${escapeHtml(suggestion.symbol)}</div>
            ${suggestion.name && suggestion.name !== suggestion.symbol ?
                `<div class="suggestion-name">${escapeHtml(suggestion.name)}</div>` : ''}
        `;
        item.onclick = () => selectSuggestion(suggestion);
        item.onmouseenter = () => {
            selectedSuggestionIndex = index;
            updateSelectedSuggestion();
        };
        suggestionsDiv.appendChild(item);
    });

    suggestionsDiv.classList.add('show');
    selectedSuggestionIndex = -1;
}

// Hide autocomplete suggestions
function hideSuggestions() {
    const suggestionsDiv = document.getElementById('autocompleteSuggestions');
    suggestionsDiv.classList.remove('show');
    currentSuggestions = [];
    selectedSuggestionIndex = -1;
}

// Select a suggestion
function selectSuggestion(suggestion) {
    const symbolInput = document.getElementById('symbolInput');
    symbolInput.value = suggestion.symbol;
    hideSuggestions();
    // Optionally auto-add the stock
    // addStock();
}

// Update selected suggestion highlight
function updateSelectedSuggestion() {
    const suggestionsDiv = document.getElementById('autocompleteSuggestions');
    const items = suggestionsDiv.querySelectorAll('.suggestion-item');
    items.forEach((item, index) => {
        if (index === selectedSuggestionIndex) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

// Handle keyboard navigation in autocomplete
function handleAutocompleteKeydown(e) {
    const suggestionsDiv = document.getElementById('autocompleteSuggestions');

    if (!suggestionsDiv.classList.contains('show') || currentSuggestions.length === 0) {
        if (e.key === 'Enter') {
            addStock();
        }
        return;
    }

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, currentSuggestions.length - 1);
            updateSelectedSuggestion();
            break;
        case 'ArrowUp':
            e.preventDefault();
            selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
            updateSelectedSuggestion();
            break;
        case 'Enter':
            e.preventDefault();
            if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < currentSuggestions.length) {
                selectSuggestion(currentSuggestions[selectedSuggestionIndex]);
                addStock();
            } else {
                addStock();
            }
            break;
        case 'Escape':
            hideSuggestions();
            break;
    }
}

// Allow adding stock with Enter key
document.addEventListener('DOMContentLoaded', () => {
    const symbolInput = document.getElementById('symbolInput');
    if (symbolInput) {
        // Handle input for autocomplete
        symbolInput.addEventListener('input', function (e) {
            const query = e.target.value.trim();

            // Clear previous timeout
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }

            // Debounce search (wait 300ms after user stops typing)
            searchTimeout = setTimeout(() => {
                searchStocks(query);
            }, 300);
        });

        // Handle keyboard events
        symbolInput.addEventListener('keydown', handleAutocompleteKeydown);

        // Hide suggestions when clicking outside
        document.addEventListener('click', function (e) {
            const suggestionsDiv = document.getElementById('autocompleteSuggestions');
            const autocompleteContainer = document.querySelector('.autocomplete-container');
            if (!autocompleteContainer.contains(e.target)) {
                hideSuggestions();
            }
        });

        // Handle Enter key for adding stock (fallback, main handling is in handleAutocompleteKeydown)
        symbolInput.addEventListener('keypress', function (e) {
            const suggestionsDiv = document.getElementById('autocompleteSuggestions');
            if (e.key === 'Enter' && !suggestionsDiv.classList.contains('show')) {
                addStock();
            }
        });
    }

    // Initialize the app
    init();
});

// Render Stock Chart using Chart.js
function renderChart(symbol, sanitizedId, chartData) {
    const canvasId = `chart-${sanitizedId}`;
    const ctx = document.getElementById(canvasId);

    if (!ctx) {
        console.error('Canvas element not found:', canvasId);
        return;
    }

    // Destroy existing chart if any
    if (stockCharts.has(symbol)) {
        stockCharts.get(symbol).destroy();
    }

    // Process data
    // chartData.datasets[0] is usually Price
    const priceDataset = chartData.datasets.find(d => d.metric === 'Price');
    if (!priceDataset) {
        console.error('No price dataset found for', symbol);
        ctx.parentNode.innerHTML = '<div class="error">No price data available for chart</div>';
        return;
    }

    const dates = priceDataset.values.map(v => v[0]);
    const prices = priceDataset.values.map(v => parseFloat(v[1]));

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: `${symbol} Price`,
                data: prices,
                borderColor: '#007bff',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                borderWidth: 2,
                pointRadius: 0, // Hide points for cleaner look locally, show on hover
                pointHoverRadius: 4,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: false
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxTicksLimit: 12
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: false
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        }
    });

    stockCharts.set(symbol, chart);
}


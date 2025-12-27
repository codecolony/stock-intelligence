const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001/api'
    : '/api';

// State management
let stocks = [];
let loadingStates = new Map();
let searchTimeout = null;
let currentSuggestions = [];
let selectedSuggestionIndex = -1;
let stockCharts = new Map();
let currentUser = null;

// Views
const VIEWS = ['landing', 'login', 'register', 'verify', 'app', 'admin'];

// Initialize: Load session and theme on page load
async function init() {
    initTheme();

    // Check if user is logged in
    const authenticated = await checkSession();

    if (authenticated) {
        navigateTo('app');
        await loadStocks();
    } else {
        navigateTo('landing');
    }
}

// Navigation
function navigateTo(viewId) {
    if (!VIEWS.includes(viewId)) return;

    VIEWS.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.remove('active');
    });

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0, 0);
    }

    if (viewId === 'admin') {
        loadAdminUsers();
    }
}

// Global Fetch with Auth Handling
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);

        if (response.status === 401 || response.status === 403) {
            const data = await response.json().catch(() => ({}));
            // Only redirect if it's a "login required" or "disabled" error
            if (data.error && (data.error.includes('login') || data.error.includes('disabled') || data.error.includes('Session'))) {
                showToast(data.error, 'danger');
                currentUser = null;
                navigateTo('login');
                throw new Error('AUTH_REQUIRED');
            }
        }

        return response;
    } catch (err) {
        if (err.message === 'AUTH_REQUIRED') throw err;
        throw err;
    }
}

// Session Management
async function checkSession() {
    try {
        const res = await fetch(`${API_BASE}/auth/me`);
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            updateUserUI();
            return true;
        }
    } catch (err) {
        console.error('Session check failed:', err);
    }
    return false;
}

function updateUserUI() {
    if (currentUser) {
        document.getElementById('display-email').textContent = currentUser.email;
        if (currentUser.isAdmin) {
            document.getElementById('adminLink').style.display = 'block';
        }
    }
}

// Auth Handlers
async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) return showToast('Please enter both email and password', 'warning');

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (res.ok) {
            currentUser = data.user;
            updateUserUI();
            showToast('Welcome back!', 'success');
            navigateTo('app');
            await loadStocks();
        } else {
            if (data.error && data.error.toLowerCase().includes('not verified')) {
                document.getElementById('verify-email-display').textContent = email;
                showToast('Email not verified. Please check your inbox.', 'warning');
                navigateTo('verify');
            } else {
                showToast(data.error || 'Login failed', 'danger');
            }
        }
    } catch (err) {
        showToast('Connection error', 'danger');
    }
}

async function handleRegister() {
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (!email || !password || !confirm) return showToast('All fields are required', 'warning');
    if (password !== confirm) return showToast('Passwords do not match', 'warning');

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, confirmPassword: confirm })
        });

        const data = await res.json();
        if (res.ok) {
            document.getElementById('verify-email-display').textContent = email;
            navigateTo('verify');
            showToast('Account created. Please check your email for the code.', 'success');
        } else {
            showToast(data.error || 'Registration failed', 'danger');
        }
    } catch (err) {
        showToast('Connection error', 'danger');
    }
}

async function handleVerify() {
    const email = document.getElementById('verify-email-display').textContent;
    const code = document.getElementById('verify-code').value.trim();

    if (!code) return showToast('Please enter the verification code', 'warning');

    try {
        const res = await fetch(`${API_BASE}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code })
        });

        const data = await res.json();
        if (res.ok) {
            showToast('Email verified! You can now login.', 'success');
            navigateTo('login');
        } else {
            showToast(data.error || 'Verification failed', 'danger');
        }
    } catch (err) {
        showToast('Connection error', 'danger');
    }
}

async function handleResendCode() {
    const email = document.getElementById('verify-email-display').textContent;
    if (!email) return showToast('Email missing. Please try login or register again.', 'danger');

    showToast('Sending new code...', 'info');

    try {
        const res = await fetch(`${API_BASE}/auth/resend-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await res.json();
        if (res.ok) {
            showToast('A new code has been sent to your email.', 'success');
        } else {
            showToast(data.error || 'Failed to resend code', 'danger');
        }
    } catch (err) {
        showToast('Connection error', 'danger');
    }
}

async function handleLogout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
        currentUser = null;
        stocks = [];
        navigateTo('landing');
        showToast('Logged out successfully', 'success');
    } catch (err) {
        navigateTo('landing');
    }
}

// Admin Logic
async function loadAdminUsers() {
    const list = document.getElementById('admin-user-list');
    list.innerHTML = '<tr><td colspan="4" style="text-align:center">Loading users...</td></tr>';

    try {
        const res = await apiFetch(`${API_BASE}/admin/users`);
        const users = await res.json();

        list.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');

            let status = '';
            if (user.is_disabled) status = '<span class="status-badge status-disabled">Disabled</span>';
            else if (user.is_verified) status = '<span class="status-badge status-verified">Verified</span>';
            else status = '<span class="status-badge status-pending">Pending</span>';

            tr.innerHTML = `
                <td>${user.email} ${user.is_admin ? '<span style="color:var(--primary); font-weight:bold;">(Admin)</span>' : ''}</td>
                <td>${status}</td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td style="display:flex; gap:10px;">
                    ${!user.is_admin ? `
                        <button class="btn" style="padding: 5px 10px; font-size: 11px; background: ${user.is_disabled ? 'var(--success)' : 'var(--warning)'}; color: white;" 
                            onclick="toggleUserStatus(${user.id})">
                            ${user.is_disabled ? 'Enable' : 'Disable'}
                        </button>
                        <button class="btn" style="padding: 5px 10px; font-size: 11px; background: var(--danger); color: white;" 
                            onclick="deleteUserPermanently(${user.id}, '${user.email}')">
                            Delete
                        </button>
                    ` : '<span style="color:var(--text-secondary); font-size:11px;">System Managed</span>'}
                </td>
            `;
            list.appendChild(tr);
        });
    } catch (err) {
        if (err.message !== 'AUTH_REQUIRED') {
            list.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--danger)">Failed to load users</td></tr>';
        }
    }
}

async function deleteUserPermanently(userId, email) {
    const confirmation = window.confirm(`⚠️ PERMANENT DELETION WARNING\n\nAre you sure you want to delete account: ${email}?\n\nThis action cannot be undone. All user data, watchlist, and portfolio settings will be lost forever.`);

    if (confirmation) {
        try {
            const res = await apiFetch(`${API_BASE}/admin/users/${userId}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('User deleted forever', 'success');
                loadAdminUsers();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to delete user', 'danger');
            }
        } catch (err) {
            showToast('Connection error', 'danger');
        }
    }
}

async function toggleUserStatus(userId) {
    try {
        const res = await apiFetch(`${API_BASE}/admin/users/${userId}/toggle`, { method: 'POST' });
        if (res.ok) {
            showToast('User status updated', 'success');
            loadAdminUsers();
        } else {
            const data = await res.json();
            showToast(data.error || 'Failed to update user status', 'danger');
        }
    } catch (err) {
        showToast('Connection error', 'danger');
    }
}

// UI Utilities
function showToast(message, type = 'success') {
    const toast = document.getElementById('notification');
    toast.style.display = 'block';
    toast.style.background = type === 'success' ? 'var(--success)' : (type === 'danger' ? 'var(--danger)' : 'var(--warning)');
    toast.textContent = message;

    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}

function initTheme() {
    const savedTheme = localStorage.getItem('selected-theme') || 'ocean';
    applyTheme(savedTheme);

    const settingsBtn = document.getElementById('settingsBtn');
    const settingsMenu = document.getElementById('settingsMenu');
    const themeOptions = document.querySelectorAll('.theme-option');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsMenu.classList.toggle('show');
        });
    }

    document.addEventListener('click', () => {
        if (settingsMenu) settingsMenu.classList.remove('show');
    });

    if (settingsMenu) {
        settingsMenu.addEventListener('click', (e) => e.stopPropagation());
    }

    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const themeId = option.getAttribute('data-theme-id');
            applyTheme(themeId);
            localStorage.setItem('selected-theme', themeId);
            settingsMenu.classList.remove('show');
        });
    });
}

function applyTheme(themeId) {
    document.documentElement.setAttribute('data-theme', themeId);
    const themeOptions = document.querySelectorAll('.theme-option');
    themeOptions.forEach(option => {
        if (option.getAttribute('data-theme-id') === themeId) option.classList.add('active');
        else option.classList.remove('active');
    });
}

// Original Stock Logic (Updated with apiFetch)
async function loadStocks() {
    try {
        const response = await apiFetch(`${API_BASE}/stocks`);
        if (!response.ok) throw new Error('Failed to load stocks');
        stocks = await response.json();
        renderStocks();
    } catch (error) {
        if (error.message !== 'AUTH_REQUIRED') console.error('Error loading stocks:', error);
    }
}

async function addStock() {
    const input = document.getElementById('symbolInput');
    const symbol = input.value.trim().toUpperCase();

    if (!symbol) return showToast('Please enter a stock symbol', 'warning');
    if (stocks.find(s => s.symbol.toUpperCase() === symbol)) return showToast('Stock already added', 'warning');

    const button = document.querySelector('.add-stock .btn');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Adding...';

    // Use selected name if available, otherwise fallback to symbol
    const stockName = (selectedStockInfo && selectedStockInfo.symbol.toUpperCase() === symbol)
        ? selectedStockInfo.name
        : symbol;

    try {
        const response = await apiFetch(`${API_BASE}/stocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: symbol, name: stockName })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to add stock');
        }

        const newStock = await response.json();
        stocks.push(newStock);
        input.value = '';
        selectedStockInfo = null; // Reset selection
        renderStocks();
        showToast(`Added ${symbol} to portfolio`, 'success');
    } catch (error) {
        if (error.message !== 'AUTH_REQUIRED') showToast(error.message, 'danger');
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

function sanitizeSymbolForId(symbol) {
    return symbol.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase();
}

function renderStocks() {
    const list = document.getElementById('stocksList');
    list.innerHTML = '';

    if (stocks.length === 0) {
        list.innerHTML = '<li style="padding: 20px; text-align: center; color: var(--text-secondary);">No stocks added yet. Add a stock to get started.</li>';
        return;
    }

    stocks.forEach(stock => {
        const li = document.createElement('li');
        li.className = 'stock-item';
        const isLoading = loadingStates.get(stock.symbol) || false;
        if (isLoading) li.classList.add('loading');

        const sanitizedId = sanitizeSymbolForId(stock.symbol);

        li.innerHTML = `
            <div class="stock-symbol">${stock.symbol}</div>
            ${stock.name && stock.name !== stock.symbol ? `<div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 5px;">${stock.name}</div>` : ''}
            <div class="stock-details" id="details-${sanitizedId}"></div>
        `;

        li.addEventListener('click', (e) => {
            e.stopPropagation();
            fetchStockData(stock.symbol, li);
        });

        list.appendChild(li);
    });
}

async function fetchStockData(symbol, element) {
    const sanitizedId = sanitizeSymbolForId(symbol);
    const detailsDiv = element.querySelector(`#details-${sanitizedId}`);

    if (detailsDiv.classList.contains('show') && !loadingStates.get(symbol)) {
        detailsDiv.classList.remove('show');
        element.classList.remove('active');
        return;
    }

    // Deactivate others
    document.querySelectorAll('.stock-item').forEach(item => {
        if (item !== element) {
            item.classList.remove('active');
            const d = item.querySelector('.stock-details');
            if (d) d.classList.remove('show');
        }
    });

    loadingStates.set(symbol, true);
    element.classList.add('loading');
    element.classList.add('active');
    detailsDiv.classList.add('show');
    detailsDiv.innerHTML = '<div style="padding: 30px; text-align: center;">Loading professional analysis...</div>';

    try {
        const encodedSymbol = encodeURIComponent(symbol);
        const [priceRes, newsRes, chartRes] = await Promise.all([
            apiFetch(`${API_BASE}/prices/${encodedSymbol}`),
            apiFetch(`${API_BASE}/news/${encodedSymbol}`),
            apiFetch(`${API_BASE}/charts/${encodedSymbol}?_=${Date.now()}`)
        ]);

        const priceData = await priceRes.json();
        const newsData = await newsRes.json();
        const chartData = await chartRes.json();

        let html = '';

        // Price
        html += '<div class="detail-section"><h3>Current Status</h3><div style="display:flex; align-items:flex-end; gap:15px;">';
        if (priceData.price) {
            html += `<div class="price">₹${priceData.price.toFixed(2)}</div>`;
            if (priceData.changePercent !== undefined) {
                const color = priceData.changePercent >= 0 ? 'var(--success)' : 'var(--danger)';
                html += `<div style="font-size: 16px; color: ${color}; font-weight:600; margin-bottom:5px;">${priceData.changePercent >= 0 ? '▲' : '▼'} ${Math.abs(priceData.changePercent).toFixed(2)}%</div>`;
            }
        }
        html += '</div></div>';

        // Chart
        html += '<div class="detail-section"><h3>1 Year Performance</h3><div class="chart-container" style="height:300px;"><canvas id="chart-' + sanitizedId + '"></canvas></div></div>';

        // Fundamentals
        if (priceData.fundamentals) {
            html += '<div class="detail-section"><h3>Fundamental Metrics</h3>' + generateFundamentalsHtml(priceData.fundamentals) + '</div>';
        }

        // News
        html += '<div class="detail-section"><h3>Latest Insights</h3>';
        if (newsData && newsData.length > 0) {
            html += '<ul class="news-list">' + newsData.map(n => `
                <li class="news-item">
                    <div class="news-title">${escapeHtml(n.title)}</div>
                    <a href="${n.link}" target="_blank" class="news-link">View Source</a>
                </li>
            `).join('') + '</ul>';
        } else {
            html += '<p style="color:var(--text-secondary); font-size:13px;">No recent news found.</p>';
        }
        html += '</div>';

        detailsDiv.innerHTML = html;

        const currentPrice = priceData.price;
        setTimeout(() => renderChart(symbol, sanitizedId, chartData, currentPrice), 0);

    } catch (error) {
        if (error.message !== 'AUTH_REQUIRED') {
            detailsDiv.innerHTML = `<div class="error">Failed to load data: ${error.message}</div>`;
        }
    } finally {
        loadingStates.set(symbol, false);
        element.classList.remove('loading');
    }
}

// [Include existing helper functions: renderChart, displayTechnicalEventsList, generateFundamentalsHtml, getTrafficColor, getColorLabel, tooltipInfo, escapeHtml, etc.]
// To keep code concise, I've integrated them below but they are unchanged in logic.

// Tooltip definitions
const tooltipInfo = {
    "Market Cap": { definition: "Total market value of a company's outstanding shares.", ideal: ">₹20,000 Cr: Large | ₹5k-20k: Mid | <₹5k: Small" },
    "Stock P/E": { definition: "Price-to-Earnings ratio. Shows valuation relative to earnings.", ideal: "15-25: Ideal | <15: Undervalued | >40: Expensive" },
    "Book Value": { definition: "Net asset value per share.", ideal: "Higher is better. Price < Book is value signal." },
    "Dividend Yield": { definition: "Annual dividend as % of price.", ideal: "2-6%: Health income | >6%: Check sustainability" },
    "ROCE": { definition: "Return on Capital Employed. Efficiency of capital use.", ideal: ">15%: Good | >20%: Excellent" },
    "ROE": { definition: "Return on Equity. Profitability on shareholder money.", ideal: ">15%: Good | >20%: Excellent" },
    "Face Value": { definition: "Nominal value of a share.", ideal: "Fixed value (₹1, ₹2, ₹5, ₹10)" },
    "Promoter holding": { definition: "Shares held by founders.", ideal: "50-75%: Strong confidence | <30%: Concern" },
    "Pledged percentage": { definition: "Promoter shares used as collateral.", ideal: "0%: Perfect | >25%: High risk" },
    "Debt to equity": { definition: "Total Debt / Equity ratio.", ideal: "<0.5: Healthy | >1: High risk" },
    "Intrinsic Value": { definition: "Estimated true value of the company based on DCF.", ideal: "Compare with Current Price. Buying below IV is safer." },
    "Graham Number": { definition: "The maximum price a defensive investor should pay for a stock.", ideal: "Current Price < Graham Number is often a value signal." },
    "PEG Ratio": { definition: "Price/Earnings to Growth ratio.", ideal: "<1: Undervalued relative to growth | >2: Overvalued" },
    "Industry PE": { definition: "Average P/E ratio of the company's sector.", ideal: "Stock P/E < Industry PE suggests relative value." },
    "Quick ratio": { definition: "Ability to meet short-term debt with liquid assets.", ideal: ">1: Healthy liquidity" },
    "Current ratio": { definition: "Current Assets / Current Liabilities.", ideal: "1.5 to 3: Healthy | <1: Liquidity risk" },
    "Interest Coverage": { definition: "Ability to pay interest on outstanding debt.", ideal: ">3: Safe | <1.5: Risky" },
    "Price to Book Value": { definition: "P/BV ratio.", ideal: "<2: Generally good | >5: Expensive (sector dependent)" }
};

function generateFundamentalsHtml(fundamentals) {
    const keys = [
        "Market Cap", "Current Price", "High / Low", "Stock P/E", "Book Value",
        "Dividend Yield", "ROCE", "ROE", "Face Value", "Promoter holding",
        "Pledged percentage", "Debt to equity", "Intrinsic Value", "Industry PE",
        "PEG Ratio", "EPS", "Sales growth", "Profit growth", "Graham Number",
        "Quick ratio", "Current ratio", "Interest Coverage", "Debt", "Price to Book Value"
    ];
    let html = `<div class="fundamentals-grid">`;

    keys.forEach(key => {
        if (!fundamentals[key]) return;
        const color = getTrafficColor(key, fundamentals[key]);
        const tooltip = tooltipInfo[key];
        const tipText = tooltip ? `${tooltip.definition}\n\n📊 ${tooltip.ideal}` : key;

        html += `
            <div class="fundamental-card" title="${tipText.replace(/"/g, '&quot;')}">
                <div class="fundamental-label">${key} ${tooltip ? 'ⓘ' : ''}</div>
                <div class="fundamental-value">
                    ${fundamentals[key]}
                    ${color ? `<span class="traffic-light" style="background:${color}; box-shadow:0 0 6px ${color}40;"></span>` : ''}
                </div>
            </div>
        `;
    });
    return html + '</div>';
}

function getTrafficColor(key, valueStr) {
    const val = parseFloat(valueStr.replace(/,/g, '').replace(/[^\d.-]/g, ''));
    if (isNaN(val)) return null;
    const k = key.toLowerCase();
    if (k.includes('p/e')) return val < 25 ? '#10b981' : (val > 40 ? '#ef4444' : '#f59e0b');
    if (k === 'roce' || k === 'roe') return val >= 20 ? '#10b981' : (val < 10 ? '#ef4444' : '#f59e0b');
    if (k.includes('debt')) return val < 0.5 ? '#10b981' : (val > 1.0 ? '#ef4444' : '#f59e0b');
    if (k.includes('holding')) return val > 60 ? '#10b981' : (val < 40 ? '#ef4444' : '#f59e0b');
    if (k.includes('pledged')) return val === 0 ? '#10b981' : (val > 10 ? '#ef4444' : '#f59e0b');
    return null;
}

function renderChart(symbol, sanitizedId, chartData, currentPrice) {
    const ctx = document.getElementById(`chart-${sanitizedId}`);
    if (!ctx) return;
    if (stockCharts.has(symbol)) stockCharts.get(symbol).destroy();

    const priceDataset = chartData.datasets.find(d => d.metric === 'Price');
    const dates = priceDataset.values.map(v => v[0]);
    let prices = priceDataset.values.map(v => parseFloat(v[1]));
    let events = chartData.technicalEvents || [];

    // Scale chart prices to match current price if there's a significant mismatch
    if (currentPrice && prices.length > 0) {
        const lastChartPrice = prices[prices.length - 1];
        const ratio = currentPrice / lastChartPrice;
        if (Math.abs(ratio - 1) > 0.05) {
            prices = prices.map(p => p * ratio);
            events = events.map(e => ({ ...e, price: e.price * ratio }));
        }
    }

    const eventMap = new Map();
    const pointRadii = dates.map(() => 0);
    const pointColors = dates.map(() => 'transparent');

    events.forEach(e => {
        const idx = dates.indexOf(e.date);
        if (idx !== -1) {
            pointRadii[idx] = 6;
            pointColors[idx] = e.signal === 'bullish' ? '#10b981' : '#ef4444';
            eventMap.set(idx, e);
        }
    });

    const style = getComputedStyle(document.documentElement);
    const primary = style.getPropertyValue('--primary').trim();
    const text = style.getPropertyValue('--text-primary').trim();

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Price',
                data: prices,
                borderColor: primary,
                backgroundColor: primary + '20',
                fill: true,
                pointRadius: pointRadii,
                pointBackgroundColor: pointColors,
                pointBorderColor: '#fff',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Price: ₹${ctx.parsed.y.toFixed(2)}`,
                        afterLabel: (ctx) => {
                            const e = eventMap.get(ctx.dataIndex);
                            return e ? `\n📊 ${e.name}: ${e.description}` : '';
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: text, maxTicksLimit: 8 }, grid: { display: false } },
                y: {
                    ticks: {
                        color: text,
                        callback: function (value) { return '₹' + value.toLocaleString(); }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
    stockCharts.set(symbol, chart);
    displayTechnicalEventsList(sanitizedId, events);
}

function displayTechnicalEventsList(sanitizedId, events) {
    const chart = document.getElementById(`chart-${sanitizedId}`)?.parentElement;
    if (!chart) return;
    const existing = chart.parentElement.querySelector('.technical-events-list');
    if (existing) existing.remove();
    if (!events || events.length === 0) return;

    const html = `
        <div class="technical-events-list">
            <h4 style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; font-weight: 600;">Recent Technical Events</h4>
            <div style="max-height:200px; overflow-y:auto; padding-right:8px;">
                ${events.slice(-12).reverse().map(e => `
                    <div class="technical-event-item">
                        <span class="event-signal" style="background:${e.signal === 'bullish' ? 'var(--success)' : 'var(--danger)'};"></span>
                        <span class="event-date">${e.date}</span>
                        <span class="event-name">${e.name}</span>
                        <span class="event-price">₹${e.price.toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    chart.insertAdjacentHTML('afterend', html);
}

function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// Autocomplete logic
async function searchStocks(query) {
    if (!query || query.trim().length < 2) return hideSuggestions();
    try {
        const res = await apiFetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
            currentSuggestions = await res.json();
            displaySuggestions(currentSuggestions);
        }
    } catch (e) { }
}

function displaySuggestions(s) {
    const div = document.getElementById('autocompleteSuggestions');
    if (!s || s.length === 0) return hideSuggestions();
    div.innerHTML = s.map((item, i) => `
        <div class="suggestion-item" onclick="selectSuggestion(${JSON.stringify(item).replace(/"/g, '&quot;')})">
            <div class="suggestion-symbol">${escapeHtml(item.symbol)}</div>
            <div style="font-size:11px; color:var(--text-secondary)">${escapeHtml(item.name)}</div>
        </div>
    `).join('');
    div.classList.add('show');
}

function hideSuggestions() {
    document.getElementById('autocompleteSuggestions').classList.remove('show');
}

let selectedStockInfo = null;

function selectSuggestion(s) {
    const input = document.getElementById('symbolInput');
    input.value = s.symbol;
    selectedStockInfo = s;
    hideSuggestions();
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('symbolInput');
    if (input) {
        input.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => searchStocks(e.target.value.trim()), 300);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addStock();
        });
    }
    init();
});

// Stock Market Script
document.addEventListener('DOMContentLoaded', async function() {
    let currentEmployee = null;
    let wallet = null;
    let stocks = [];
    let investments = [];
    let stockCharts = {}; // Store chart instances
    let investmentCharts = {}; // Store investment chart instances
    
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'employee') {
        window.location.href = 'index.html';
        return;
    }
    
    // Get current employee
    async function getCurrentEmployee() {
        if (currentEmployee) return currentEmployee;
        
        const currentUser = await supabaseService.getCurrentUser();
        if (!currentUser) return null;
        
        const employees = await supabaseService.getEmployees();
        currentEmployee = employees?.find(e => e.user_id === currentUser.id);
        return currentEmployee;
    }
    
    // Load wallet
    async function loadWallet() {
        const employee = await getCurrentEmployee();
        if (!employee) return;
        
        wallet = await supabaseService.getEmployeeWallet(employee.id);
        
        if (!wallet) {
            wallet = { balance: 0 };
        }
        
        document.getElementById('walletBalance').textContent = 
            `$${parseFloat(wallet.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    // Load stocks
    async function loadStocks() {
        const grid = document.getElementById('stocksGrid');
        if (!grid) return;
        
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('stock market data');
        }
        
        stocks = await supabaseService.getStockMarket();
        
        if (stocks.length === 0) {
            grid.innerHTML = '<div style="text-align: center; padding: 40px; color: #64748b;">No stocks available</div>';
            return;
        }
        
        grid.innerHTML = stocks.map(stock => {
            const changePercent = parseFloat(stock.change_percent || 0);
            const isPositive = changePercent >= 0;
            const changeClass = isPositive ? 'positive' : 'negative';
            const changeSymbol = isPositive ? '+' : '';
            
            return `
                <div class="stock-card" data-stock-id="${stock.id}">
                    <div class="stock-header">
                        <div class="stock-symbol">${stock.symbol}</div>
                        <div class="stock-change ${changeClass}">
                            ${changeSymbol}${changePercent.toFixed(2)}%
                        </div>
                    </div>
                    <div class="stock-price">$${parseFloat(stock.current_price).toFixed(2)}</div>
                    <div class="stock-company">${stock.company_name}</div>
                    <div class="stock-chart-container">
                        <canvas id="chart-${stock.id}" class="stock-chart"></canvas>
                    </div>
                    <div class="buy-stock-form">
                        <input type="number" 
                               id="shares-${stock.symbol}" 
                               placeholder="Shares" 
                               min="0.01" 
                               step="0.01"
                               value="1">
                        <button class="purchase-btn" 
                                data-symbol="${stock.symbol}"
                                data-price="${stock.current_price}">
                            Buy
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Load and render charts for each stock
        for (const stock of stocks) {
            await loadStockChart(stock);
        }
        
        // Add event listeners
        document.querySelectorAll('.purchase-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const symbol = this.getAttribute('data-symbol');
                const sharesInput = document.getElementById(`shares-${symbol}`);
                const shares = parseFloat(sharesInput.value);
                
                if (!shares || shares <= 0) {
                    alert('Please enter a valid number of shares');
                    return;
                }
                
                await buyStock(symbol, shares);
            });
        });
    }
    
    // Buy stock
    async function buyStock(symbol, shares) {
        const employee = await getCurrentEmployee();
        if (!employee) {
            alert('Error: Employee not found');
            return;
        }
        
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('stock purchase');
        }
        
        const result = await supabaseService.buyStock(employee.id, symbol, shares);
        
        if (result.error) {
            alert(`❌ Purchase failed: ${result.error}`);
            return;
        }
        
        alert(`✅ Purchased ${shares} shares of ${symbol}!`);
        
        // Reload data
        await loadWallet();
        await loadStocks();
        await loadInvestments();
    }
    
    // Load investments
    async function loadInvestments() {
        const employee = await getCurrentEmployee();
        if (!employee) return;
        
        const list = document.getElementById('investmentsList');
        if (!list) return;
        
        investments = await supabaseService.getEmployeeInvestments(employee.id);
        
        // Update current values
        for (const investment of investments) {
            if (investment.status === 'active' && investment.stock_market) {
                const currentPrice = parseFloat(investment.stock_market.current_price);
                const shares = parseFloat(investment.shares);
                const currentValue = currentPrice * shares;
                const purchaseValue = parseFloat(investment.current_value);
                const profit = currentValue - purchaseValue;
                const profitPercent = (profit / purchaseValue) * 100;
                
                investment.currentValue = currentValue;
                investment.profit = profit;
                investment.profitPercent = profitPercent;
            }
        }
        
        const activeInvestments = investments.filter(inv => inv.status === 'active');
        
        if (activeInvestments.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No active investments</div>';
            return;
        }
        
        list.innerHTML = activeInvestments.map(investment => {
            const stock = investment.stock_market;
            const profit = investment.profit || 0;
            const profitPercent = investment.profitPercent || 0;
            const isPositive = profit >= 0;
            const profitClass = isPositive ? 'positive' : 'negative';
            const profitSymbol = isPositive ? '+' : '';
            
            return `
                <div class="investment-item" data-investment-id="${investment.id}">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: var(--text-primary, #1f2937); margin-bottom: 8px;">
                            ${stock?.symbol || investment.stock_symbol} - ${investment.shares} shares
                        </div>
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 12px;">
                            Bought at $${parseFloat(investment.purchase_price).toFixed(2)} • 
                            Current: $${parseFloat(stock?.current_price || 0).toFixed(2)}
                        </div>
                        <div class="investment-chart-container">
                            <canvas id="investment-chart-${investment.id}" class="investment-chart"></canvas>
                        </div>
                    </div>
                    <div style="text-align: right; margin-left: 20px;">
                        <div class="investment-profit ${profitClass}" style="margin-bottom: 8px;">
                            ${profitSymbol}$${Math.abs(profit).toFixed(2)} (${profitSymbol}${profitPercent.toFixed(2)}%)
                        </div>
                        <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px;">
                            Value: $${(parseFloat(stock?.current_price || 0) * parseFloat(investment.shares)).toFixed(2)}
                        </div>
                        <button class="btn-secondary sell-investment-btn" 
                                style="padding: 6px 12px; font-size: 12px;"
                                data-investment-id="${investment.id}">
                            Sell
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Load charts for investments
        for (const investment of activeInvestments) {
            await loadInvestmentChart(investment);
        }
        
        // Add sell event listeners (only for sell buttons, not the whole item)
        // Remove old listeners first to prevent duplicates
        document.querySelectorAll('.sell-investment-btn').forEach(btn => {
            // Clone and replace to remove old event listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Add fresh event listener
            newBtn.addEventListener('click', async function(e) {
                e.stopPropagation(); // Prevent event bubbling
                const investmentId = parseInt(this.getAttribute('data-investment-id'));
                if (!investmentId || isNaN(investmentId)) {
                    console.error('Invalid investment ID:', this.getAttribute('data-investment-id'));
                    alert('Error: Invalid investment ID');
                    return;
                }
                
                if (confirm('Are you sure you want to sell this investment?')) {
                    await sellStock(investmentId);
                }
            });
        });
    }
    
    // Sell stock
    async function sellStock(investmentId) {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('selling stock');
        }
        
        const result = await supabaseService.sellStock(investmentId);
        
        if (result.error) {
            alert(`❌ Sale failed: ${result.error}`);
            return;
        }
        
        const investment = investments.find(inv => inv.id === investmentId);
        if (!investment) {
            console.error('Investment not found:', investmentId);
            alert('✅ Stock sold successfully!');
        } else {
            const profit = result.data.current_value - parseFloat(investment.current_value || investment.purchase_price * investment.shares);
            const profitText = profit >= 0 ? `Profit: $${profit.toFixed(2)}` : `Loss: $${Math.abs(profit).toFixed(2)}`;
            alert(`✅ Stock sold! ${profitText}`);
        }
        
        // Reload data
        await loadWallet();
        await loadInvestments();
    }
    
    // Refresh stock prices
    document.getElementById('refreshStocksBtn').addEventListener('click', async function() {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('updating stock prices');
        }
        
        await supabaseService.updateStockPrices();
        await loadStocks();
        await loadInvestments();
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async function() {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('logout');
        }
        
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                await supabaseService.signOut();
            }
        } catch (error) {
            console.error('Error during logout:', error);
        }
        
        sessionStorage.clear();
        window.location.href = 'index.html';
    });
    
    // Initialize
    await loadWallet();
    await loadStocks();
    await loadInvestments();
    
    // Load investment chart
    async function loadInvestmentChart(investment) {
        const canvas = document.getElementById(`investment-chart-${investment.id}`);
        if (!canvas) return;
        
        // Destroy existing chart if it exists
        if (investmentCharts[investment.id]) {
            investmentCharts[investment.id].destroy();
        }
        
        const stock = investment.stock_market;
        if (!stock) return;
        
        // Get price history for this stock
        const history = await supabaseService.getStockPriceHistory(stock.id, 50);
        
        // Calculate investment value over time
        const shares = parseFloat(investment.shares);
        const purchasePrice = parseFloat(investment.purchase_price);
        const purchaseValue = purchasePrice * shares;
        
        const labels = history.length > 0 
            ? history.map(h => new Date(h.recorded_at).toLocaleTimeString())
            : [new Date().toLocaleTimeString()];
        const values = history.length > 0
            ? history.map(h => parseFloat(h.price) * shares)
            : [parseFloat(stock.current_price) * shares];
        
        // Add current value
        const currentValue = parseFloat(stock.current_price) * shares;
        if (values.length === 0 || values[values.length - 1] !== currentValue) {
            labels.push(new Date().toLocaleTimeString());
            values.push(currentValue);
        }
        
        // Add purchase point at the beginning
        labels.unshift('Purchase');
        values.unshift(purchaseValue);
        
        const ctx = canvas.getContext('2d');
        const currentProfit = currentValue - purchaseValue;
        const chartColor = currentProfit >= 0 ? '#10b981' : '#ef4444';
        
        // Calculate min/max for scaling
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const valueRange = maxValue - minValue;
        const padding = valueRange * 0.1;
        
        investmentCharts[investment.id] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Investment Value',
                    data: values,
                    borderColor: chartColor,
                    backgroundColor: currentProfit >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBorderWidth: 3,
                    pointHoverBackgroundColor: chartColor,
                    pointHoverBorderColor: '#fff'
                }, {
                    label: 'Purchase Price',
                    data: values.map(() => purchaseValue),
                    borderColor: '#9ca3af',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 11
                            }
                        }
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: {
                            size: 13,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 12
                        },
                        callbacks: {
                            title: function(context) {
                                return context[0].label;
                            },
                            label: function(context) {
                                if (context.datasetIndex === 0) {
                                    const value = context.parsed.y;
                                    const profit = value - purchaseValue;
                                    const profitPercent = ((profit / purchaseValue) * 100).toFixed(2);
                                    return `Value: $${value.toFixed(2)} (${profit >= 0 ? '+' : ''}${profitPercent}%)`;
                                } else {
                                    return `Purchase: $${purchaseValue.toFixed(2)}`;
                                }
                            },
                            labelColor: function(context) {
                                return {
                                    borderColor: context.datasetIndex === 0 ? chartColor : '#9ca3af',
                                    backgroundColor: context.datasetIndex === 0 ? chartColor : '#9ca3af'
                                };
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            maxTicksLimit: 6,
                            font: {
                                size: 9
                            },
                            color: '#6b7280'
                        },
                        title: {
                            display: true,
                            text: 'Time',
                            font: {
                                size: 10,
                                weight: 'bold'
                            },
                            color: '#374151'
                        }
                    },
                    y: {
                        display: true,
                        position: 'right',
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(0);
                            },
                            font: {
                                size: 9
                            },
                            color: '#6b7280',
                            maxTicksLimit: 6
                        },
                        min: Math.max(0, minValue - padding),
                        max: maxValue + padding,
                        title: {
                            display: true,
                            text: 'Value ($)',
                            font: {
                                size: 10,
                                weight: 'bold'
                            },
                            color: '#374151'
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                elements: {
                    line: {
                        borderJoinStyle: 'round',
                        borderCapStyle: 'round'
                    }
                }
            }
        });
    }
    
    // Load stock price chart
    async function loadStockChart(stock) {
        const canvas = document.getElementById(`chart-${stock.id}`);
        if (!canvas) return;
        
        // Destroy existing chart if it exists
        if (stockCharts[stock.id]) {
            stockCharts[stock.id].destroy();
        }
        
        // Get price history
        const history = await supabaseService.getStockPriceHistory(stock.id, 50);
        console.log(`📊 Loading chart for ${stock.symbol}, history points:`, history.length);
        
        let labels = [];
        let prices = [];
        
        if (history.length > 0) {
            // Sort by time to ensure correct order
            const sortedHistory = [...history].sort((a, b) => 
                new Date(a.recorded_at) - new Date(b.recorded_at)
            );
            
            labels = sortedHistory.map(h => {
                const date = new Date(h.recorded_at);
                return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            });
            prices = sortedHistory.map(h => parseFloat(h.price));
        }
        
        // Always add current price as the latest point
        const currentPrice = parseFloat(stock.current_price);
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        // Only add if it's different from the last point or if we have no history
        if (prices.length === 0 || Math.abs(prices[prices.length - 1] - currentPrice) > 0.01) {
            labels.push(currentTime);
            prices.push(currentPrice);
        } else {
            // Update the last label to current time
            labels[labels.length - 1] = currentTime;
            prices[prices.length - 1] = currentPrice;
        }
        
        // If we still have no data, create at least 2 points for a visible line
        if (prices.length < 2) {
            const pastTime = new Date(now.getTime() - 60000); // 1 minute ago
            labels.unshift(pastTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            prices.unshift(currentPrice * 0.99); // Slightly lower price
        }
        
        console.log(`📈 Chart data for ${stock.symbol}:`, { labels: labels.length, prices: prices.length, prices });
        
        const ctx = canvas.getContext('2d');
        const changePercent = parseFloat(stock.change_percent || 0);
        const chartColor = changePercent >= 0 ? '#10b981' : '#ef4444';
        
        // Calculate min/max for better scaling
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;
        const padding = priceRange > 0 ? priceRange * 0.1 : maxPrice * 0.1; // 10% padding or 10% of price if no range
        
        stockCharts[stock.id] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: stock.symbol,
                    data: prices,
                    borderColor: chartColor,
                    backgroundColor: changePercent >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBorderWidth: 3,
                    pointHoverBackgroundColor: chartColor,
                    pointHoverBorderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: {
                            size: 14,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 13
                        },
                        callbacks: {
                            title: function(context) {
                                return `${stock.symbol} - ${context[0].label}`;
                            },
                            label: function(context) {
                                const price = context.parsed.y;
                                const prevPrice = context.dataset.data[context.dataIndex - 1];
                                let change = '';
                                if (prevPrice !== undefined) {
                                    const diff = price - prevPrice;
                                    const diffPercent = ((diff / prevPrice) * 100).toFixed(2);
                                    change = ` (${diff >= 0 ? '+' : ''}${diffPercent}%)`;
                                }
                                return `Price: $${price.toFixed(2)}${change}`;
                            },
                            labelColor: function(context) {
                                return {
                                    borderColor: chartColor,
                                    backgroundColor: chartColor
                                };
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            maxTicksLimit: 6,
                            font: {
                                size: 10
                            },
                            color: '#6b7280'
                        },
                        title: {
                            display: true,
                            text: 'Time',
                            font: {
                                size: 11,
                                weight: 'bold'
                            },
                            color: '#374151'
                        }
                    },
                    y: {
                        display: true,
                        position: 'right',
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            },
                            font: {
                                size: 10
                            },
                            color: '#6b7280',
                            maxTicksLimit: 6
                        },
                        min: Math.max(0, minPrice - padding),
                        max: maxPrice + padding,
                        title: {
                            display: true,
                            text: 'Price ($)',
                            font: {
                                size: 11,
                                weight: 'bold'
                            },
                            color: '#374151'
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                elements: {
                    line: {
                        borderJoinStyle: 'round',
                        borderCapStyle: 'round'
                    }
                }
            }
        });
    }
    
    // Auto-refresh stock prices every 5 seconds
    setInterval(async () => {
        try {
            console.log('🔄 Updating stock prices...');
            const updateResult = await supabaseService.updateStockPrices();
            console.log('✅ Stock prices update result:', updateResult);
            
            // Reload stocks to get updated prices
            const updatedStocks = await supabaseService.getStockMarket();
            console.log('📊 Updated stocks:', updatedStocks.length);
            
            // Update stock cards with new prices
            for (const stock of updatedStocks) {
                // Update price display
                const priceElement = document.querySelector(`[data-stock-id="${stock.id}"] .stock-price`);
                if (priceElement) {
                    priceElement.textContent = `$${parseFloat(stock.current_price).toFixed(2)}`;
                }
                
                // Update change percent
                const changePercent = parseFloat(stock.change_percent || 0);
                const isPositive = changePercent >= 0;
                const changeClass = isPositive ? 'positive' : 'negative';
                const changeSymbol = isPositive ? '+' : '';
                const changeElement = document.querySelector(`[data-stock-id="${stock.id}"] .stock-change`);
                if (changeElement) {
                    changeElement.className = `stock-change ${changeClass}`;
                    changeElement.textContent = `${changeSymbol}${changePercent.toFixed(2)}%`;
                }
                
                // Update chart
                if (stockCharts[stock.id]) {
                    const history = await supabaseService.getStockPriceHistory(stock.id, 50);
                    
                    // Update chart data with proper sorting
                    let labels = [];
                    let prices = [];
                    
                    if (history.length > 0) {
                        const sortedHistory = [...history].sort((a, b) => 
                            new Date(a.recorded_at) - new Date(b.recorded_at)
                        );
                        labels = sortedHistory.map(h => {
                            const date = new Date(h.recorded_at);
                            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        });
                        prices = sortedHistory.map(h => parseFloat(h.price));
                    }
                    
                    // Add current price
                    const currentPrice = parseFloat(stock.current_price);
                    const now = new Date();
                    const currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    
                    if (prices.length === 0 || Math.abs(prices[prices.length - 1] - currentPrice) > 0.01) {
                        labels.push(currentTime);
                        prices.push(currentPrice);
                    } else {
                        labels[labels.length - 1] = currentTime;
                        prices[prices.length - 1] = currentPrice;
                    }
                    
                    // Keep only last 50 points
                    if (labels.length > 50) {
                        labels = labels.slice(-50);
                        prices = prices.slice(-50);
                    }
                    
                    stockCharts[stock.id].data.labels = labels;
                    stockCharts[stock.id].data.datasets[0].data = prices;
                    
                    // Update color based on change
                    const chartColor = isPositive ? '#10b981' : '#ef4444';
                    stockCharts[stock.id].data.datasets[0].borderColor = chartColor;
                    stockCharts[stock.id].data.datasets[0].backgroundColor = isPositive 
                        ? 'rgba(16, 185, 129, 0.15)' 
                        : 'rgba(239, 68, 68, 0.15)';
                    
                    // Update Y-axis scale
                    const minPrice = Math.min(...prices);
                    const maxPrice = Math.max(...prices);
                    const priceRange = maxPrice - minPrice;
                    const padding = priceRange > 0 ? priceRange * 0.1 : maxPrice * 0.1;
                    stockCharts[stock.id].options.scales.y.min = Math.max(0, minPrice - padding);
                    stockCharts[stock.id].options.scales.y.max = maxPrice + padding;
                    
                    stockCharts[stock.id].update('none'); // Update without animation for smooth updates
                }
            }
            
            // Update stocks array
            stocks = updatedStocks;
            
            // Reload investments to update current values and charts
            await loadInvestments();
            
            // Update investment charts
            const employee = await getCurrentEmployee();
            if (employee) {
                const updatedInvestments = await supabaseService.getEmployeeInvestments(employee.id);
                const activeInvestments = updatedInvestments.filter(inv => inv.status === 'active');
                
                for (const investment of activeInvestments) {
                    if (investmentCharts[investment.id] && investment.stock_market) {
                        const history = await supabaseService.getStockPriceHistory(investment.stock_market.id, 50);
                        const shares = parseFloat(investment.shares);
                        const purchasePrice = parseFloat(investment.purchase_price);
                        const purchaseValue = purchasePrice * shares;
                        
                        const labels = history.length > 0 
                            ? history.map(h => new Date(h.recorded_at).toLocaleTimeString())
                            : [new Date().toLocaleTimeString()];
                        const values = history.length > 0
                            ? history.map(h => parseFloat(h.price) * shares)
                            : [parseFloat(investment.stock_market.current_price) * shares];
                        
                        const currentValue = parseFloat(investment.stock_market.current_price) * shares;
                        if (values.length === 0 || values[values.length - 1] !== currentValue) {
                            labels.push(new Date().toLocaleTimeString());
                            values.push(currentValue);
                        }
                        
                        labels.unshift('Purchase');
                        values.unshift(purchaseValue);
                        
                        // Keep only last 50 points
                        if (labels.length > 51) {
                            labels.shift();
                            values.shift();
                        }
                        
                        const currentProfit = currentValue - purchaseValue;
                        const chartColor = currentProfit >= 0 ? '#10b981' : '#ef4444';
                        
                        investmentCharts[investment.id].data.labels = labels;
                        investmentCharts[investment.id].data.datasets[0].data = values;
                        investmentCharts[investment.id].data.datasets[0].borderColor = chartColor;
                        investmentCharts[investment.id].data.datasets[0].backgroundColor = currentProfit >= 0 
                            ? 'rgba(16, 185, 129, 0.15)' 
                            : 'rgba(239, 68, 68, 0.15)';
                        investmentCharts[investment.id].data.datasets[1].data = values.map(() => purchaseValue);
                        
                        investmentCharts[investment.id].update('none');
                    }
                }
            }
        } catch (error) {
            console.error('Error updating stocks:', error);
        }
    }, 5000);
    
    // DISABLED: Auto-refresh was causing too many API calls
    // Auto-refresh wallet every 5 seconds
    // setInterval(async () => {
    //     await loadWallet();
    // }, 5000);
});


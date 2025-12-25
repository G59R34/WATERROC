// Stock Market Script
document.addEventListener('DOMContentLoaded', async function() {
    let currentEmployee = null;
    let wallet = null;
    let stocks = [];
    let investments = [];
    
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
                <div class="stock-card">
                    <div class="stock-header">
                        <div class="stock-symbol">${stock.symbol}</div>
                        <div class="stock-change ${changeClass}">
                            ${changeSymbol}${changePercent.toFixed(2)}%
                        </div>
                    </div>
                    <div class="stock-price">$${parseFloat(stock.current_price).toFixed(2)}</div>
                    <div class="stock-company">${stock.company_name}</div>
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
                <div class="investment-item">
                    <div>
                        <div style="font-weight: 600; color: var(--text-primary, #1f2937);">
                            ${stock?.symbol || investment.stock_symbol} - ${investment.shares} shares
                        </div>
                        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                            Bought at $${parseFloat(investment.purchase_price).toFixed(2)} • 
                            Current: $${parseFloat(stock?.current_price || 0).toFixed(2)}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div class="investment-profit ${profitClass}">
                            ${profitSymbol}$${Math.abs(profit).toFixed(2)} (${profitSymbol}${profitPercent.toFixed(2)}%)
                        </div>
                        <button class="btn-secondary" 
                                style="margin-top: 8px; padding: 6px 12px; font-size: 12px;"
                                data-investment-id="${investment.id}">
                            Sell
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add sell event listeners
        document.querySelectorAll('[data-investment-id]').forEach(btn => {
            btn.addEventListener('click', async function() {
                const investmentId = parseInt(this.getAttribute('data-investment-id'));
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
        const profit = result.data.current_value - parseFloat(investment.current_value);
        const profitText = profit >= 0 ? `Profit: $${profit.toFixed(2)}` : `Loss: $${Math.abs(profit).toFixed(2)}`;
        
        alert(`✅ Stock sold! ${profitText}`);
        
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
    
    // Auto-refresh stock prices every 30 seconds
    setInterval(async () => {
        await supabaseService.updateStockPrices();
        await loadStocks();
        await loadInvestments();
    }, 30000);
    
    // DISABLED: Auto-refresh was causing too many API calls
    // Auto-refresh wallet every 5 seconds
    // setInterval(async () => {
    //     await loadWallet();
    // }, 5000);
});


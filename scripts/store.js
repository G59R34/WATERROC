// Employee Store Script
document.addEventListener('DOMContentLoaded', async function() {
    let currentEmployee = null;
    let wallet = null;
    
    // Check authentication (only check once, don't redirect repeatedly)
    const userRole = sessionStorage.getItem('userRole');
    if (!userRole || userRole !== 'employee') {
        // Only redirect if we're sure user isn't an employee
        // Add a small delay to prevent rapid redirects
        setTimeout(() => {
            if (sessionStorage.getItem('userRole') !== 'employee') {
                window.location.href = 'index.html';
            }
        }, 100);
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
        if (!employee) {
            // Don't show alert on every load - just return silently
            return;
        }
        
        // Don't show loading screen on wallet load to prevent constant reloads
        // if (typeof showDataLoadingScreen !== 'undefined') {
        //     showDataLoadingScreen('wallet data');
        // }
        
        try {
            wallet = await supabaseService.getEmployeeWallet(employee.id);
            
            if (!wallet) {
                // Initialize wallet if it doesn't exist
                wallet = {
                    balance: 0,
                    total_earned: 0,
                    total_spent: 0
                };
            }
            
            updateWalletDisplay();
        } catch (error) {
            // Silently handle errors - don't cause reloads
            console.warn('Error loading wallet:', error);
            // Set default wallet values
            wallet = {
                balance: 0,
                total_earned: 0,
                total_spent: 0
            };
            updateWalletDisplay();
        }
    }
    
    // Update wallet display
    function updateWalletDisplay() {
        document.getElementById('walletBalance').textContent = 
            `$${parseFloat(wallet.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('totalEarned').textContent = 
            `$${parseFloat(wallet.total_earned || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('totalSpent').textContent = 
            `$${parseFloat(wallet.total_spent || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    // Load store items
    async function loadStoreItems() {
        const grid = document.getElementById('storeItemsGrid');
        if (!grid) return;
        
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('store items');
        }
        
        const items = await supabaseService.getStoreItems();
        
        if (items.length === 0) {
            grid.innerHTML = '<div style="text-align: center; padding: 40px; color: #64748b;">No items available</div>';
            return;
        }
        
        grid.innerHTML = items.map(item => {
            const canAfford = wallet && parseFloat(wallet.balance) >= parseFloat(item.price);
            const inStock = item.stock === -1 || item.stock > 0;
            const stockText = item.stock === -1 ? 'Unlimited' : `${item.stock} in stock`;
            
            return `
                <div class="store-item-card">
                    <div class="item-category">${item.category}</div>
                    <div class="item-name">${item.name}</div>
                    <div class="item-description">${item.description || 'No description'}</div>
                    <div class="item-price">$${parseFloat(item.price).toFixed(2)}</div>
                    <div class="item-stock">${stockText}</div>
                    <button class="purchase-btn" 
                            data-item-id="${item.id}" 
                            data-item-price="${item.price}"
                            ${!canAfford || !inStock ? 'disabled' : ''}
                            ${!canAfford ? 'title="Insufficient funds"' : ''}
                            ${!inStock ? 'title="Out of stock"' : ''}>
                        ${!canAfford ? '💰 Insufficient Funds' : !inStock ? '❌ Out of Stock' : '🛒 Purchase'}
                    </button>
                </div>
            `;
        }).join('');
        
        // Add event listeners
        document.querySelectorAll('.purchase-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const itemId = parseInt(this.getAttribute('data-item-id'));
                await purchaseItem(itemId);
            });
        });
    }
    
    // Purchase item
    async function purchaseItem(itemId) {
        const employee = await getCurrentEmployee();
        if (!employee) {
            alert('Error: Employee not found');
            return;
        }
        
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('processing purchase');
        }
        
        const result = await supabaseService.purchaseStoreItem(employee.id, itemId, 1);
        
        if (result.error) {
            alert(`❌ Purchase failed: ${result.error}`);
            return;
        }
        
        alert(`✅ Purchase successful! You bought: ${result.data.store_items?.name || 'Item'}`);
        
        // Reload wallet and items
        await loadWallet();
        await loadStoreItems();
        await loadPurchaseHistory();
    }
    
    // Load purchase history
    async function loadPurchaseHistory() {
        const employee = await getCurrentEmployee();
        if (!employee) return;
        
        const history = document.getElementById('purchaseHistory');
        if (!history) return;
        
        const purchases = await supabaseService.getEmployeePurchases(employee.id, 20);
        
        if (purchases.length === 0) {
            history.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No purchases yet</div>';
            return;
        }
        
        history.innerHTML = purchases.map(purchase => {
            const item = purchase.store_items;
            const date = new Date(purchase.purchased_at).toLocaleDateString();
            
            return `
                <div class="purchase-item">
                    <div>
                        <div style="font-weight: 600; color: var(--text-primary, #1f2937);">${item?.name || 'Unknown Item'}</div>
                        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${date} • ${purchase.quantity}x</div>
                    </div>
                    <div style="font-weight: 600; color: #3b82f6;">
                        $${parseFloat(purchase.total_price).toFixed(2)}
                    </div>
                </div>
            `;
        }).join('');
    }
    
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
    await loadStoreItems();
    await loadPurchaseHistory();
    
    // DISABLED: Auto-refresh was causing too many API calls
    // Auto-refresh wallet every 5 seconds
    // setInterval(async () => {
    //     await loadWallet();
    // }, 5000);
});


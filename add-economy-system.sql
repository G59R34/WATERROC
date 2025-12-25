-- Economy, Store, Stock Market, Debt, and Email System
-- ====================================================
-- Run this in Supabase SQL Editor to add the full economy system

-- ==========================================
-- EMPLOYEE WALLET/BALANCE
-- ==========================================
CREATE TABLE IF NOT EXISTS employee_wallets (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    balance DECIMAL(12, 2) DEFAULT 0.00,
    total_earned DECIMAL(12, 2) DEFAULT 0.00,
    total_spent DECIMAL(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_wallets_employee_id ON employee_wallets(employee_id);

-- ==========================================
-- STORE ITEMS
-- ==========================================
CREATE TABLE IF NOT EXISTS store_items (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL, -- 'benefits', 'perks', 'time-off', 'luxury', etc.
    price DECIMAL(10, 2) NOT NULL,
    stock INTEGER DEFAULT -1, -- -1 means unlimited
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default store items
INSERT INTO store_items (name, description, category, price, stock) VALUES
('Boss''s Love', 'Increase your favor with the boss. Makes them more likely to approve your requests.', 'benefits', 50.00, -1),
('Cookies', 'A delicious box of cookies delivered to your desk. Improves mood.', 'perks', 5.00, -1),
('PTO Day', 'Purchase an extra paid time off day.', 'time-off', 100.00, -1),
('Sick Leave Day', 'Purchase an extra sick leave day.', 'time-off', 75.00, -1),
('Vacation Package', 'A week-long vacation package. Includes 5 PTO days.', 'time-off', 400.00, -1),
('Coffee Subscription', 'Monthly premium coffee subscription.', 'perks', 25.00, -1),
('Parking Spot', 'Reserved parking spot for a month.', 'perks', 150.00, -1),
('Office Upgrade', 'Upgrade your office space for a month.', 'luxury', 300.00, -1),
('Lunch Voucher', 'Premium lunch voucher for a week.', 'perks', 50.00, -1),
('Gym Membership', 'Company gym membership for a month.', 'perks', 80.00, -1)
ON CONFLICT DO NOTHING;

-- ==========================================
-- PURCHASES
-- ==========================================
CREATE TABLE IF NOT EXISTS purchases (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    item_id BIGINT NOT NULL REFERENCES store_items(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    total_price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'cancelled', 'refunded'
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_purchases_employee_id ON purchases(employee_id);
CREATE INDEX IF NOT EXISTS idx_purchases_item_id ON purchases(item_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchased_at ON purchases(purchased_at);

-- ==========================================
-- STOCK MARKET
-- ==========================================
CREATE TABLE IF NOT EXISTS stock_market (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL UNIQUE,
    company_name VARCHAR(255) NOT NULL,
    current_price DECIMAL(10, 2) NOT NULL,
    previous_price DECIMAL(10, 2),
    change_percent DECIMAL(5, 2) DEFAULT 0.00,
    volatility DECIMAL(5, 2) DEFAULT 5.00, -- How much the price can change
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Insert some fake stocks
INSERT INTO stock_market (symbol, company_name, current_price, previous_price, change_percent, volatility) VALUES
('WTRC', 'WaterROC Corp', 100.00, 100.00, 0.00, 10.00),
('COOK', 'Cookie Industries', 50.00, 50.00, 0.00, 15.00),
('BOSS', 'Boss Love Inc', 75.00, 75.00, 0.00, 20.00),
('VACA', 'Vacation Co', 200.00, 200.00, 0.00, 25.00),
('PTO', 'Time Off Solutions', 150.00, 150.00, 0.00, 12.00),
('LUX', 'Luxury Goods', 300.00, 300.00, 0.00, 30.00)
ON CONFLICT (symbol) DO NOTHING;

-- ==========================================
-- STOCK INVESTMENTS
-- ==========================================
CREATE TABLE IF NOT EXISTS stock_investments (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    stock_symbol VARCHAR(10) NOT NULL REFERENCES stock_market(symbol) ON DELETE CASCADE,
    shares DECIMAL(10, 4) NOT NULL,
    purchase_price DECIMAL(10, 2) NOT NULL,
    current_value DECIMAL(12, 2) NOT NULL,
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    sold_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'active' -- 'active', 'sold', 'lost'
);

CREATE INDEX IF NOT EXISTS idx_stock_investments_employee_id ON stock_investments(employee_id);
CREATE INDEX IF NOT EXISTS idx_stock_investments_stock_symbol ON stock_investments(stock_symbol);
CREATE INDEX IF NOT EXISTS idx_stock_investments_status ON stock_investments(status);

-- ==========================================
-- COMPANY DEBT
-- ==========================================
CREATE TABLE IF NOT EXISTS company_debt (
    id BIGSERIAL PRIMARY KEY,
    debt_name VARCHAR(255) NOT NULL,
    principal DECIMAL(12, 2) NOT NULL,
    interest_rate DECIMAL(5, 2) NOT NULL,
    monthly_payment DECIMAL(12, 2) NOT NULL,
    remaining_balance DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    next_payment_date DATE,
    status VARCHAR(50) DEFAULT 'active' -- 'active', 'paid', 'defaulted'
);

-- ==========================================
-- DEBT PAYMENTS
-- ==========================================
CREATE TABLE IF NOT EXISTS debt_payments (
    id BIGSERIAL PRIMARY KEY,
    debt_id BIGINT NOT NULL REFERENCES company_debt(id) ON DELETE CASCADE,
    payment_amount DECIMAL(12, 2) NOT NULL,
    payment_date DATE NOT NULL,
    principal_paid DECIMAL(12, 2) NOT NULL,
    interest_paid DECIMAL(12, 2) NOT NULL,
    remaining_balance DECIMAL(12, 2) NOT NULL,
    paid_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id ON debt_payments(debt_id);

-- ==========================================
-- VARIABLE PAY RATES
-- ==========================================
CREATE TABLE IF NOT EXISTS employee_pay_rates (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    hourly_rate DECIMAL(10, 2) NOT NULL,
    effective_date DATE NOT NULL,
    rate_type VARCHAR(50) DEFAULT 'standard', -- 'standard', 'random', 'custom', 'performance'
    set_by UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_pay_rates_employee_id ON employee_pay_rates(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_pay_rates_effective_date ON employee_pay_rates(effective_date);

-- ==========================================
-- EMAIL SYSTEM
-- ==========================================
CREATE TABLE IF NOT EXISTS emails (
    id BIGSERIAL PRIMARY KEY,
    from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    subject VARCHAR(500),
    body TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_emails_from_user_id ON emails(from_user_id);
CREATE INDEX IF NOT EXISTS idx_emails_to_user_id ON emails(to_user_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_at ON emails(sent_at);
CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read);

-- ==========================================
-- EMAIL ATTACHMENTS
-- ==========================================
CREATE TABLE IF NOT EXISTS email_attachments (
    id BIGSERIAL PRIMARY KEY,
    email_id BIGINT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_email_id ON email_attachments(email_id);

-- ==========================================
-- TRANSACTIONS (for economy tracking)
-- ==========================================
CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'payroll', 'purchase', 'stock_buy', 'stock_sell', 'stock_loss', 'debt_payment'
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    balance_after DECIMAL(12, 2),
    related_id BIGINT, -- ID of related record (purchase_id, investment_id, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_employee_id ON transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Employee Wallets
ALTER TABLE employee_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees can view own wallet"
    ON employee_wallets FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_wallets.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage all wallets"
    ON employee_wallets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Store Items
ALTER TABLE store_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view active store items"
    ON store_items FOR SELECT
    USING (is_active = TRUE);

CREATE POLICY "Admins can manage store items"
    ON store_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Purchases
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees can view own purchases"
    ON purchases FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = purchases.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Employees can create purchases"
    ON purchases FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = purchases.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage all purchases"
    ON purchases FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Stock Market
ALTER TABLE stock_market ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view stock market"
    ON stock_market FOR SELECT
    USING (TRUE);

CREATE POLICY "Admins can manage stock market"
    ON stock_market FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Stock Investments
ALTER TABLE stock_investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees can view own investments"
    ON stock_investments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = stock_investments.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Employees can create investments"
    ON stock_investments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = stock_investments.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage all investments"
    ON stock_investments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Company Debt
ALTER TABLE company_debt ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and accountants can view debt"
    ON company_debt FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND (users.is_admin = TRUE OR users.role = 'accountant')
        )
    );

CREATE POLICY "Admins and accountants can manage debt"
    ON company_debt FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND (users.is_admin = TRUE OR users.role = 'accountant')
        )
    );

-- Employee Pay Rates
ALTER TABLE employee_pay_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees can view own pay rates"
    ON employee_pay_rates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_pay_rates.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage pay rates"
    ON employee_pay_rates FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Emails
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own emails"
    ON emails FOR SELECT
    USING (
        from_user_id = auth.uid() OR to_user_id = auth.uid()
    );

CREATE POLICY "Users can send emails"
    ON emails FOR INSERT
    WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "Users can update own emails"
    ON emails FOR UPDATE
    USING (to_user_id = auth.uid() OR from_user_id = auth.uid())
    WITH CHECK (to_user_id = auth.uid() OR from_user_id = auth.uid());

-- Transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees can view own transactions"
    ON transactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = transactions.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Admins can view all transactions"
    ON transactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- ==========================================
-- FUNCTIONS
-- ==========================================

-- Function to update wallet balance
CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE employee_wallets
    SET updated_at = NOW()
    WHERE employee_id = NEW.employee_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for wallet updates
CREATE TRIGGER update_wallet_updated_at
    AFTER UPDATE ON employee_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_balance();

-- Function to initialize wallet for new employees
CREATE OR REPLACE FUNCTION initialize_employee_wallet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO employee_wallets (employee_id, balance)
    VALUES (NEW.id, 0.00)
    ON CONFLICT (employee_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create wallet when employee is created
CREATE TRIGGER create_employee_wallet
    AFTER INSERT ON employees
    FOR EACH ROW
    EXECUTE FUNCTION initialize_employee_wallet();

-- Function to update stock prices (for random fluctuations)
CREATE OR REPLACE FUNCTION update_stock_prices()
RETURNS void AS $$
DECLARE
    stock_record RECORD;
    new_price DECIMAL(10, 2);
    change_pct DECIMAL(5, 2);
BEGIN
    FOR stock_record IN SELECT * FROM stock_market LOOP
        -- Calculate random price change based on volatility
        change_pct := (RANDOM() * stock_record.volatility * 2 - stock_record.volatility);
        new_price := stock_record.current_price * (1 + change_pct / 100);
        
        -- Ensure price doesn't go below 0.01
        IF new_price < 0.01 THEN
            new_price := 0.01;
        END IF;
        
        -- Update stock
        UPDATE stock_market
        SET 
            previous_price = current_price,
            current_price = new_price,
            change_percent = change_pct,
            last_updated = NOW()
        WHERE id = stock_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


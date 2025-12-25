-- Add SMP (Stock Market Plan) and 401k System
-- ============================================
-- Run this in Supabase SQL Editor to enable SMP and 401k features

-- ==========================================
-- STOCK MARKET PLAN (SMP)
-- ==========================================
CREATE TABLE IF NOT EXISTS smp_enrollments (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    contribution_percent DECIMAL(5, 2) NOT NULL DEFAULT 5.00, -- Percentage of paycheck
    stock_symbol VARCHAR(10) NOT NULL DEFAULT 'WTRC', -- Stock to purchase
    max_contribution DECIMAL(10, 2), -- Optional max contribution per pay period
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'cancelled'
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smp_enrollments_employee_id ON smp_enrollments(employee_id);
CREATE INDEX IF NOT EXISTS idx_smp_enrollments_status ON smp_enrollments(status);

-- ==========================================
-- 401K PLAN
-- ==========================================
CREATE TABLE IF NOT EXISTS employee_401k (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    contribution_percent DECIMAL(5, 2) NOT NULL DEFAULT 3.00, -- Percentage of paycheck
    employer_match_percent DECIMAL(5, 2) DEFAULT 50.00, -- Company match percentage
    max_contribution DECIMAL(10, 2), -- Annual contribution limit
    current_balance DECIMAL(12, 2) DEFAULT 0.00,
    total_contributed DECIMAL(12, 2) DEFAULT 0.00,
    total_employer_match DECIMAL(12, 2) DEFAULT 0.00,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'cancelled'
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_401k_employee_id ON employee_401k(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_401k_status ON employee_401k(status);

-- 401k Contributions History
CREATE TABLE IF NOT EXISTS employee_401k_contributions (
    id BIGSERIAL PRIMARY KEY,
    employee_401k_id BIGINT NOT NULL REFERENCES employee_401k(id) ON DELETE CASCADE,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    employee_contribution DECIMAL(10, 2) NOT NULL,
    employer_match DECIMAL(10, 2) NOT NULL,
    total_contribution DECIMAL(10, 2) NOT NULL,
    balance_after DECIMAL(12, 2) NOT NULL,
    contributed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_401k_contributions_401k_id ON employee_401k_contributions(employee_401k_id);
CREATE INDEX IF NOT EXISTS idx_401k_contributions_period ON employee_401k_contributions(pay_period_start, pay_period_end);

-- SMP Contributions History
CREATE TABLE IF NOT EXISTS smp_contributions (
    id BIGSERIAL PRIMARY KEY,
    smp_enrollment_id BIGINT NOT NULL REFERENCES smp_enrollments(id) ON DELETE CASCADE,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    contribution_amount DECIMAL(10, 2) NOT NULL,
    stock_symbol VARCHAR(10) NOT NULL,
    shares_purchased DECIMAL(10, 4) NOT NULL,
    purchase_price DECIMAL(10, 2) NOT NULL,
    contributed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smp_contributions_enrollment_id ON smp_contributions(smp_enrollment_id);
CREATE INDEX IF NOT EXISTS idx_smp_contributions_period ON smp_contributions(pay_period_start, pay_period_end);

-- ==========================================
-- ADMIN STOCK MANAGEMENT
-- ==========================================
-- Add admin function to create new stocks
CREATE OR REPLACE FUNCTION create_stock(
    p_symbol VARCHAR(10),
    p_company_name VARCHAR(255),
    p_initial_price DECIMAL(10, 2),
    p_volatility DECIMAL(5, 2) DEFAULT 10.00
)
RETURNS BIGINT AS $$
DECLARE
    new_stock_id BIGINT;
BEGIN
    INSERT INTO stock_market (symbol, company_name, current_price, previous_price, change_percent, volatility, last_updated)
    VALUES (p_symbol, p_company_name, p_initial_price, p_initial_price, 0.00, p_volatility, NOW())
    RETURNING id INTO new_stock_id;
    
    -- Create initial price history entry
    INSERT INTO stock_price_history (stock_id, price, recorded_at)
    VALUES (new_stock_id, p_initial_price, NOW());
    
    RETURN new_stock_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_stock(VARCHAR, VARCHAR, DECIMAL, DECIMAL) TO authenticated;

-- ==========================================
-- RLS POLICIES
-- ==========================================

-- SMP Enrollments
ALTER TABLE smp_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own SMP enrollment"
    ON smp_enrollments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = smp_enrollments.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Employees can manage own SMP enrollment"
    ON smp_enrollments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = smp_enrollments.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Admins can view all SMP enrollments"
    ON smp_enrollments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- 401k
ALTER TABLE employee_401k ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own 401k"
    ON employee_401k FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_401k.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Employees can manage own 401k"
    ON employee_401k FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_401k.employee_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Admins and Accountants can view all 401k"
    ON employee_401k FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND (users.is_admin = TRUE OR users.role = 'accountant')
        )
    );

-- 401k Contributions
ALTER TABLE employee_401k_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own 401k contributions"
    ON employee_401k_contributions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employee_401k e401k
            JOIN employees e ON e401k.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            WHERE e401k.id = employee_401k_contributions.employee_401k_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Accountants can insert 401k contributions"
    ON employee_401k_contributions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND (users.is_admin = TRUE OR users.role = 'accountant')
        )
    );

-- SMP Contributions
ALTER TABLE smp_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own SMP contributions"
    ON smp_contributions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM smp_enrollments smp
            JOIN employees e ON smp.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            WHERE smp.id = smp_contributions.smp_enrollment_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Accountants can insert SMP contributions"
    ON smp_contributions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND (users.is_admin = TRUE OR users.role = 'accountant')
        )
    );

-- ==========================================
-- TRIGGERS
-- ==========================================

-- Update timestamps
CREATE OR REPLACE FUNCTION update_smp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER smp_enrollments_updated_at
    BEFORE UPDATE ON smp_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION update_smp_updated_at();

CREATE OR REPLACE FUNCTION update_401k_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER employee_401k_updated_at
    BEFORE UPDATE ON employee_401k
    FOR EACH ROW
    EXECUTE FUNCTION update_401k_updated_at();


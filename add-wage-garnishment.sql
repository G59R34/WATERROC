-- Wage Garnishment System
-- =======================
-- Run this in Supabase SQL Editor to enable wage garnishment features

-- ==========================================
-- WAGE GARNISHMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS wage_garnishments (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    amount_type VARCHAR(20) DEFAULT 'fixed', -- 'fixed' or 'percent'
    percent_of_pay DECIMAL(5, 2), -- If amount_type is 'percent'
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'cancelled'
    start_date DATE NOT NULL,
    end_date DATE, -- NULL for indefinite
    total_garnished DECIMAL(12, 2) DEFAULT 0.00,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wage_garnishments_employee_id ON wage_garnishments(employee_id);
CREATE INDEX IF NOT EXISTS idx_wage_garnishments_status ON wage_garnishments(status);
CREATE INDEX IF NOT EXISTS idx_wage_garnishments_dates ON wage_garnishments(start_date, end_date);

-- Garnishment History (tracks each deduction)
CREATE TABLE IF NOT EXISTS garnishment_history (
    id BIGSERIAL PRIMARY KEY,
    garnishment_id BIGINT NOT NULL REFERENCES wage_garnishments(id) ON DELETE CASCADE,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    amount_garnished DECIMAL(10, 2) NOT NULL,
    employee_gross_pay DECIMAL(10, 2) NOT NULL,
    employee_net_pay DECIMAL(10, 2) NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garnishment_history_garnishment_id ON garnishment_history(garnishment_id);
CREATE INDEX IF NOT EXISTS idx_garnishment_history_period ON garnishment_history(pay_period_start, pay_period_end);

-- ==========================================
-- RLS POLICIES
-- ==========================================

ALTER TABLE wage_garnishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE garnishment_history ENABLE ROW LEVEL SECURITY;

-- Admins can manage all garnishments
CREATE POLICY "Admins can manage all garnishments"
    ON wage_garnishments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Accountants can view garnishments
CREATE POLICY "Accountants can view garnishments"
    ON wage_garnishments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND (users.is_admin = TRUE OR users.role = 'accountant')
        )
    );

-- Employees can view their own garnishments
CREATE POLICY "Employees can view own garnishments"
    ON wage_garnishments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = wage_garnishments.employee_id
            AND u.auth_id = auth.uid()
        )
    );

-- Admins and accountants can view garnishment history
CREATE POLICY "Admins and accountants can view garnishment history"
    ON garnishment_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND (users.is_admin = TRUE OR users.role = 'accountant')
        )
    );

-- Employees can view their own garnishment history
CREATE POLICY "Employees can view own garnishment history"
    ON garnishment_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM wage_garnishments wg
            JOIN employees e ON wg.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            WHERE wg.id = garnishment_history.garnishment_id
            AND u.auth_id = auth.uid()
        )
    );

-- Admins can insert garnishment history (for payroll processing)
CREATE POLICY "Admins can insert garnishment history"
    ON garnishment_history FOR INSERT
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

CREATE OR REPLACE FUNCTION update_garnishment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wage_garnishments_updated_at
    BEFORE UPDATE ON wage_garnishments
    FOR EACH ROW
    EXECUTE FUNCTION update_garnishment_updated_at();


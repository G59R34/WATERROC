-- Payroll System Tables
-- =====================
-- Run this in Supabase SQL Editor to add payroll functionality

-- ==========================================
-- PAYROLL HOURS TABLE
-- ==========================================
-- Stores hours worked per employee per pay period (set by admin)

CREATE TABLE IF NOT EXISTS payroll_hours (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    hours DECIMAL(10, 2) NOT NULL DEFAULT 0,
    hourly_rate DECIMAL(10, 2), -- Optional: override default rate
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one entry per employee per pay period
    UNIQUE(employee_id, pay_period_start, pay_period_end)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_payroll_hours_employee_id ON payroll_hours(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_hours_period ON payroll_hours(pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_hours_created_at ON payroll_hours(created_at);

-- ==========================================
-- ACCOUNTANT ACCESS TABLE
-- ==========================================
-- Controls which employees the accountant can see/process payroll for

CREATE TABLE IF NOT EXISTS accountant_access (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT TRUE,
    can_process BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One entry per employee
    UNIQUE(employee_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_accountant_access_employee_id ON accountant_access(employee_id);
CREATE INDEX IF NOT EXISTS idx_accountant_access_can_view ON accountant_access(can_view);

-- ==========================================
-- PAYROLL PROCESSING HISTORY
-- ==========================================
-- Tracks when payroll was processed and by whom

CREATE TABLE IF NOT EXISTS payroll_history (
    id BIGSERIAL PRIMARY KEY,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    pay_date DATE NOT NULL,
    employee_count INTEGER NOT NULL,
    total_gross DECIMAL(12, 2) NOT NULL,
    total_taxes DECIMAL(12, 2) NOT NULL,
    total_deductions DECIMAL(12, 2) NOT NULL,
    total_net DECIMAL(12, 2) NOT NULL,
    processed_by UUID REFERENCES auth.users(id),
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Store full payroll details as JSON
    payroll_details JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payroll_history_period ON payroll_history(pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_history_created_at ON payroll_history(created_at);

-- ==========================================
-- PAYROLL EMAIL LOG
-- ==========================================
-- Tracks payroll emails sent to employees

CREATE TABLE IF NOT EXISTS payroll_emails (
    id BIGSERIAL PRIMARY KEY,
    payroll_history_id BIGINT REFERENCES payroll_history(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_email VARCHAR(255),
    email_subject TEXT,
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payroll_emails_history ON payroll_emails(payroll_history_id);
CREATE INDEX IF NOT EXISTS idx_payroll_emails_employee ON payroll_emails(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_emails_sent ON payroll_emails(email_sent);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS
ALTER TABLE payroll_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE accountant_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_emails ENABLE ROW LEVEL SECURITY;

-- Payroll Hours Policies
-- Admins can do everything
CREATE POLICY "Admins can manage payroll hours"
    ON payroll_hours FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Accountants can view payroll hours for employees they have access to
CREATE POLICY "Accountants can view payroll hours"
    ON payroll_hours FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM accountant_access
            WHERE accountant_access.employee_id = payroll_hours.employee_id
            AND accountant_access.can_view = TRUE
        )
    );

-- Accountant Access Policies
-- Admins can manage accountant access
CREATE POLICY "Admins can manage accountant access"
    ON accountant_access FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Accountants can view their own access settings
CREATE POLICY "Accountants can view access"
    ON accountant_access FOR SELECT
    USING (TRUE); -- Accountants can see which employees they have access to

-- Payroll History Policies
-- Admins can view all payroll history
CREATE POLICY "Admins can view payroll history"
    ON payroll_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Accountants can view payroll history
-- Note: This policy allows authenticated users to view payroll history.
-- For stricter access control in production, you would:
-- 1. Add an 'is_accountant' boolean field to the users table
-- 2. Check: EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.is_accountant = TRUE)
-- For now, this allows any authenticated user (you can restrict this further as needed)
CREATE POLICY "Accountants can view relevant payroll history"
    ON payroll_history FOR SELECT
    USING (
        -- Allow authenticated users to view (you can add role check here)
        auth.uid() IS NOT NULL
    );

-- Payroll Emails Policies
-- Admins can view all payroll emails
CREATE POLICY "Admins can view payroll emails"
    ON payroll_emails FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Accountants can view emails for employees they have access to
CREATE POLICY "Accountants can view relevant payroll emails"
    ON payroll_emails FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM accountant_access
            WHERE accountant_access.employee_id = payroll_emails.employee_id
            AND accountant_access.can_view = TRUE
        )
    );

-- ==========================================
-- FUNCTIONS
-- ==========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payroll_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_payroll_hours_updated_at
    BEFORE UPDATE ON payroll_hours
    FOR EACH ROW
    EXECUTE FUNCTION update_payroll_updated_at();

CREATE TRIGGER update_accountant_access_updated_at
    BEFORE UPDATE ON accountant_access
    FOR EACH ROW
    EXECUTE FUNCTION update_payroll_updated_at();

-- ==========================================
-- INITIAL DATA (Optional)
-- ==========================================
-- Grant accountant access to all existing employees by default
-- (Admin can modify this later)

INSERT INTO accountant_access (employee_id, can_view, can_process)
SELECT id, TRUE, TRUE
FROM employees
WHERE NOT EXISTS (
    SELECT 1 FROM accountant_access WHERE accountant_access.employee_id = employees.id
)
ON CONFLICT (employee_id) DO NOTHING;


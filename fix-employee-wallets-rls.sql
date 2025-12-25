-- Fix RLS Policies for Employee Wallets
-- =====================================
-- Run this in Supabase SQL Editor to fix the 406 errors

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Employees can view own wallet" ON employee_wallets;
DROP POLICY IF EXISTS "Admins can manage all wallets" ON employee_wallets;

-- Employees can view their own wallet
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

-- Employees can insert their own wallet (when it's created)
CREATE POLICY "Employees can insert own wallet"
    ON employee_wallets FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_wallets.employee_id
            AND u.auth_id = auth.uid()
        )
    );

-- Employees can update their own wallet (when balance changes)
CREATE POLICY "Employees can update own wallet"
    ON employee_wallets FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_wallets.employee_id
            AND u.auth_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_wallets.employee_id
            AND u.auth_id = auth.uid()
        )
    );

-- Admins can do everything with all wallets
CREATE POLICY "Admins can manage all wallets"
    ON employee_wallets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Accountants can view and update wallets (for payroll processing)
CREATE POLICY "Accountants can manage wallets"
    ON employee_wallets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND (users.is_admin = TRUE OR users.role = 'accountant')
        )
    );


-- Fix RLS Policies for Transactions Table
-- =======================================
-- Run this in Supabase SQL Editor to fix the 403 errors for transactions

-- Drop existing policies
DROP POLICY IF EXISTS "Employees can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;

-- Employees can view their own transactions
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

-- Employees can insert their own transactions (when wallet is updated)
CREATE POLICY "Employees can insert own transactions"
    ON transactions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = transactions.employee_id
            AND u.auth_id = auth.uid()
        )
    );

-- Admins can view all transactions
CREATE POLICY "Admins can view all transactions"
    ON transactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Accountants can insert transactions (for payroll processing)
CREATE POLICY "Accountants can insert transactions"
    ON transactions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND (users.is_admin = TRUE OR users.role = 'accountant')
        )
    );






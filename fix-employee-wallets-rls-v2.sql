-- Fix RLS Policies for Employee Wallets (Simplified Version)
-- ===========================================================
-- Run this in Supabase SQL Editor to fix the 406 errors

-- First, drop ALL existing policies on employee_wallets
DROP POLICY IF EXISTS "Employees can view own wallet" ON employee_wallets;
DROP POLICY IF EXISTS "Employees can insert own wallet" ON employee_wallets;
DROP POLICY IF EXISTS "Employees can update own wallet" ON employee_wallets;
DROP POLICY IF EXISTS "Admins can manage all wallets" ON employee_wallets;
DROP POLICY IF EXISTS "Accountants can manage wallets" ON employee_wallets;

-- Allow authenticated users to view wallets for employees they are associated with
CREATE POLICY "Employees can view own wallet"
    ON employee_wallets FOR SELECT
    USING (
        -- Check if user is authenticated
        auth.uid() IS NOT NULL
        AND
        -- Check if the wallet belongs to an employee associated with this user
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_wallets.employee_id
            AND u.auth_id = auth.uid()
        )
    );

-- Allow authenticated users to insert wallets for employees they are associated with
CREATE POLICY "Employees can insert own wallet"
    ON employee_wallets FOR INSERT
    WITH CHECK (
        -- Check if user is authenticated
        auth.uid() IS NOT NULL
        AND
        -- Check if the wallet belongs to an employee associated with this user
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_wallets.employee_id
            AND u.auth_id = auth.uid()
        )
    );

-- Allow authenticated users to update wallets for employees they are associated with
CREATE POLICY "Employees can update own wallet"
    ON employee_wallets FOR UPDATE
    USING (
        -- Check if user is authenticated
        auth.uid() IS NOT NULL
        AND
        -- Check if the wallet belongs to an employee associated with this user
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_wallets.employee_id
            AND u.auth_id = auth.uid()
        )
    )
    WITH CHECK (
        -- Check if user is authenticated
        auth.uid() IS NOT NULL
        AND
        -- Check if the wallet belongs to an employee associated with this user
        EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = employee_wallets.employee_id
            AND u.auth_id = auth.uid()
        )
    );

-- Admins can do everything
CREATE POLICY "Admins can manage all wallets"
    ON employee_wallets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Accountants can view and update all wallets (for payroll processing)
CREATE POLICY "Accountants can manage wallets"
    ON employee_wallets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND (users.is_admin = TRUE OR users.role = 'accountant')
        )
    );

-- Also, let's make sure the table allows service role access if needed
-- (This is a fallback - service role bypasses RLS)
-- Note: Service role should only be used server-side, not in client code


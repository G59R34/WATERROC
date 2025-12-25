-- Fix RLS Policies for Payroll History
-- =====================================
-- Run this in Supabase SQL Editor to fix the RLS policy issue

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view payroll history" ON payroll_history;
DROP POLICY IF EXISTS "Accountants can view relevant payroll history" ON payroll_history;

-- Admins can do everything with payroll history
CREATE POLICY "Admins can manage payroll history"
    ON payroll_history FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );

-- Accountants can insert payroll history (when processing payroll)
CREATE POLICY "Accountants can insert payroll history"
    ON payroll_history FOR INSERT
    WITH CHECK (
        -- Allow authenticated users to insert (accountants need this to save payroll)
        auth.uid() IS NOT NULL
    );

-- Accountants can view payroll history
CREATE POLICY "Accountants can view relevant payroll history"
    ON payroll_history FOR SELECT
    USING (
        -- Allow authenticated users to view
        auth.uid() IS NOT NULL
    );

-- Accountants can update payroll history (for email status updates)
CREATE POLICY "Accountants can update payroll history"
    ON payroll_history FOR UPDATE
    USING (
        -- Allow authenticated users to update
        auth.uid() IS NOT NULL
    )
    WITH CHECK (
        -- Allow authenticated users to update
        auth.uid() IS NOT NULL
    );


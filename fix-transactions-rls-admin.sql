-- Fix Transactions RLS for Admins
-- ================================
-- Run this in Supabase SQL Editor to allow admins to insert transactions

-- Admins can insert transactions (for wallet deductions)
CREATE POLICY IF NOT EXISTS "Admins can insert transactions"
    ON transactions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );


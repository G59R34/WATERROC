-- Fix Wallet Trigger to Prevent Stack Depth Limit Exceeded
-- =========================================================
-- Run this in Supabase SQL Editor to fix the infinite recursion issue

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS update_wallet_updated_at ON employee_wallets;

-- Drop the old function
DROP FUNCTION IF EXISTS update_wallet_balance();

-- Create a new function that uses BEFORE trigger (no recursion)
CREATE OR REPLACE FUNCTION update_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Use BEFORE trigger to set updated_at without causing recursion
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger as BEFORE UPDATE (prevents infinite recursion)
CREATE TRIGGER update_wallet_updated_at
    BEFORE UPDATE ON employee_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_updated_at();


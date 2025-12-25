-- Fix RLS Policies for stock_price_history
-- ==========================================
-- Run this in Supabase SQL Editor to allow inserts into stock_price_history

-- Add INSERT policy for stock_price_history (for triggers and initial data)
CREATE POLICY "Allow inserts for stock price history"
    ON stock_price_history FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Also allow the trigger to insert (if needed, though triggers run with definer rights)
-- The above policy should be sufficient for authenticated users



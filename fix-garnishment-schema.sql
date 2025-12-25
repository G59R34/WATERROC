-- Fix Wage Garnishment Schema
-- =============================
-- Run this in Supabase SQL Editor to fix the null constraint issue

-- Make amount nullable (since percent type doesn't use it)
ALTER TABLE wage_garnishments 
ALTER COLUMN amount DROP NOT NULL;

-- Also ensure percent_of_pay can be null (for fixed type)
ALTER TABLE wage_garnishments 
ALTER COLUMN percent_of_pay DROP NOT NULL;

-- Add a check constraint to ensure at least one is set
ALTER TABLE wage_garnishments
DROP CONSTRAINT IF EXISTS wage_garnishments_amount_check;

ALTER TABLE wage_garnishments
ADD CONSTRAINT wage_garnishments_amount_check 
CHECK (
    (amount_type = 'fixed' AND amount IS NOT NULL) OR
    (amount_type = 'percent' AND percent_of_pay IS NOT NULL)
);


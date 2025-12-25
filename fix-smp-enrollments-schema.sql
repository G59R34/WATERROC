-- Fix SMP Enrollments Schema - Add Missing stock_symbol Column
-- ==============================================================
-- Run this in Supabase SQL Editor to fix the missing stock_symbol column

-- Check if column exists, if not add it
DO $$
BEGIN
    -- Check if stock_symbol column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'smp_enrollments' 
        AND column_name = 'stock_symbol'
    ) THEN
        -- Add the stock_symbol column
        ALTER TABLE smp_enrollments 
        ADD COLUMN stock_symbol VARCHAR(10) NOT NULL DEFAULT 'WTRC';
        
        -- Add comment
        COMMENT ON COLUMN smp_enrollments.stock_symbol IS 'Stock symbol to purchase (e.g., WTRC, AAPL)';
        
        RAISE NOTICE 'Added stock_symbol column to smp_enrollments table';
    ELSE
        RAISE NOTICE 'stock_symbol column already exists in smp_enrollments table';
    END IF;
END $$;

-- Verify the column exists
SELECT 
    column_name, 
    data_type, 
    character_maximum_length,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'smp_enrollments'
AND column_name = 'stock_symbol';


-- Add NYSE Stock Integration
-- ===========================
-- Run this in Supabase SQL Editor to enable real NYSE stock data

-- Add fields to track real stocks
ALTER TABLE stock_market 
ADD COLUMN IF NOT EXISTS is_real_stock BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'simulated'; -- 'simulated', 'nyse', 'nasdaq', etc.

-- Create index for real stocks
CREATE INDEX IF NOT EXISTS idx_stock_market_is_real_stock ON stock_market(is_real_stock);

-- Function to update real stock prices from external API
-- This will be called by the application, not directly by SQL
-- The actual API calls will be made from JavaScript/Edge Functions

-- Add a function to mark stocks as real
CREATE OR REPLACE FUNCTION mark_stock_as_real(
    p_stock_id BIGINT,
    p_source VARCHAR(50) DEFAULT 'nyse'
)
RETURNS void AS $$
BEGIN
    UPDATE stock_market
    SET 
        is_real_stock = TRUE,
        source = p_source
    WHERE id = p_stock_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION mark_stock_as_real(BIGINT, VARCHAR) TO authenticated;

-- Function to update a real stock's price (called from application after fetching from API)
CREATE OR REPLACE FUNCTION update_real_stock_price(
    p_stock_id BIGINT,
    p_new_price DECIMAL(10, 2),
    p_change_percent DECIMAL(5, 2)
)
RETURNS void AS $$
DECLARE
    old_price DECIMAL(10, 2);
BEGIN
    -- Get old price
    SELECT current_price INTO old_price FROM stock_market WHERE id = p_stock_id;
    
    -- Update stock
    UPDATE stock_market
    SET 
        previous_price = old_price,
        current_price = p_new_price,
        change_percent = p_change_percent,
        last_updated = NOW()
    WHERE id = p_stock_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_real_stock_price(BIGINT, DECIMAL, DECIMAL) TO authenticated;

-- Update the existing update_stock_prices function to skip real stocks
CREATE OR REPLACE FUNCTION update_stock_prices()
RETURNS void AS $$
DECLARE
    stock_record RECORD;
    new_price DECIMAL(10, 2);
    change_pct DECIMAL(5, 2);
BEGIN
    -- Only update simulated stocks (real stocks are updated via API)
    FOR stock_record IN SELECT * FROM stock_market WHERE is_real_stock = FALSE LOOP
        -- Calculate random price change based on volatility
        change_pct := (RANDOM() * stock_record.volatility * 2 - stock_record.volatility);
        new_price := stock_record.current_price * (1 + change_pct / 100);
        
        -- Ensure price doesn't go below 0.01
        IF new_price < 0.01 THEN
            new_price := 0.01;
        END IF;
        
        -- Update stock (this will trigger the price history trigger)
        UPDATE stock_market
        SET 
            previous_price = current_price,
            current_price = new_price,
            change_percent = change_pct,
            last_updated = NOW()
        WHERE id = stock_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_stock_prices() TO authenticated;
GRANT EXECUTE ON FUNCTION update_stock_prices() TO anon;


-- Fix Stock Price Update Function
-- ================================
-- Run this in Supabase SQL Editor to ensure stock prices actually update

-- Drop and recreate the function with proper loop
CREATE OR REPLACE FUNCTION update_stock_prices()
RETURNS void AS $$
DECLARE
    stock_record RECORD;
    new_price DECIMAL(10, 2);
    change_pct DECIMAL(5, 2);
BEGIN
    FOR stock_record IN SELECT * FROM stock_market LOOP
        -- Calculate random price change based on volatility
        -- Range: -volatility% to +volatility%
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
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_stock_prices() TO authenticated;





-- Complete Fix for Stock Market - Prices and History
-- ===================================================
-- Run this in Supabase SQL Editor to fix stock price updates and history

-- 1. Ensure stock_price_history table exists
CREATE TABLE IF NOT EXISTS stock_price_history (
    id BIGSERIAL PRIMARY KEY,
    stock_id BIGINT NOT NULL REFERENCES stock_market(id) ON DELETE CASCADE,
    price DECIMAL(10, 2) NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_price_history_stock_id ON stock_price_history(stock_id);
CREATE INDEX IF NOT EXISTS idx_stock_price_history_recorded_at ON stock_price_history(recorded_at);

-- 2. Fix the price history recording function
CREATE OR REPLACE FUNCTION record_stock_price_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Always record when price changes (even if slightly)
    IF NEW.current_price IS DISTINCT FROM OLD.current_price THEN
        INSERT INTO stock_price_history (stock_id, price, recorded_at)
        VALUES (NEW.id, NEW.current_price, NOW());
        
        -- Keep only last 100 records per stock
        DELETE FROM stock_price_history
        WHERE stock_id = NEW.id
        AND id NOT IN (
            SELECT id FROM stock_price_history
            WHERE stock_id = NEW.id
            ORDER BY recorded_at DESC
            LIMIT 100
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Ensure trigger exists
DROP TRIGGER IF EXISTS stock_price_history_trigger ON stock_market;
CREATE TRIGGER stock_price_history_trigger
    AFTER UPDATE ON stock_market
    FOR EACH ROW
    WHEN (NEW.current_price IS DISTINCT FROM OLD.current_price)
    EXECUTE FUNCTION record_stock_price_history();

-- 4. Fix the update function with proper permissions
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_stock_prices() TO authenticated;
GRANT EXECUTE ON FUNCTION update_stock_prices() TO anon;

-- 5. Seed initial price history for all existing stocks
DO $$
DECLARE
    stock_rec RECORD;
    base_price DECIMAL(10, 2);
    i INTEGER;
    price_point DECIMAL(10, 2);
    time_offset INTERVAL;
BEGIN
    FOR stock_rec IN SELECT * FROM stock_market LOOP
        base_price := stock_rec.current_price;
        
        -- Create 20 historical data points going back in time
        FOR i IN 1..20 LOOP
            time_offset := (i * INTERVAL '5 minutes') * -1;
            -- Add some variation to historical prices
            price_point := base_price * (1 + (RANDOM() * 0.1 - 0.05)); -- ±5% variation
            
            INSERT INTO stock_price_history (stock_id, price, recorded_at)
            VALUES (stock_rec.id, price_point, NOW() + time_offset)
            ON CONFLICT DO NOTHING;
        END LOOP;
        
        -- Add current price
        INSERT INTO stock_price_history (stock_id, price, recorded_at)
        VALUES (stock_rec.id, base_price, NOW())
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

-- 6. RLS Policies
ALTER TABLE stock_price_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Employees can view stock price history" ON stock_price_history;
DROP POLICY IF EXISTS "Admins can view all stock price history" ON stock_price_history;

-- Employees can view stock price history
CREATE POLICY "Employees can view stock price history"
    ON stock_price_history FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Admins can view all stock price history
CREATE POLICY "Admins can view all stock price history"
    ON stock_price_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = TRUE
        )
    );


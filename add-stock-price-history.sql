-- Add Stock Price History Table
-- ==============================
-- Run this in Supabase SQL Editor to enable stock price history tracking

-- Create stock_price_history table
CREATE TABLE IF NOT EXISTS stock_price_history (
    id BIGSERIAL PRIMARY KEY,
    stock_id BIGINT NOT NULL REFERENCES stock_market(id) ON DELETE CASCADE,
    price DECIMAL(10, 2) NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_price_history_stock_id ON stock_price_history(stock_id);
CREATE INDEX IF NOT EXISTS idx_stock_price_history_recorded_at ON stock_price_history(recorded_at);

-- Create function to record price history when prices update
CREATE OR REPLACE FUNCTION record_stock_price_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Only record if price actually changed
    IF NEW.current_price != OLD.current_price THEN
        INSERT INTO stock_price_history (stock_id, price, recorded_at)
        VALUES (NEW.id, NEW.current_price, NOW());
        
        -- Keep only last 100 records per stock to prevent table bloat
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

-- Create trigger to record price history
DROP TRIGGER IF EXISTS stock_price_history_trigger ON stock_market;
CREATE TRIGGER stock_price_history_trigger
    AFTER UPDATE OF current_price ON stock_market
    FOR EACH ROW
    EXECUTE FUNCTION record_stock_price_history();

-- RLS Policies
ALTER TABLE stock_price_history ENABLE ROW LEVEL SECURITY;

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


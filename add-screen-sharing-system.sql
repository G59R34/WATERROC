-- Screen Sharing System for Employee Monitoring
-- Run this in Supabase SQL Editor

-- ==========================================
-- EMPLOYEE SCREEN SHARES TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.employee_screen_shares (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    frame_data TEXT, -- Base64 encoded image data (fallback)
    signal_data JSONB, -- WebRTC signaling data (offer/answer/ICE candidates)
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_screen_shares_employee_id ON public.employee_screen_shares(employee_id);
CREATE INDEX IF NOT EXISTS idx_screen_shares_updated_at ON public.employee_screen_shares(updated_at);

-- RLS Policies
ALTER TABLE public.employee_screen_shares ENABLE ROW LEVEL SECURITY;

-- Employees can insert/update their own screen shares
DROP POLICY IF EXISTS "Employees can manage own screen shares" ON public.employee_screen_shares;
CREATE POLICY "Employees can manage own screen shares" ON public.employee_screen_shares
    FOR ALL
    TO authenticated
    USING (
        employee_id IN (
            SELECT id FROM public.employees WHERE user_id IN (
                SELECT id FROM public.users WHERE auth_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        employee_id IN (
            SELECT id FROM public.employees WHERE user_id IN (
                SELECT id FROM public.users WHERE auth_id = auth.uid()
            )
        )
    );

-- Admins can view all screen shares
DROP POLICY IF EXISTS "Admins can view all screen shares" ON public.employee_screen_shares;
CREATE POLICY "Admins can view all screen shares" ON public.employee_screen_shares
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND is_admin = TRUE)
    );

-- Auto-cleanup old screen shares (older than 1 minute without updates)
CREATE OR REPLACE FUNCTION cleanup_old_screen_shares()
RETURNS void AS $$
BEGIN
    DELETE FROM public.employee_screen_shares
    WHERE updated_at < NOW() - INTERVAL '1 minute';
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_screen_share_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_screen_share_timestamp ON public.employee_screen_shares;
CREATE TRIGGER trigger_update_screen_share_timestamp
    BEFORE UPDATE ON public.employee_screen_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_screen_share_timestamp();

COMMENT ON TABLE public.employee_screen_shares IS 'Stores screen share frames from employees for admin monitoring';


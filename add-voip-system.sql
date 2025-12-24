-- VOIP System for WaterROC
-- Run this in Supabase SQL Editor

-- Create call_logs table to track all calls
CREATE TABLE IF NOT EXISTS public.call_logs (
    id BIGSERIAL PRIMARY KEY,
    caller_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    receiver_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    caller_name TEXT NOT NULL,
    receiver_name TEXT NOT NULL,
    call_status VARCHAR(20) DEFAULT 'initiated' CHECK (call_status IN ('initiated', 'ringing', 'answered', 'missed', 'rejected', 'ended', 'failed')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    call_type VARCHAR(20) DEFAULT 'audio' CHECK (call_type IN ('audio', 'video')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for call_logs
CREATE INDEX IF NOT EXISTS idx_call_logs_caller ON public.call_logs(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_receiver ON public.call_logs(receiver_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON public.call_logs(call_status);
CREATE INDEX IF NOT EXISTS idx_call_logs_started_at ON public.call_logs(started_at);

-- Create call_signaling table for WebRTC signaling (temporary, cleaned up after calls)
CREATE TABLE IF NOT EXISTS public.call_signaling (
    id BIGSERIAL PRIMARY KEY,
    call_id TEXT NOT NULL UNIQUE, -- Unique call identifier
    caller_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    receiver_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    signal_type VARCHAR(50) NOT NULL, -- 'offer', 'answer', 'ice-candidate', 'call-request', 'call-accept', 'call-reject', 'call-end'
    signal_data JSONB NOT NULL, -- WebRTC offer/answer/ICE candidate data
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes') -- Auto-cleanup old signals
);

-- Create index for call_signaling
CREATE INDEX IF NOT EXISTS idx_call_signaling_call_id ON public.call_signaling(call_id);
CREATE INDEX IF NOT EXISTS idx_call_signaling_receiver ON public.call_signaling(receiver_id);
CREATE INDEX IF NOT EXISTS idx_call_signaling_expires_at ON public.call_signaling(expires_at);

-- Function to clean up expired signaling data
CREATE OR REPLACE FUNCTION cleanup_expired_signaling()
RETURNS void AS $$
BEGIN
    DELETE FROM call_signaling WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signaling ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_logs
CREATE POLICY "Employees can view own call logs"
    ON public.call_logs FOR SELECT
    TO authenticated
    USING (
        caller_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
        OR receiver_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Employees can create call logs"
    ON public.call_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        caller_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Employees can update own call logs"
    ON public.call_logs FOR UPDATE
    TO authenticated
    USING (
        caller_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
        OR receiver_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND role = 'admin')
    );

-- RLS Policies for call_signaling
CREATE POLICY "Employees can view relevant signaling"
    ON public.call_signaling FOR SELECT
    TO authenticated
    USING (
        caller_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
        OR receiver_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    );

CREATE POLICY "Employees can create signaling"
    ON public.call_signaling FOR INSERT
    TO authenticated
    WITH CHECK (
        caller_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    );

CREATE POLICY "Employees can delete own signaling"
    ON public.call_signaling FOR DELETE
    TO authenticated
    USING (
        caller_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
        OR receiver_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    );

-- Enable real-time for call_signaling (for WebRTC signaling)
ALTER PUBLICATION supabase_realtime ADD TABLE call_signaling;

COMMENT ON TABLE public.call_logs IS 'Stores call history and logs for VOIP system';
COMMENT ON TABLE public.call_signaling IS 'Temporary WebRTC signaling data for active calls';
COMMENT ON COLUMN public.call_signaling.signal_type IS 'Type of signal: offer, answer, ice-candidate, call-request, call-accept, call-reject, call-end';


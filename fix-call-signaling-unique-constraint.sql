-- Fix call_signaling unique constraint
-- Run this in Supabase SQL Editor to fix the duplicate key issue

-- Drop the existing unique constraint on call_id
ALTER TABLE public.call_signaling DROP CONSTRAINT IF EXISTS call_signaling_call_id_key;

-- Create a partial unique index that only enforces uniqueness for specific signal types
-- This allows multiple ice-candidate signals per call_id, but prevents duplicate call-requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_signaling_unique_requests 
    ON public.call_signaling(call_id, signal_type) 
    WHERE signal_type IN ('call-request', 'call-accept', 'call-reject', 'call-end');

COMMENT ON INDEX idx_call_signaling_unique_requests IS 'Ensures unique call-request/accept/reject/end signals per call_id, but allows multiple ice-candidates';


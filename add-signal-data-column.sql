-- Add signal_data column to employee_screen_shares table
-- Run this in Supabase SQL Editor if the table already exists

-- Add signal_data column (for WebRTC signaling)
ALTER TABLE public.employee_screen_shares 
ADD COLUMN IF NOT EXISTS signal_data JSONB;

-- Make frame_data nullable (since we might not always have it with WebRTC)
ALTER TABLE public.employee_screen_shares 
ALTER COLUMN frame_data DROP NOT NULL;

-- Add index for signal_data queries
CREATE INDEX IF NOT EXISTS idx_screen_shares_signal_data ON public.employee_screen_shares USING GIN (signal_data);

COMMENT ON COLUMN public.employee_screen_shares.signal_data IS 'WebRTC signaling data (offer/answer/ICE candidates) stored as JSONB';



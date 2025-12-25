-- Enable Realtime for VOIP Call Signaling
-- Run this in Supabase SQL Editor
-- This is REQUIRED for VOIP to work in production

-- Step 1: Set REPLICA IDENTITY to FULL (required for realtime)
-- This allows Supabase to track all changes to rows
ALTER TABLE public.call_signaling REPLICA IDENTITY FULL;

-- Step 2: Add table to realtime publication
-- This enables real-time subscriptions for the table
ALTER PUBLICATION supabase_realtime ADD TABLE call_signaling;

-- Step 3: Verify realtime is enabled
-- Run this query to check if the table is in the publication:
-- SELECT schemaname, tablename 
-- FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime' AND tablename = 'call_signaling';

-- Step 4: Verify REPLICA IDENTITY
-- Run this query to check REPLICA IDENTITY:
-- SELECT relname, relreplident 
-- FROM pg_class 
-- WHERE relname = 'call_signaling';
-- Should return 'f' for FULL (d=default, n=nothing, i=index, f=full)

COMMENT ON TABLE public.call_signaling IS 'WebRTC signaling table with realtime enabled for VOIP calls';


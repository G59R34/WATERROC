-- Fix RLS policies for exception_logs to allow SYSTEM inserts
-- This ensures that triggers can create NSFT exceptions

-- Check current policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'exception_logs';

-- Allow SYSTEM to insert exception logs (for triggers)
-- Note: SYSTEM is not a real role, but we can use a policy that allows inserts when created_by = 'SYSTEM'
-- or we can disable RLS for SYSTEM operations

-- Option 1: Add a policy that allows inserts when created_by is 'SYSTEM'
DROP POLICY IF EXISTS "System can insert exception_logs" ON exception_logs;
CREATE POLICY "System can insert exception_logs" ON exception_logs
    FOR INSERT
    WITH CHECK (created_by = 'SYSTEM' OR approved_by = 'SYSTEM');

-- Option 2: If the above doesn't work, you may need to temporarily disable RLS for inserts
-- ALTER TABLE exception_logs DISABLE ROW LEVEL SECURITY; -- NOT RECOMMENDED for production

-- Option 3: Grant necessary permissions (if using service role)
-- GRANT INSERT ON exception_logs TO service_role; -- If using Supabase service role

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'exception_logs';


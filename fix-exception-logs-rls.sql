-- Fix RLS policy for exception_logs to use user_id relationship instead of name matching
-- This ensures employees can view their own exception logs reliably

-- Drop the existing policy
DROP POLICY IF EXISTS "Employees view own exception_logs" ON exception_logs;

-- Create a new policy that uses the user_id relationship
CREATE POLICY "Employees view own exception_logs" ON exception_logs
    FOR SELECT
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
    );

COMMENT ON POLICY "Employees view own exception_logs" ON exception_logs IS 
    'Allows employees to view their own exception logs using the user_id relationship';


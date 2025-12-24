-- Fix VOIP RLS Policies
-- Run this in Supabase SQL Editor to fix the Row Level Security policies for VOIP system

-- Drop existing policies
DROP POLICY IF EXISTS "Employees can view own call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Employees can create call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Employees can update own call logs" ON public.call_logs;

DROP POLICY IF EXISTS "Employees can view relevant signaling" ON public.call_signaling;
DROP POLICY IF EXISTS "Employees can create signaling" ON public.call_signaling;
DROP POLICY IF EXISTS "Employees can delete own signaling" ON public.call_signaling;

-- Recreate RLS Policies for call_logs with correct user relationship
-- employees.user_id references users.id (UUID), not auth.uid()
-- We need to join through users table where users.auth_id = auth.uid()
CREATE POLICY "Employees can view own call logs"
    ON public.call_logs FOR SELECT
    TO authenticated
    USING (
        caller_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
        OR receiver_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid() AND e.role = 'admin'
        )
    );

CREATE POLICY "Employees can create call logs"
    ON public.call_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        caller_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid() AND e.role = 'admin'
        )
    );

CREATE POLICY "Employees can update own call logs"
    ON public.call_logs FOR UPDATE
    TO authenticated
    USING (
        caller_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
        OR receiver_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid() AND e.role = 'admin'
        )
    )
    WITH CHECK (
        caller_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
        OR receiver_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid() AND e.role = 'admin'
        )
    );

-- Recreate RLS Policies for call_signaling with correct user relationship
-- Allow both caller and receiver to create signaling (for answering calls)
CREATE POLICY "Employees can view relevant signaling"
    ON public.call_signaling FOR SELECT
    TO authenticated
    USING (
        caller_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
        OR receiver_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Employees can create signaling as caller"
    ON public.call_signaling FOR INSERT
    TO authenticated
    WITH CHECK (
        caller_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Employees can create signaling as receiver"
    ON public.call_signaling FOR INSERT
    TO authenticated
    WITH CHECK (
        receiver_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Employees can delete own signaling"
    ON public.call_signaling FOR DELETE
    TO authenticated
    USING (
        caller_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
        OR receiver_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
    );

-- Alternative: If the above doesn't work, try this simpler approach
-- (Uncomment if needed)
/*
-- Drop the complex policies above
DROP POLICY IF EXISTS "Employees can create signaling as caller" ON public.call_signaling;
DROP POLICY IF EXISTS "Employees can create signaling as receiver" ON public.call_signaling;

-- Create a single policy that allows both caller and receiver
CREATE POLICY "Employees can create signaling"
    ON public.call_signaling FOR INSERT
    TO authenticated
    WITH CHECK (
        caller_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
        OR receiver_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE u.auth_id = auth.uid()
        )
    );
*/

COMMENT ON POLICY "Employees can view own call logs" ON public.call_logs IS 'Allows employees to view call logs where they are the caller or receiver';
COMMENT ON POLICY "Employees can create call logs" ON public.call_logs IS 'Allows employees to create call logs when they initiate a call';
COMMENT ON POLICY "Employees can create signaling as caller" ON public.call_signaling IS 'Allows employees to create signaling when they initiate a call';
COMMENT ON POLICY "Employees can create signaling as receiver" ON public.call_signaling IS 'Allows employees to create signaling when they answer a call';


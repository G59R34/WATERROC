-- Fix RLS policy for hourly_tasks to allow employee acknowledgements
-- Simple policy that allows any authenticated user to update tasks

DROP POLICY IF EXISTS "Employees update own hourly_tasks" ON hourly_tasks;

CREATE POLICY "Authenticated users update hourly_tasks" ON hourly_tasks
    FOR UPDATE
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

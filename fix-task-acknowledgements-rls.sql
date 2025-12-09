-- Fix RLS policy for task_acknowledgements to allow employees to acknowledge tasks

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert task acknowledgements" ON task_acknowledgements;
DROP POLICY IF EXISTS "Users can delete their acknowledgements" ON task_acknowledgements;

-- Allow any authenticated user to insert acknowledgements
CREATE POLICY "Authenticated users insert task_acknowledgements" ON task_acknowledgements
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to delete their own acknowledgements
CREATE POLICY "Users delete own task_acknowledgements" ON task_acknowledgements
    FOR DELETE
    USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Allow users to view all acknowledgements (needed for checking if already acknowledged)
DROP POLICY IF EXISTS "Users can view task acknowledgements" ON task_acknowledgements;
CREATE POLICY "Authenticated users view task_acknowledgements" ON task_acknowledgements
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

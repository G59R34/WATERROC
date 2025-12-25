-- Add RLS Policy for Admins to Delete Employees and Employee Profiles
-- Run this in Supabase SQL Editor to allow admins to delete employees

-- Drop existing delete policies if they exist
DROP POLICY IF EXISTS "Admins can delete employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can delete employee profiles" ON public.employee_profiles;

-- Create policy for admins to delete employees
CREATE POLICY "Admins can delete employees"
    ON public.employees
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid() AND users.is_admin = TRUE
        )
    );

-- Create policy for admins to delete employee profiles
CREATE POLICY "Admins can delete employee profiles"
    ON public.employee_profiles
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid() AND users.is_admin = TRUE
        )
    );

-- Fix all foreign key constraints that reference employees table
-- This ensures cascading deletes work properly

-- First, find and drop the status_changed_by constraint (this is the one causing the issue)
DO $$
DECLARE
    constraint_name TEXT;
    status_changed_by_attnum SMALLINT;
BEGIN
    -- Get the attribute number for status_changed_by
    SELECT attnum INTO status_changed_by_attnum
    FROM pg_attribute 
    WHERE attrelid = 'public.employee_profiles'::regclass 
    AND attname = 'status_changed_by';
    
    -- Find the constraint name for status_changed_by
    IF status_changed_by_attnum IS NOT NULL THEN
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'public.employee_profiles'::regclass
        AND contype = 'f'
        AND conkey = ARRAY[status_changed_by_attnum];
        
        -- Drop the constraint if it exists
        IF constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.employee_profiles DROP CONSTRAINT %I', constraint_name);
            RAISE NOTICE 'Dropped constraint: %', constraint_name;
        END IF;
    END IF;
END $$;

-- Recreate status_changed_by with SET NULL (since it's optional and can reference any employee)
-- This allows deletion of employees even if they changed someone's status
DO $$
BEGIN
    -- Only add if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.employee_profiles'::regclass
        AND contype = 'f'
        AND conname = 'employee_profiles_status_changed_by_fkey'
    ) THEN
        ALTER TABLE public.employee_profiles
        ADD CONSTRAINT employee_profiles_status_changed_by_fkey
        FOREIGN KEY (status_changed_by) 
        REFERENCES public.employees(id) 
        ON DELETE SET NULL;
        RAISE NOTICE 'Created status_changed_by constraint with SET NULL';
    END IF;
END $$;

-- Fix employee_id foreign key constraint
DO $$
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'employee_profiles_employee_id_fkey' 
        AND contype = 'f'
    ) THEN
        ALTER TABLE public.employee_profiles 
        DROP CONSTRAINT employee_profiles_employee_id_fkey;
        RAISE NOTICE 'Dropped employee_id constraint';
    END IF;
    
    -- Recreate with CASCADE
    ALTER TABLE public.employee_profiles
    ADD CONSTRAINT employee_profiles_employee_id_fkey
    FOREIGN KEY (employee_id) 
    REFERENCES public.employees(id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Created employee_id constraint with CASCADE';
END $$;

-- Fix task_logs foreign key constraint to ensure CASCADE delete
DO $$
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'task_logs_employee_id_fkey' 
        AND contype = 'f'
    ) THEN
        ALTER TABLE public.task_logs 
        DROP CONSTRAINT task_logs_employee_id_fkey;
        RAISE NOTICE 'Dropped task_logs_employee_id_fkey constraint';
    END IF;
    
    -- Recreate with CASCADE
    ALTER TABLE public.task_logs
    ADD CONSTRAINT task_logs_employee_id_fkey
    FOREIGN KEY (employee_id) 
    REFERENCES public.employees(id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Created task_logs_employee_id_fkey constraint with CASCADE';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error fixing task_logs constraint: %', SQLERRM;
END $$;

-- Fix task_logs table to allow NULL employee_name (for historical records when employee is deleted)
-- The employee_name is just for display purposes, and should be nullable to allow deletion
DO $$
BEGIN
    -- Make employee_name nullable if it's not already
    ALTER TABLE public.task_logs 
    ALTER COLUMN employee_name DROP NOT NULL;
    
    RAISE NOTICE 'Made employee_name nullable in task_logs';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not alter employee_name column: %', SQLERRM;
END $$;

-- Update the log_task_event function to handle deleted employees gracefully
-- Skip logging if employee doesn't exist (during employee deletion)
CREATE OR REPLACE FUNCTION log_task_event()
RETURNS TRIGGER AS $$
DECLARE
    action_type TEXT;
    emp_name TEXT;
    emp_id INTEGER;
    employee_exists BOOLEAN;
BEGIN
    -- Get employee_id
    emp_id := COALESCE(NEW.employee_id, OLD.employee_id);
    
    -- Check if employee still exists (important during deletion)
    SELECT EXISTS(SELECT 1 FROM employees WHERE id = emp_id) INTO employee_exists;
    
    -- If employee doesn't exist, skip logging (employee is being deleted)
    IF NOT employee_exists THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Get employee name
    SELECT name INTO emp_name 
    FROM employees 
    WHERE id = emp_id;
    
    -- If employee not found (shouldn't happen if exists check passed), use placeholder
    IF emp_name IS NULL THEN
        emp_name := '[Unknown Employee]';
    END IF;
    
    -- Determine action type
    IF TG_OP = 'INSERT' THEN
        action_type := 'created';
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
            action_type := 'completed';
        ELSIF NEW.acknowledged = true AND OLD.acknowledged = false THEN
            action_type := 'acknowledged';
        ELSE
            action_type := 'modified';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        action_type := 'deleted';
    END IF;
    
    -- Insert log entry (only if employee exists)
    INSERT INTO task_logs (
        task_id, action, employee_id, employee_name, task_name,
        task_date, work_area, start_time, end_time, status,
        acknowledged, acknowledged_by, acknowledged_at, previous_status
    ) VALUES (
        COALESCE(NEW.id, OLD.id),
        action_type,
        emp_id,
        emp_name,
        COALESCE(NEW.name, OLD.name),
        COALESCE(NEW.task_date, OLD.task_date),
        COALESCE(NEW.work_area, OLD.work_area),
        COALESCE(NEW.start_time, OLD.start_time),
        COALESCE(NEW.end_time, OLD.end_time),
        COALESCE(NEW.status, OLD.status),
        COALESCE(NEW.acknowledged, OLD.acknowledged, false),
        COALESCE(NEW.acknowledged_by, OLD.acknowledged_by),
        COALESCE(NEW.acknowledged_at, OLD.acknowledged_at),
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END
    );
    
    RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
    -- If any error occurs (e.g., foreign key violation), just return without logging
    -- This prevents the deletion from failing due to logging issues
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON POLICY "Admins can delete employees" ON public.employees IS 'Allows admins to permanently delete employees from the system';
COMMENT ON POLICY "Admins can delete employee profiles" ON public.employee_profiles IS 'Allows admins to delete employee profiles when deleting employees';


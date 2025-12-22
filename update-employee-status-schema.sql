-- Update employee_profiles table to support all employment statuses
-- Run this in Supabase SQL Editor after the initial schema

-- First, drop the existing constraint that limits status values
ALTER TABLE public.employee_profiles 
DROP CONSTRAINT IF EXISTS employee_profiles_employment_status_check;

-- Update the employment_status column to allow all needed values
ALTER TABLE public.employee_profiles 
ADD CONSTRAINT employee_profiles_employment_status_check 
CHECK (employment_status IN (
    'active',
    'inactive', 
    'terminated',
    'administrative_leave',
    'extended_leave',
    'suspended',
    'probation'
));

-- Add indexes for better performance on status queries
CREATE INDEX IF NOT EXISTS idx_employee_profiles_status_updated ON public.employee_profiles(employment_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_status_changed ON public.employee_profiles(status_changed_at);

-- Create a function to notify clients about status changes (for real-time updates)
CREATE OR REPLACE FUNCTION notify_employee_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify if the employment status actually changed
    IF OLD.employment_status IS DISTINCT FROM NEW.employment_status THEN
        -- Set the status_changed_at timestamp
        NEW.status_changed_at = NOW();
        
        -- Perform the notification after the update completes
        PERFORM pg_notify(
            'employee_status_changed',
            json_build_object(
                'employee_id', NEW.employee_id,
                'old_status', OLD.employment_status,
                'new_status', NEW.employment_status,
                'changed_at', NEW.status_changed_at
            )::text
        );
        
        -- Also update the sync function behavior for new statuses
        UPDATE employees
        SET 
            role = CASE 
                WHEN NEW.employment_status IN ('terminated', 'suspended', 'administrative_leave') THEN 'inactive'
                WHEN NEW.employment_status = 'extended_leave' THEN 'on_leave'
                WHEN NEW.employment_status = 'probation' THEN 'probation'
                ELSE role
            END,
            updated_at = NOW()
        WHERE id = NEW.employee_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS trigger_sync_employee_status ON employee_profiles;
DROP TRIGGER IF EXISTS trigger_notify_employee_status_change ON employee_profiles;

CREATE TRIGGER trigger_notify_employee_status_change
    BEFORE UPDATE OF employment_status ON employee_profiles
    FOR EACH ROW
    EXECUTE FUNCTION notify_employee_status_change();

-- Create a function to automatically set employment status when creating profiles
CREATE OR REPLACE FUNCTION set_default_employment_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Set default status if not provided
    IF NEW.employment_status IS NULL THEN
        NEW.employment_status = 'active';
    END IF;
    
    -- Set the initial status_changed_at
    NEW.status_changed_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new profiles
CREATE TRIGGER trigger_set_default_employment_status
    BEFORE INSERT ON employee_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_default_employment_status();

-- Create a view for active employees (for easier queries)
CREATE OR REPLACE VIEW active_employees AS
SELECT 
    e.id,
    e.name,
    e.role,
    ep.employment_status,
    ep.status_changed_at,
    ep.hire_date
FROM employees e
LEFT JOIN employee_profiles ep ON e.id = ep.employee_id
WHERE ep.employment_status = 'active' OR ep.employment_status IS NULL;

-- Create a view for inactive employees
CREATE OR REPLACE VIEW inactive_employees AS
SELECT 
    e.id,
    e.name,
    e.role,
    ep.employment_status,
    ep.status_changed_at,
    ep.status_reason
FROM employees e
LEFT JOIN employee_profiles ep ON e.id = ep.employee_id
WHERE ep.employment_status IN ('terminated', 'suspended', 'administrative_leave', 'inactive');

-- Grant permissions
GRANT SELECT ON active_employees TO authenticated;
GRANT SELECT ON inactive_employees TO authenticated;

-- Insert default profiles for existing employees who don't have profiles
INSERT INTO employee_profiles (employee_id, employment_status, created_at)
SELECT 
    e.id,
    'active',
    NOW()
FROM employees e
LEFT JOIN employee_profiles ep ON e.id = ep.employee_id
WHERE ep.employee_id IS NULL
ON CONFLICT (employee_id) DO NOTHING;

-- Update RLS policies to ensure proper access
DROP POLICY IF EXISTS "Enable real-time for authenticated users" ON employee_profiles;
CREATE POLICY "Enable real-time for authenticated users" ON employee_profiles
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create a function to safely update employment status with reason tracking
CREATE OR REPLACE FUNCTION update_employment_status(
    p_employee_id BIGINT,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL,
    p_changed_by BIGINT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    status_updated BOOLEAN := FALSE;
BEGIN
    -- Validate the status
    IF p_new_status NOT IN ('active', 'inactive', 'terminated', 'administrative_leave', 'extended_leave', 'suspended', 'probation') THEN
        RAISE EXCEPTION 'Invalid employment status: %', p_new_status;
    END IF;
    
    -- Update the profile
    UPDATE employee_profiles
    SET 
        employment_status = p_new_status,
        status_reason = p_reason,
        status_changed_by = p_changed_by,
        updated_at = NOW()
    WHERE employee_id = p_employee_id;
    
    IF FOUND THEN
        status_updated := TRUE;
    ELSE
        -- Create profile if it doesn't exist
        INSERT INTO employee_profiles (employee_id, employment_status, status_reason, status_changed_by)
        VALUES (p_employee_id, p_new_status, p_reason, p_changed_by);
        status_updated := TRUE;
    END IF;
    
    RETURN status_updated;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_employment_status TO authenticated;

COMMIT;
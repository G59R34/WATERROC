-- Add employee status column to employee_profiles
-- Run this in Supabase SQL Editor

-- Add status column to employee_profiles
ALTER TABLE employee_profiles 
ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'active' 
CHECK (employment_status IN ('active', 'administrative_leave', 'terminated'));

-- Add status change tracking
ALTER TABLE employee_profiles 
ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_changed_by BIGINT REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- Create index for filtering by status
CREATE INDEX IF NOT EXISTS idx_employee_profiles_status ON employee_profiles(employment_status);

-- Function to update employees table status when profile status changes
CREATE OR REPLACE FUNCTION sync_employee_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the employees table to match the profile status
    UPDATE employees
    SET 
        role = CASE 
            WHEN NEW.employment_status = 'terminated' THEN 'inactive'
            WHEN NEW.employment_status = 'administrative_leave' THEN 'suspended'
            ELSE role
        END,
        updated_at = NOW()
    WHERE id = NEW.employee_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync status
DROP TRIGGER IF EXISTS trigger_sync_employee_status ON employee_profiles;
CREATE TRIGGER trigger_sync_employee_status
    AFTER UPDATE OF employment_status ON employee_profiles
    FOR EACH ROW
    WHEN (OLD.employment_status IS DISTINCT FROM NEW.employment_status)
    EXECUTE FUNCTION sync_employee_status();

-- Update existing records to have 'active' status
UPDATE employee_profiles 
SET employment_status = 'active' 
WHERE employment_status IS NULL;

COMMENT ON COLUMN employee_profiles.employment_status IS 'Current employment status: active, administrative_leave, or terminated';

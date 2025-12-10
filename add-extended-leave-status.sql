-- Add 'extended_leave' status to employee_profiles

-- First, ensure any NULL values are set to 'active'
UPDATE employee_profiles 
SET employment_status = 'active' 
WHERE employment_status IS NULL;

-- Drop the old constraint if it exists
ALTER TABLE employee_profiles 
DROP CONSTRAINT IF EXISTS employee_profiles_employment_status_check;

-- Add the new constraint with 'extended_leave'
ALTER TABLE employee_profiles
ADD CONSTRAINT employee_profiles_employment_status_check 
CHECK (employment_status IN ('active', 'terminated', 'administrative_leave', 'extended_leave'));

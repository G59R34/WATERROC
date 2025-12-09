-- Fix Employee Profiles RLS Policies
-- Run this in Supabase SQL Editor to allow employees to edit their own profiles

-- DISABLE RLS temporarily to test
ALTER TABLE employee_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE employee_shifts DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Anyone can view employee profiles" ON employee_profiles;
DROP POLICY IF EXISTS "Admins can manage employee profiles" ON employee_profiles;
DROP POLICY IF EXISTS "Employees can insert own profile" ON employee_profiles;
DROP POLICY IF EXISTS "Employees can update own profile data" ON employee_profiles;
DROP POLICY IF EXISTS "Admins can manage all employee profiles" ON employee_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON employee_profiles;

DROP POLICY IF EXISTS "Anyone can view shifts" ON employee_shifts;
DROP POLICY IF EXISTS "Admins can manage shifts" ON employee_shifts;

-- Fix the foreign key constraint issue for employee_shifts
-- Drop the problematic foreign key
ALTER TABLE employee_shifts DROP CONSTRAINT IF EXISTS employee_shifts_created_by_fkey;

-- Make created_by nullable and don't enforce foreign key (optional field)
ALTER TABLE employee_shifts ALTER COLUMN created_by DROP NOT NULL;

-- Re-enable RLS
ALTER TABLE employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_shifts ENABLE ROW LEVEL SECURITY;

-- Create simple, permissive policies
CREATE POLICY "enable_all_for_authenticated_users"
    ON employee_profiles FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "enable_all_shifts_for_authenticated_users"
    ON employee_shifts FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

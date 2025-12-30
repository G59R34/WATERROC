-- Create employee_profiles table and add employment status
-- Run this in Supabase SQL Editor

-- Create employee_profiles table
CREATE TABLE IF NOT EXISTS public.employee_profiles (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    phone VARCHAR(20),
    email VARCHAR(255),
    hire_date DATE,
    skills TEXT[],
    certifications TEXT[],
    notes TEXT,
    employment_status TEXT DEFAULT 'active' CHECK (employment_status IN ('active', 'administrative_leave', 'terminated')),
    status_changed_at TIMESTAMPTZ,
    status_changed_by BIGINT REFERENCES public.employees(id),
    status_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one profile per employee
    UNIQUE(employee_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_employee_profiles_employee_id ON public.employee_profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_status ON public.employee_profiles(employment_status);

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

-- Enable Row Level Security
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employee_profiles
-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Allow authenticated users to read profiles" ON public.employee_profiles;
DROP POLICY IF EXISTS "Allow users to read own profile" ON public.employee_profiles;
DROP POLICY IF EXISTS "Allow admins to manage profiles" ON public.employee_profiles;

-- Allow authenticated users to read all profiles
CREATE POLICY "Allow authenticated users to read profiles" ON public.employee_profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow authenticated users to read their own profile details
CREATE POLICY "Allow users to read own profile" ON public.employee_profiles
    FOR SELECT
    TO authenticated
    USING (
        employee_id IN (
            SELECT id FROM public.employees WHERE user_id = auth.uid()
        )
    );

-- Allow admins to insert/update/delete profiles
CREATE POLICY "Allow admins to manage profiles" ON public.employee_profiles
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.employees 
            WHERE employees.user_id = auth.uid() 
            AND employees.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.employees 
            WHERE employees.user_id = auth.uid() 
            AND employees.role = 'admin'
        )
    );

COMMENT ON TABLE public.employee_profiles IS 'Extended employee profile information including employment status';
COMMENT ON COLUMN public.employee_profiles.employment_status IS 'Current employment status: active, administrative_leave, or terminated';

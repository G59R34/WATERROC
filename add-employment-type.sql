-- Add employment_type field to employee_profiles table
-- Run this in Supabase SQL Editor

-- Add employment_type column to employee_profiles
ALTER TABLE public.employee_profiles 
ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full-time' 
CHECK (employment_type IN ('part-time', 'full-time'));

-- Create index for filtering by employment type
CREATE INDEX IF NOT EXISTS idx_employee_profiles_employment_type ON public.employee_profiles(employment_type);

-- Update existing records to have 'full-time' as default
UPDATE public.employee_profiles 
SET employment_type = 'full-time' 
WHERE employment_type IS NULL;

COMMENT ON COLUMN public.employee_profiles.employment_type IS 'Employment type: part-time (25 hours/week) or full-time (40 hours/week)';


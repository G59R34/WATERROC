-- Test Employee Status Monitoring System
-- Run these commands in Supabase SQL Editor to test the status monitoring

-- First, let's see all employees and their current status
SELECT 
    e.id as employee_id,
    e.name,
    e.role,
    COALESCE(ep.employment_status, 'no_profile') as employment_status,
    ep.status_changed_at,
    ep.status_reason
FROM employees e
LEFT JOIN employee_profiles ep ON e.id = ep.employee_id
ORDER BY e.id;

-- Create some test data if no employees exist
DO $$
BEGIN
    -- Only create test data if no employees exist
    IF NOT EXISTS (SELECT 1 FROM employees LIMIT 1) THEN
        -- Insert test users first
        INSERT INTO users (auth_id, username, email, full_name, role, is_admin)
        VALUES 
            (gen_random_uuid(), 'testadmin', 'admin@waterroc.com', 'Test Administrator', 'admin', true),
            (gen_random_uuid(), 'testemployee1', 'emp1@waterroc.com', 'Test Employee 1', 'employee', false),
            (gen_random_uuid(), 'testemployee2', 'emp2@waterroc.com', 'Test Employee 2', 'employee', false);
        
        -- Insert test employees
        INSERT INTO employees (user_id, name, role)
        SELECT u.id, u.full_name, 'Operations'
        FROM users u 
        WHERE u.username LIKE 'test%';
        
        RAISE NOTICE 'Test data created';
    END IF;
END $$;

-- Ensure all employees have profiles
INSERT INTO employee_profiles (employee_id, employment_status, hire_date, created_at)
SELECT 
    e.id,
    'active',
    CURRENT_DATE - INTERVAL '30 days',
    NOW()
FROM employees e
LEFT JOIN employee_profiles ep ON e.id = ep.employee_id
WHERE ep.employee_id IS NULL
ON CONFLICT (employee_id) DO NOTHING;

-- Test 1: Set an employee to terminated status
-- (Replace 1 with actual employee_id from the first query)
-- SELECT update_employment_status(1, 'terminated', 'Test termination for monitoring system');

-- Test 2: Set an employee to administrative leave
-- SELECT update_employment_status(2, 'administrative_leave', 'Test admin leave for monitoring system');

-- Test 3: Set an employee to extended leave
-- SELECT update_employment_status(3, 'extended_leave', 'Test extended leave for monitoring system');

-- Test 4: Reactivate an employee
-- SELECT update_employment_status(1, 'active', 'Test reactivation');

-- View current status of all employees after tests
SELECT 
    e.id as employee_id,
    e.name,
    e.role,
    ep.employment_status,
    ep.status_changed_at,
    ep.status_reason,
    ep.status_changed_by
FROM employees e
LEFT JOIN employee_profiles ep ON e.id = ep.employee_id
ORDER BY e.id;

-- Test the notification system (this will show if notifications are working)
-- Listen for notifications in a separate session:
-- LISTEN employee_status_changed;

-- Then run status updates in another session to see notifications

-- Check inactive employees view
SELECT * FROM inactive_employees;

-- Check active employees view  
SELECT * FROM active_employees;

-- Test query that the monitoring system will use
SELECT 
    ep.employment_status,
    ep.status_changed_at
FROM employee_profiles ep
WHERE ep.employee_id = 1; -- Replace with actual employee_id

-- Verify that RLS is properly configured
SELECT schemaname, tablename, policyname, permissive, cmd, qual
FROM pg_policies 
WHERE tablename = 'employee_profiles';

-- Check triggers are in place
SELECT tgname, tgenabled, tgtype
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'employee_profiles';

-- Test the real-time subscription capability
-- This creates a trigger that will notify the application
SELECT 'Setup complete. Employee status monitoring ready for testing.' as status;
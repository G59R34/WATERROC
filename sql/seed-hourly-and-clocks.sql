-- Test seed for hourly_tasks and time_clocks
-- Replace <EMPLOYEE_ID> with the numeric employee id shown in your console (e.g. 3)
-- Run this in Supabase SQL editor (SQL > New query) to create sample rows for testing

BEGIN;

-- Check table existence
-- SELECT 'hourly_tasks_exists' AS name, to_regclass('public.hourly_tasks');
-- SELECT 'time_clocks_exists' AS name, to_regclass('public.time_clocks');

-- Replace 3 below with the actual employee id you saw in your console
DO $$
DECLARE
  v_emp_id BIGINT := 3; -- << change this if needed
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Insert a sample hourly task for today
  INSERT INTO public.hourly_tasks (employee_id, task_date, start_time, end_time, name, work_area, status, created_by)
  VALUES (v_emp_id, CURRENT_DATE, '09:00', '10:00', 'Seed: Morning check-in', 'administrative', 'pending', NULL);

  -- Insert a sample time_clocks row
  INSERT INTO public.time_clocks (employee_id, clock_in, clock_out, device_info)
  VALUES (v_emp_id, v_now - INTERVAL '1 hour', v_now - INTERVAL '30 minutes', 'seed-device');
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Useful checks (run separately if you want to inspect results):
-- SELECT * FROM public.hourly_tasks WHERE task_date = CURRENT_DATE ORDER BY start_time DESC LIMIT 50;
-- SELECT * FROM public.time_clocks ORDER BY clock_in DESC LIMIT 50;

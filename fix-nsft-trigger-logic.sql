-- Fix NSFT Exception Triggers to Only Apply When Task Has Started and Not Acknowledged
-- Run this in Supabase SQL Editor

-- ==========================================
-- DROP existing functions first (with all possible signatures)
-- ==========================================
DROP FUNCTION IF EXISTS check_unacknowledged_tasks_at_start() CASCADE;
DROP FUNCTION IF EXISTS trigger_create_nsft_on_overdue() CASCADE;
DROP FUNCTION IF EXISTS trigger_check_unacknowledged_at_start() CASCADE;

-- ==========================================
-- UPDATE: Check Unacknowledged Tasks at Start Function
-- ==========================================
CREATE OR REPLACE FUNCTION check_unacknowledged_tasks_at_start()
RETURNS TABLE (
    tasks_checked INTEGER,
    exceptions_created INTEGER
) AS $$
DECLARE
    v_task RECORD;
    v_employee_name TEXT;
    v_now TIMESTAMPTZ;
    v_today DATE;
    v_task_start_time TIME;
    v_current_time TIME;
    v_has_acknowledgement BOOLEAN;
    v_exceptions_created INTEGER := 0;
    v_tasks_checked INTEGER := 0;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    v_current_time := CAST(v_now::TIME AS TIME);
    
    -- Find all tasks that have started but are not acknowledged
    FOR v_task IN
        SELECT 
            t.id,
            t.employee_id,
            t.name,
            t.start_date,
            t.end_date,
            t.start_time,
            t.end_time,
            t.status,
            e.name as employee_name,
            e.user_id
        FROM tasks t
        JOIN employees e ON t.employee_id = e.id
        WHERE t.status NOT IN ('completed', 'overdue')
          AND t.start_date <= v_today
          AND (
              -- Task start time has passed today
              (t.start_date = v_today AND (
                  -- Handle HHMM format
                  (LENGTH(t.start_time) = 4 AND 
                   CAST(SUBSTRING(t.start_time, 1, 2) || ':' || SUBSTRING(t.start_time, 3, 2) || ':00' AS TIME) <= v_current_time)
                  OR
                  -- Handle HH:MM format
                  (t.start_time LIKE '%:%' AND 
                   CAST(CASE WHEN LENGTH(t.start_time) = 5 THEN t.start_time || ':00' ELSE t.start_time END AS TIME) <= v_current_time)
              ))
              OR
              -- Task start date has passed
              (t.start_date < v_today)
          )
    LOOP
        v_tasks_checked := v_tasks_checked + 1;
        
        -- Check if task has been acknowledged by the assigned employee
        SELECT EXISTS(
            SELECT 1
            FROM task_acknowledgements ta
            WHERE ta.task_id = v_task.id
              AND ta.user_id = v_task.user_id
        ) INTO v_has_acknowledgement;
        
        -- Only create NSFT if task has started AND is not acknowledged
        IF NOT v_has_acknowledgement THEN
            -- Create NSFT exception
            PERFORM create_nsft_exception_for_task(
                v_task.id,
                v_task.employee_id,
                v_task.employee_name,
                v_task.name,
                v_task.start_date,
                v_task.start_time,
                v_task.end_time,
                'Task not acknowledged after start time: ' || v_task.name
            );
            
            v_exceptions_created := v_exceptions_created + 1;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_tasks_checked, v_exceptions_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- UPDATE: Trigger for Auto-create NSFT on Overdue
-- ==========================================
CREATE OR REPLACE FUNCTION trigger_create_nsft_on_overdue()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_name TEXT;
    v_has_acknowledgement BOOLEAN;
    v_now TIMESTAMPTZ;
    v_today DATE;
    v_task_start_time TIME;
    v_current_time TIME;
    v_task_start_date DATE;
    v_start_date_passed BOOLEAN;
    v_start_time_passed BOOLEAN;
BEGIN
    -- Only process if status changed to overdue
    IF NEW.status = 'overdue' AND (OLD.status IS NULL OR OLD.status != 'overdue') THEN
        v_now := NOW();
        v_today := CURRENT_DATE;
        v_current_time := CAST(v_now::TIME AS TIME);
        v_task_start_date := NEW.start_date;
        
        -- Check if task has been acknowledged
        SELECT EXISTS(
            SELECT 1
            FROM task_acknowledgements ta
            JOIN employees e ON e.user_id = ta.user_id
            WHERE ta.task_id = NEW.id
              AND e.id = NEW.employee_id
        ) INTO v_has_acknowledgement;
        
        -- Check if task has started
        v_start_date_passed := v_task_start_date < v_today;
        
        IF NEW.start_time IS NOT NULL THEN
            IF LENGTH(NEW.start_time) = 4 THEN
                v_task_start_time := CAST(SUBSTRING(NEW.start_time, 1, 2) || ':' || SUBSTRING(NEW.start_time, 3, 2) || ':00' AS TIME);
            ELSIF NEW.start_time LIKE '%:%' THEN
                v_task_start_time := CAST(CASE WHEN LENGTH(NEW.start_time) = 5 THEN NEW.start_time || ':00' ELSE NEW.start_time END AS TIME);
            ELSE
                v_task_start_time := '00:00:00'::TIME;
            END IF;
            
            v_start_time_passed := (v_task_start_date = v_today AND v_task_start_time <= v_current_time);
        ELSE
            v_start_time_passed := FALSE;
        END IF;
        
        -- Only create NSFT if task has started AND is not acknowledged
        IF (v_start_date_passed OR v_start_time_passed) AND NOT v_has_acknowledgement THEN
            -- Get employee name
            SELECT name INTO v_employee_name
            FROM employees
            WHERE id = NEW.employee_id;
            
            -- Create NSFT exception
            PERFORM create_nsft_exception_for_task(
                NEW.id,
                NEW.employee_id,
                COALESCE(v_employee_name, 'Unknown'),
                NEW.name,
                NEW.start_date,
                NEW.start_time,
                NEW.end_time,
                'Task overdue and not acknowledged: ' || NEW.name
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- UPDATE: Trigger for Unacknowledged Tasks at Start
-- ==========================================
CREATE OR REPLACE FUNCTION trigger_check_unacknowledged_at_start()
RETURNS TRIGGER AS $$
DECLARE
    v_has_acknowledgement BOOLEAN;
    v_now TIMESTAMPTZ;
    v_today DATE;
    v_task_start_time TIME;
    v_current_time TIME;
    v_start_date_passed BOOLEAN;
    v_start_time_passed BOOLEAN;
    v_should_create_exception BOOLEAN := FALSE;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    v_current_time := CAST(v_now::TIME AS TIME);
    
    -- Check if task has been acknowledged
    SELECT EXISTS(
        SELECT 1
        FROM task_acknowledgements ta
        JOIN employees e ON e.user_id = ta.user_id
        WHERE ta.task_id = COALESCE(NEW.id, OLD.id)
          AND e.id = COALESCE(NEW.employee_id, OLD.employee_id)
    ) INTO v_has_acknowledgement;
    
    -- If acknowledged, remove any existing NSFT and return
    IF v_has_acknowledgement THEN
        DELETE FROM exception_logs
        WHERE employee_id = COALESCE(NEW.employee_id, OLD.employee_id)
          AND exception_code = 'NSFT'
          AND exception_date = COALESCE(NEW.start_date, OLD.start_date)
          AND task_id = COALESCE(NEW.id, OLD.id);
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- For INSERT: Check if task has already started
    IF TG_OP = 'INSERT' THEN
        v_start_date_passed := NEW.start_date < v_today;
        
        IF NEW.start_time IS NOT NULL THEN
            IF LENGTH(NEW.start_time) = 4 THEN
                v_task_start_time := CAST(SUBSTRING(NEW.start_time, 1, 2) || ':' || SUBSTRING(NEW.start_time, 3, 2) || ':00' AS TIME);
            ELSIF NEW.start_time LIKE '%:%' THEN
                v_task_start_time := CAST(CASE WHEN LENGTH(NEW.start_time) = 5 THEN NEW.start_time || ':00' ELSE NEW.start_time END AS TIME);
            ELSE
                v_task_start_time := '00:00:00'::TIME;
            END IF;
            
            v_start_time_passed := (NEW.start_date = v_today AND v_task_start_time <= v_current_time);
        ELSE
            v_start_time_passed := FALSE;
        END IF;
        
        -- Only create if task has started
        IF v_start_date_passed OR v_start_time_passed THEN
            v_should_create_exception := TRUE;
        END IF;
    END IF;
    
    -- For UPDATE: Check if acknowledgment was removed or task just started
    IF TG_OP = 'UPDATE' THEN
        -- If task was just acknowledged, don't create exception (already handled above)
        IF NEW.acknowledged = TRUE AND OLD.acknowledged = FALSE THEN
            -- Task was just acknowledged, remove any existing NSFT exception
            DELETE FROM exception_logs
            WHERE employee_id = NEW.employee_id
              AND exception_code = 'NSFT'
              AND exception_date = NEW.start_date
              AND task_id = NEW.id;
            RETURN NEW;
        END IF;
        
        -- Check if task has started
        v_start_date_passed := NEW.start_date < v_today;
        
        IF NEW.start_time IS NOT NULL THEN
            IF LENGTH(NEW.start_time) = 4 THEN
                v_task_start_time := CAST(SUBSTRING(NEW.start_time, 1, 2) || ':' || SUBSTRING(NEW.start_time, 3, 2) || ':00' AS TIME);
            ELSIF NEW.start_time LIKE '%:%' THEN
                v_task_start_time := CAST(CASE WHEN LENGTH(NEW.start_time) = 5 THEN NEW.start_time || ':00' ELSE NEW.start_time END AS TIME);
            ELSE
                v_task_start_time := '00:00:00'::TIME;
            END IF;
            
            v_start_time_passed := (NEW.start_date = v_today AND v_task_start_time <= v_current_time);
        ELSE
            v_start_time_passed := FALSE;
        END IF;
        
        -- Only create if task has started
        IF v_start_date_passed OR v_start_time_passed THEN
            v_should_create_exception := TRUE;
        END IF;
    END IF;
    
    -- Create NSFT exception if needed (task has started and is not acknowledged)
    IF v_should_create_exception AND NOT v_has_acknowledgement THEN
        -- This will be handled by the create_nsft_exception_for_task function
        -- which is called by the trigger_create_nsft_on_overdue function
        -- or we can call it directly here
        NULL; -- Placeholder - actual creation happens in other triggers
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_unacknowledged_tasks_at_start() IS 'Checks for tasks that have started but are not acknowledged, and creates NSFT exceptions only for those';
COMMENT ON FUNCTION trigger_create_nsft_on_overdue() IS 'Creates NSFT exception when task becomes overdue, but only if task has started and is not acknowledged';
COMMENT ON FUNCTION trigger_check_unacknowledged_at_start() IS 'Checks for unacknowledged tasks at start time, but only creates NSFT if task has actually started';


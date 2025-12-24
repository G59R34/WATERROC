-- Fix NSFT Exception Triggers to Work Immediately
-- Run this after add-automatic-nsft-exceptions.sql

-- ==========================================
-- IMPROVED TRIGGER: Check unacknowledged hourly tasks at start time
-- ==========================================
CREATE OR REPLACE FUNCTION trigger_check_unacknowledged_hourly_at_start()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_name TEXT;
    v_now TIMESTAMP;
    v_today DATE;
    v_should_create_exception BOOLEAN := FALSE;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    
    -- For INSERT: Check if task has already started
    IF TG_OP = 'INSERT' THEN
        IF NEW.task_date <= v_today 
           AND NOT NEW.acknowledged
           AND NEW.status NOT IN ('completed', 'overdue')
           AND (
               -- Task start time has passed today
               (NEW.task_date = v_today AND NEW.start_time <= CAST(v_now::TIME AS TIME))
               OR
               -- Task date has passed
               (NEW.task_date < v_today)
           ) THEN
            v_should_create_exception := TRUE;
        END IF;
    END IF;
    
    -- For UPDATE: Check if acknowledgment was removed or task just started
    IF TG_OP = 'UPDATE' THEN
        -- If task was just acknowledged, remove any existing NSFT exception
        IF NEW.acknowledged = TRUE AND (OLD.acknowledged IS NULL OR OLD.acknowledged = FALSE) THEN
            DELETE FROM exception_logs
            WHERE employee_id = NEW.employee_id
              AND exception_code = 'NSFT'
              AND exception_date = NEW.task_date
              AND task_id = NEW.id;
            RETURN NEW;
        END IF;
        
        -- If task has started and is not acknowledged
        IF NEW.task_date <= v_today 
           AND NOT NEW.acknowledged
           AND NEW.status NOT IN ('completed', 'overdue')
           AND (
               -- Task start time has passed today
               (NEW.task_date = v_today AND NEW.start_time <= CAST(v_now::TIME AS TIME))
               OR
               -- Task date has passed
               (NEW.task_date < v_today)
           ) THEN
            v_should_create_exception := TRUE;
        END IF;
    END IF;
    
    -- Create NSFT exception if needed
    IF v_should_create_exception THEN
        -- Check if NSFT exception already exists
        IF NOT EXISTS(
            SELECT 1
            FROM exception_logs
            WHERE employee_id = NEW.employee_id
              AND exception_code = 'NSFT'
              AND exception_date = NEW.task_date
              AND task_id = NEW.id
        ) THEN
            -- Get employee name
            SELECT name INTO v_employee_name
            FROM employees
            WHERE id = NEW.employee_id;
            
            -- Create NSFT exception
            PERFORM create_nsft_exception_for_hourly_task(
                NEW.id,
                NEW.employee_id,
                COALESCE(v_employee_name, 'Unknown'),
                NEW.name,
                NEW.task_date,
                NEW.start_time,
                NEW.end_time,
                'Hourly task not acknowledged at start time: ' || NEW.name
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger with better column specification
DROP TRIGGER IF EXISTS check_unacknowledged_hourly_at_start ON hourly_tasks;
CREATE TRIGGER check_unacknowledged_hourly_at_start
    AFTER INSERT OR UPDATE OF acknowledged, task_date, start_time, status ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_unacknowledged_hourly_at_start();

-- ==========================================
-- TRIGGER: Check unacknowledged regular tasks at start time (on INSERT)
-- ==========================================
CREATE OR REPLACE FUNCTION trigger_check_unacknowledged_task_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_name TEXT;
    v_now TIMESTAMP;
    v_today DATE;
    v_has_acknowledgement BOOLEAN;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    
    -- If task is inserted and has already started, check acknowledgment immediately
    IF NEW.start_date <= v_today 
       AND NEW.status NOT IN ('completed', 'overdue')
       AND (
           (NEW.start_date = v_today AND (
               (LENGTH(NEW.start_time) = 4 AND 
                CAST(SUBSTRING(NEW.start_time, 1, 2) || ':' || SUBSTRING(NEW.start_time, 3, 2) || ':00' AS TIME) <= 
                CAST(v_now::TIME AS TIME))
               OR
               (NEW.start_time LIKE '%:%' AND 
                CAST(CASE WHEN LENGTH(NEW.start_time) = 5 THEN NEW.start_time || ':00' ELSE NEW.start_time END AS TIME) <= 
                CAST(v_now::TIME AS TIME))
           ))
           OR
           (NEW.start_date < v_today)
       ) THEN
        -- Check if task has been acknowledged
        SELECT EXISTS(
            SELECT 1
            FROM task_acknowledgements ta
            JOIN employees e ON e.user_id = ta.user_id
            WHERE ta.task_id = NEW.id
              AND e.id = NEW.employee_id
        ) INTO v_has_acknowledgement;
        
        -- If not acknowledged, create NSFT exception immediately
        IF NOT v_has_acknowledgement THEN
            -- Get employee name
            SELECT name INTO v_employee_name
            FROM employees
            WHERE id = NEW.employee_id;
            
            -- Create NSFT exception immediately
            PERFORM create_nsft_exception_for_task(
                NEW.id,
                NEW.employee_id,
                COALESCE(v_employee_name, 'Unknown'),
                NEW.name,
                NEW.start_date,
                NEW.start_time,
                NEW.end_time,
                'Task not acknowledged at start time: ' || NEW.name
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_unacknowledged_task_on_insert ON tasks;
CREATE TRIGGER check_unacknowledged_task_on_insert
    AFTER INSERT ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_unacknowledged_task_on_insert();

-- ==========================================
-- FUNCTION: Manually trigger NSFT checks (for testing and immediate execution)
-- ==========================================
CREATE OR REPLACE FUNCTION trigger_nsft_checks_now()
RETURNS TABLE (
    overdue_tasks_marked INTEGER,
    overdue_hourly_tasks_marked INTEGER,
    unacknowledged_exceptions INTEGER,
    unacknowledged_hourly_exceptions INTEGER
) AS $$
DECLARE
    v_overdue_regular RECORD;
    v_overdue_hourly RECORD;
    v_unack_regular INTEGER;
    v_unack_hourly INTEGER;
BEGIN
    -- Check and mark overdue regular tasks
    SELECT * INTO v_overdue_regular FROM check_and_mark_overdue_tasks();
    
    -- Check and mark overdue hourly tasks
    SELECT * INTO v_overdue_hourly FROM check_and_mark_overdue_hourly_tasks();
    
    -- Check unacknowledged regular tasks
    SELECT exceptions_created INTO v_unack_regular FROM check_unacknowledged_tasks_at_start();
    
    -- Check unacknowledged hourly tasks
    SELECT exceptions_created INTO v_unack_hourly FROM check_unacknowledged_hourly_tasks_at_start();
    
    RETURN QUERY SELECT 
        COALESCE(v_overdue_regular.tasks_marked, 0),
        COALESCE(v_overdue_hourly.tasks_marked, 0),
        COALESCE(v_unack_regular, 0),
        COALESCE(v_unack_hourly, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_nsft_checks_now IS 'Manually trigger all NSFT exception checks immediately - useful for testing or immediate execution';


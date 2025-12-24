-- Complete Fix for NSFT Exception Creation
-- This addresses all potential issues with NSFT exception creation

-- ==========================================
-- STEP 1: Ensure exception_logs table allows SYSTEM inserts
-- ==========================================
-- Check if there are RLS policies blocking SYSTEM inserts
-- Note: You may need to adjust RLS policies if they're blocking SYSTEM inserts

-- ==========================================
-- STEP 2: Fix the create_nsft_exception_for_task function
-- Use SECURITY DEFINER to bypass RLS policies
-- ==========================================
CREATE OR REPLACE FUNCTION create_nsft_exception_for_task(
    p_task_id BIGINT,
    p_employee_id INTEGER,
    p_employee_name TEXT,
    p_task_name TEXT,
    p_task_date DATE,
    p_start_time TEXT,
    p_end_time TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_exception_date DATE;
    v_start_time_formatted TIME;
    v_end_time_formatted TIME;
    v_existing_exception_id BIGINT;
BEGIN
    -- Use task date for exception date
    v_exception_date := p_task_date;
    
    -- Format time from HHMM to HH:MM:SS
    IF p_start_time IS NOT NULL AND LENGTH(p_start_time) = 4 THEN
        v_start_time_formatted := CAST(SUBSTRING(p_start_time, 1, 2) || ':' || SUBSTRING(p_start_time, 3, 2) || ':00' AS TIME);
    ELSIF p_start_time IS NOT NULL AND p_start_time LIKE '%:%' THEN
        IF LENGTH(p_start_time) = 5 THEN
            v_start_time_formatted := CAST(p_start_time || ':00' AS TIME);
        ELSE
            v_start_time_formatted := CAST(p_start_time AS TIME);
        END IF;
    ELSE
        v_start_time_formatted := '00:00:00'::TIME;
    END IF;
    
    IF p_end_time IS NOT NULL AND LENGTH(p_end_time) = 4 THEN
        v_end_time_formatted := CAST(SUBSTRING(p_end_time, 1, 2) || ':' || SUBSTRING(p_end_time, 3, 2) || ':00' AS TIME);
    ELSIF p_end_time IS NOT NULL AND p_end_time LIKE '%:%' THEN
        IF LENGTH(p_end_time) = 5 THEN
            v_end_time_formatted := CAST(p_end_time || ':00' AS TIME);
        ELSE
            v_end_time_formatted := CAST(p_end_time AS TIME);
        END IF;
    ELSE
        v_end_time_formatted := '23:59:59'::TIME;
    END IF;
    
    -- Check if NSFT exception already exists for this task
    SELECT id INTO v_existing_exception_id
    FROM exception_logs
    WHERE employee_id = p_employee_id
      AND exception_code = 'NSFT'
      AND exception_date = v_exception_date
      AND task_id = p_task_id
    LIMIT 1;
    
    -- If exception already exists, return true
    IF v_existing_exception_id IS NOT NULL THEN
        RAISE NOTICE 'NSFT exception already exists for task %', p_task_id;
        RETURN TRUE;
    END IF;
    
    -- Create NSFT exception log
    BEGIN
        INSERT INTO exception_logs (
            employee_id,
            employee_name,
            exception_code,
            exception_date,
            start_time,
            end_time,
            reason,
            approved_by,
            approved_at,
            task_id,
            additional_data,
            created_by
        ) VALUES (
            p_employee_id,
            p_employee_name,
            'NSFT',
            v_exception_date,
            v_start_time_formatted,
            v_end_time_formatted,
            COALESCE(p_reason, 'Task not acknowledged: ' || p_task_name),
            'SYSTEM',
            NOW(),
            p_task_id,
            jsonb_build_object(
                'task_name', p_task_name,
                'task_start_time', p_start_time,
                'task_end_time', p_end_time,
                'auto_created', TRUE
            ),
            'SYSTEM'
        );
        
        RAISE NOTICE 'Created NSFT exception for task % (employee: %)', p_task_id, p_employee_name;
        RETURN TRUE;
    EXCEPTION
        WHEN OTHERS THEN
        RAISE WARNING 'Error creating NSFT exception for task %: %', p_task_id, SQLERRM;
        RETURN FALSE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- STEP 3: Fix the create_nsft_exception_for_hourly_task function
-- Use SECURITY DEFINER to bypass RLS policies
-- ==========================================
CREATE OR REPLACE FUNCTION create_nsft_exception_for_hourly_task(
    p_task_id BIGINT,
    p_employee_id INTEGER,
    p_employee_name TEXT,
    p_task_name TEXT,
    p_task_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_existing_exception_id BIGINT;
BEGIN
    -- Check if NSFT exception already exists for this task
    SELECT id INTO v_existing_exception_id
    FROM exception_logs
    WHERE employee_id = p_employee_id
      AND exception_code = 'NSFT'
      AND exception_date = p_task_date
      AND task_id = p_task_id
    LIMIT 1;
    
    -- If exception already exists, return true
    IF v_existing_exception_id IS NOT NULL THEN
        RAISE NOTICE 'NSFT exception already exists for hourly task %', p_task_id;
        RETURN TRUE;
    END IF;
    
    -- Create NSFT exception log
    BEGIN
        INSERT INTO exception_logs (
            employee_id,
            employee_name,
            exception_code,
            exception_date,
            start_time,
            end_time,
            reason,
            approved_by,
            approved_at,
            task_id,
            additional_data,
            created_by
        ) VALUES (
            p_employee_id,
            p_employee_name,
            'NSFT',
            p_task_date,
            p_start_time,
            p_end_time,
            COALESCE(p_reason, 'Hourly task not acknowledged: ' || p_task_name),
            'SYSTEM',
            NOW(),
            p_task_id,
            jsonb_build_object(
                'task_name', p_task_name,
                'task_start_time', p_start_time::TEXT,
                'task_end_time', p_end_time::TEXT,
                'auto_created', TRUE,
                'task_type', 'hourly'
            ),
            'SYSTEM'
        );
        
        RAISE NOTICE 'Created NSFT exception for hourly task % (employee: %)', p_task_id, p_employee_name;
        RETURN TRUE;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Error creating NSFT exception for hourly task %: %', p_task_id, SQLERRM;
            RETURN FALSE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- STEP 4: Ensure triggers fire on INSERT for hourly tasks
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
            RAISE NOTICE 'INSERT: Task % has started, checking acknowledgment', NEW.id;
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
            RAISE NOTICE 'UPDATE: Task % acknowledged, removed NSFT exception', NEW.id;
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
            RAISE NOTICE 'UPDATE: Task % has started and not acknowledged', NEW.id;
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
        ELSE
            RAISE NOTICE 'NSFT exception already exists for task %', NEW.id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger with proper column specification
DROP TRIGGER IF EXISTS check_unacknowledged_hourly_at_start ON hourly_tasks;
CREATE TRIGGER check_unacknowledged_hourly_at_start
    AFTER INSERT OR UPDATE OF acknowledged, task_date, start_time, status ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_unacknowledged_hourly_at_start();

-- ==========================================
-- STEP 5: Add trigger for regular tasks on INSERT
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
            
            RAISE NOTICE 'Created NSFT exception for unacknowledged task % at insert', NEW.id;
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
-- STEP 6: Test function to manually trigger checks
-- ==========================================
CREATE OR REPLACE FUNCTION test_nsft_exceptions()
RETURNS TABLE (
    message TEXT,
    result TEXT
) AS $$
DECLARE
    v_overdue_regular RECORD;
    v_overdue_hourly RECORD;
    v_unack_regular INTEGER;
    v_unack_hourly INTEGER;
BEGIN
    -- Check and mark overdue regular tasks
    BEGIN
        SELECT * INTO v_overdue_regular FROM check_and_mark_overdue_tasks();
        RETURN QUERY SELECT 'Overdue regular tasks'::TEXT, 
            (v_overdue_regular.tasks_marked || ' marked, ' || v_overdue_regular.exceptions_created || ' exceptions')::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'Error checking overdue regular tasks'::TEXT, SQLERRM::TEXT;
    END;
    
    -- Check and mark overdue hourly tasks
    BEGIN
        SELECT * INTO v_overdue_hourly FROM check_and_mark_overdue_hourly_tasks();
        RETURN QUERY SELECT 'Overdue hourly tasks'::TEXT, 
            (v_overdue_hourly.tasks_marked || ' marked, ' || v_overdue_hourly.exceptions_created || ' exceptions')::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'Error checking overdue hourly tasks'::TEXT, SQLERRM::TEXT;
    END;
    
    -- Check unacknowledged regular tasks
    BEGIN
        SELECT exceptions_created INTO v_unack_regular FROM check_unacknowledged_tasks_at_start();
        RETURN QUERY SELECT 'Unacknowledged regular tasks'::TEXT, (v_unack_regular || ' exceptions created')::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'Error checking unacknowledged regular tasks'::TEXT, SQLERRM::TEXT;
    END;
    
    -- Check unacknowledged hourly tasks
    BEGIN
        SELECT exceptions_created INTO v_unack_hourly FROM check_unacknowledged_hourly_tasks_at_start();
        RETURN QUERY SELECT 'Unacknowledged hourly tasks'::TEXT, (v_unack_hourly || ' exceptions created')::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'Error checking unacknowledged hourly tasks'::TEXT, SQLERRM::TEXT;
    END;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION test_nsft_exceptions IS 'Test function to check all NSFT exception creation - run SELECT * FROM test_nsft_exceptions();';


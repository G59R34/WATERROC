-- Automatic NSFT Exception Creation for Overdue and Unacknowledged Tasks
-- This creates database-level triggers and functions to automatically create NSFT exceptions

-- ==========================================
-- FUNCTION: Create NSFT Exception for a Task
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
        RETURN TRUE;
    END IF;
    
    -- Create NSFT exception log
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
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error creating NSFT exception for task %: %', p_task_id, SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- FUNCTION: Check and Mark Overdue Tasks
-- ==========================================
CREATE OR REPLACE FUNCTION check_and_mark_overdue_tasks()
RETURNS TABLE (
    tasks_marked INTEGER,
    exceptions_created INTEGER
) AS $$
DECLARE
    v_task RECORD;
    v_employee_name TEXT;
    v_now TIMESTAMP;
    v_today DATE;
    v_task_end_datetime TIMESTAMP;
    v_marked_count INTEGER := 0;
    v_exception_count INTEGER := 0;
    v_start_time_formatted TIME;
    v_end_time_formatted TIME;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    
    -- Find all tasks that should be marked as overdue
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
            e.name as employee_name
        FROM tasks t
        JOIN employees e ON t.employee_id = e.id
        WHERE t.status NOT IN ('completed', 'overdue')
          AND (
              -- Task end date has passed
              t.end_date < v_today
              OR
              -- Task end time has passed today
              (t.end_date = v_today AND (
                  -- Handle HHMM format
                  (LENGTH(t.end_time) = 4 AND 
                   CAST(SUBSTRING(t.end_time, 1, 2) || ':' || SUBSTRING(t.end_time, 3, 2) || ':00' AS TIME) < 
                   CAST(v_now::TIME AS TIME))
                  OR
                  -- Handle HH:MM format
                  (t.end_time LIKE '%:%' AND 
                   CAST(CASE WHEN LENGTH(t.end_time) = 5 THEN t.end_time || ':00' ELSE t.end_time END AS TIME) < 
                   CAST(v_now::TIME AS TIME))
              ))
          )
    LOOP
        -- Mark task as overdue
        UPDATE tasks
        SET status = 'overdue',
            updated_at = NOW()
        WHERE id = v_task.id;
        
        v_marked_count := v_marked_count + 1;
        
        -- Create NSFT exception
        IF create_nsft_exception_for_task(
            v_task.id,
            v_task.employee_id,
            v_task.employee_name,
            v_task.name,
            v_task.end_date,
            v_task.start_time,
            v_task.end_time,
            'Task overdue: ' || v_task.name
        ) THEN
            v_exception_count := v_exception_count + 1;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_marked_count, v_exception_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- FUNCTION: Check Unacknowledged Tasks at Start Time
-- ==========================================
CREATE OR REPLACE FUNCTION check_unacknowledged_tasks_at_start()
RETURNS TABLE (
    exceptions_created INTEGER
) AS $$
DECLARE
    v_task RECORD;
    v_now TIMESTAMP;
    v_today DATE;
    v_task_start_datetime TIMESTAMP;
    v_exception_count INTEGER := 0;
    v_has_acknowledgement BOOLEAN;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    
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
                   CAST(SUBSTRING(t.start_time, 1, 2) || ':' || SUBSTRING(t.start_time, 3, 2) || ':00' AS TIME) <= 
                   CAST(v_now::TIME AS TIME))
                  OR
                  -- Handle HH:MM format
                  (t.start_time LIKE '%:%' AND 
                   CAST(CASE WHEN LENGTH(t.start_time) = 5 THEN t.start_time || ':00' ELSE t.start_time END AS TIME) <= 
                   CAST(v_now::TIME AS TIME))
              ))
              OR
              -- Task start date has passed
              (t.start_date < v_today)
          )
    LOOP
        -- Check if task has been acknowledged by the assigned employee
        SELECT EXISTS(
            SELECT 1
            FROM task_acknowledgements ta
            WHERE ta.task_id = v_task.id
              AND ta.user_id = v_task.user_id
        ) INTO v_has_acknowledgement;
        
        -- If not acknowledged, create NSFT exception
        IF NOT v_has_acknowledgement THEN
            -- Check if NSFT exception already exists
            IF NOT EXISTS(
                SELECT 1
                FROM exception_logs
                WHERE employee_id = v_task.employee_id
                  AND exception_code = 'NSFT'
                  AND exception_date = v_task.start_date
                  AND task_id = v_task.id
            ) THEN
                -- Create NSFT exception
                IF create_nsft_exception_for_task(
                    v_task.id,
                    v_task.employee_id,
                    v_task.employee_name,
                    v_task.name,
                    v_task.start_date,
                    v_task.start_time,
                    v_task.end_time,
                    'Task not acknowledged at start time: ' || v_task.name
                ) THEN
                    v_exception_count := v_exception_count + 1;
                END IF;
            END IF;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_exception_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- TRIGGER: Auto-mark overdue when task is updated
-- ==========================================
CREATE OR REPLACE FUNCTION trigger_check_overdue_on_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check if status is not already overdue or completed
    IF NEW.status NOT IN ('completed', 'overdue') THEN
        -- Check if task should be overdue
        IF (NEW.end_date < CURRENT_DATE) OR
           (NEW.end_date = CURRENT_DATE AND 
            ((LENGTH(NEW.end_time) = 4 AND 
              CAST(SUBSTRING(NEW.end_time, 1, 2) || ':' || SUBSTRING(NEW.end_time, 3, 2) || ':00' AS TIME) < 
              CAST(NOW()::TIME AS TIME)) OR
             (NEW.end_time LIKE '%:%' AND 
              CAST(CASE WHEN LENGTH(NEW.end_time) = 5 THEN NEW.end_time || ':00' ELSE NEW.end_time END AS TIME) < 
              CAST(NOW()::TIME AS TIME)))) THEN
            NEW.status := 'overdue';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_overdue_on_task_update ON tasks;
CREATE TRIGGER check_overdue_on_task_update
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_overdue_on_update();

-- ==========================================
-- TRIGGER: Auto-create NSFT when task becomes overdue
-- ==========================================
CREATE OR REPLACE FUNCTION trigger_create_nsft_on_overdue()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_name TEXT;
BEGIN
    -- Only process if status changed to overdue
    IF NEW.status = 'overdue' AND (OLD.status IS NULL OR OLD.status != 'overdue') THEN
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
            NEW.end_date,
            NEW.start_time,
            NEW.end_time,
            'Task overdue: ' || NEW.name
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_nsft_on_overdue ON tasks;
CREATE TRIGGER create_nsft_on_overdue
    AFTER UPDATE OF status ON tasks
    FOR EACH ROW
    WHEN (NEW.status = 'overdue' AND (OLD.status IS NULL OR OLD.status != 'overdue'))
    EXECUTE FUNCTION trigger_create_nsft_on_overdue();

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
-- SCHEDULED FUNCTION: Run periodic checks
-- ==========================================
-- Note: Supabase uses pg_cron extension for scheduled jobs
-- You may need to enable it: CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule to check for overdue tasks every minute
-- SELECT cron.schedule(
--     'check-overdue-tasks',
--     '* * * * *', -- Every minute
--     $$SELECT check_and_mark_overdue_tasks();$$
-- );

-- Schedule to check for unacknowledged tasks every minute
-- SELECT cron.schedule(
--     'check-unacknowledged-tasks',
--     '* * * * *', -- Every minute
--     $$SELECT check_unacknowledged_tasks_at_start();$$
-- );

-- ==========================================
-- MANUAL EXECUTION FUNCTIONS
-- ==========================================
-- You can call these manually or from your application:
-- SELECT * FROM check_and_mark_overdue_tasks();
-- SELECT * FROM check_unacknowledged_tasks_at_start();

-- ==========================================
-- COMMENTS
-- ==========================================
COMMENT ON FUNCTION create_nsft_exception_for_task IS 'Creates an NSFT exception log for a specific task';
COMMENT ON FUNCTION check_and_mark_overdue_tasks IS 'Checks for overdue tasks and automatically marks them, creating NSFT exceptions';
COMMENT ON FUNCTION check_unacknowledged_tasks_at_start IS 'Checks for unacknowledged tasks at their start time and creates NSFT exceptions';
COMMENT ON FUNCTION trigger_check_overdue_on_update IS 'Trigger function that automatically marks tasks as overdue when they pass their end time';
COMMENT ON FUNCTION trigger_create_nsft_on_overdue IS 'Trigger function that creates NSFT exceptions when a task status changes to overdue';

-- ==========================================
-- HOURLY TASKS FUNCTIONS AND TRIGGERS
-- ==========================================

-- ==========================================
-- FUNCTION: Create NSFT Exception for an Hourly Task
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
        RETURN TRUE;
    END IF;
    
    -- Create NSFT exception log
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
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error creating NSFT exception for hourly task %: %', p_task_id, SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- FUNCTION: Check and Mark Overdue Hourly Tasks
-- ==========================================
CREATE OR REPLACE FUNCTION check_and_mark_overdue_hourly_tasks()
RETURNS TABLE (
    tasks_marked INTEGER,
    exceptions_created INTEGER
) AS $$
DECLARE
    v_task RECORD;
    v_now TIMESTAMP;
    v_today DATE;
    v_marked_count INTEGER := 0;
    v_exception_count INTEGER := 0;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    
    -- Find all hourly tasks that should be marked as overdue
    FOR v_task IN
        SELECT 
            t.id,
            t.employee_id,
            t.name,
            t.task_date,
            t.start_time,
            t.end_time,
            t.status,
            e.name as employee_name
        FROM hourly_tasks t
        JOIN employees e ON t.employee_id = e.id
        WHERE t.status NOT IN ('completed', 'overdue')
          AND (
              -- Task date has passed
              t.task_date < v_today
              OR
              -- Task end time has passed today
              (t.task_date = v_today AND t.end_time < CAST(v_now::TIME AS TIME))
          )
    LOOP
        -- Mark task as overdue
        UPDATE hourly_tasks
        SET status = 'overdue',
            modified_at = NOW()
        WHERE id = v_task.id;
        
        v_marked_count := v_marked_count + 1;
        
        -- Create NSFT exception
        IF create_nsft_exception_for_hourly_task(
            v_task.id,
            v_task.employee_id,
            v_task.employee_name,
            v_task.name,
            v_task.task_date,
            v_task.start_time,
            v_task.end_time,
            'Hourly task overdue: ' || v_task.name
        ) THEN
            v_exception_count := v_exception_count + 1;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_marked_count, v_exception_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- FUNCTION: Check Unacknowledged Hourly Tasks at Start Time
-- ==========================================
CREATE OR REPLACE FUNCTION check_unacknowledged_hourly_tasks_at_start()
RETURNS TABLE (
    exceptions_created INTEGER
) AS $$
DECLARE
    v_task RECORD;
    v_now TIMESTAMP;
    v_today DATE;
    v_exception_count INTEGER := 0;
    v_has_acknowledgement BOOLEAN;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    
    -- Find all hourly tasks that have started but are not acknowledged
    FOR v_task IN
        SELECT 
            t.id,
            t.employee_id,
            t.name,
            t.task_date,
            t.start_time,
            t.end_time,
            t.status,
            t.acknowledged,
            e.name as employee_name,
            e.user_id
        FROM hourly_tasks t
        JOIN employees e ON t.employee_id = e.id
        WHERE t.status NOT IN ('completed', 'overdue')
          AND t.task_date <= v_today
          AND (
              -- Task start time has passed today
              (t.task_date = v_today AND t.start_time <= CAST(v_now::TIME AS TIME))
              OR
              -- Task date has passed
              (t.task_date < v_today)
          )
    LOOP
        -- Check if task has been acknowledged
        IF NOT v_task.acknowledged THEN
            -- Check if NSFT exception already exists
            IF NOT EXISTS(
                SELECT 1
                FROM exception_logs
                WHERE employee_id = v_task.employee_id
                  AND exception_code = 'NSFT'
                  AND exception_date = v_task.task_date
                  AND task_id = v_task.id
            ) THEN
                -- Create NSFT exception
                IF create_nsft_exception_for_hourly_task(
                    v_task.id,
                    v_task.employee_id,
                    v_task.employee_name,
                    v_task.name,
                    v_task.task_date,
                    v_task.start_time,
                    v_task.end_time,
                    'Hourly task not acknowledged at start time: ' || v_task.name
                ) THEN
                    v_exception_count := v_exception_count + 1;
                END IF;
            END IF;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_exception_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- TRIGGER: Auto-mark overdue when hourly task is updated
-- ==========================================
CREATE OR REPLACE FUNCTION trigger_check_overdue_on_hourly_task_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check if status is not already overdue or completed
    IF NEW.status NOT IN ('completed', 'overdue') THEN
        -- Check if task should be overdue
        IF (NEW.task_date < CURRENT_DATE) OR
           (NEW.task_date = CURRENT_DATE AND NEW.end_time < CAST(NOW()::TIME AS TIME)) THEN
            NEW.status := 'overdue';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_overdue_on_hourly_task_update ON hourly_tasks;
CREATE TRIGGER check_overdue_on_hourly_task_update
    BEFORE UPDATE ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_overdue_on_hourly_task_update();

-- ==========================================
-- TRIGGER: Auto-create NSFT when hourly task becomes overdue
-- ==========================================
CREATE OR REPLACE FUNCTION trigger_create_nsft_on_hourly_overdue()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_name TEXT;
BEGIN
    -- Only process if status changed to overdue
    IF NEW.status = 'overdue' AND (OLD.status IS NULL OR OLD.status != 'overdue') THEN
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
            'Hourly task overdue: ' || NEW.name
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_nsft_on_hourly_overdue ON hourly_tasks;
CREATE TRIGGER create_nsft_on_hourly_overdue
    AFTER UPDATE OF status ON hourly_tasks
    FOR EACH ROW
    WHEN (NEW.status = 'overdue' AND (OLD.status IS NULL OR OLD.status != 'overdue'))
    EXECUTE FUNCTION trigger_create_nsft_on_hourly_overdue();

-- ==========================================
-- TRIGGER: Auto-create NSFT when hourly task is not acknowledged at start time
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
        -- If task was just acknowledged, don't create exception
        IF NEW.acknowledged = TRUE AND OLD.acknowledged = FALSE THEN
            -- Task was just acknowledged, remove any existing NSFT exception
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

DROP TRIGGER IF EXISTS check_unacknowledged_hourly_at_start ON hourly_tasks;
CREATE TRIGGER check_unacknowledged_hourly_at_start
    AFTER INSERT OR UPDATE OF acknowledged, task_date, start_time, status ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_unacknowledged_hourly_at_start();

-- ==========================================
-- TRIGGER: Check unacknowledged tasks on INSERT (immediate check)
-- ==========================================
CREATE OR REPLACE FUNCTION trigger_check_unacknowledged_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_name TEXT;
    v_now TIMESTAMP;
    v_today DATE;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    
    -- If task is inserted and has already started, check acknowledgment immediately
    IF NEW.task_date <= v_today 
       AND NOT NEW.acknowledged
       AND NEW.status NOT IN ('completed', 'overdue')
       AND (
           (NEW.task_date = v_today AND NEW.start_time <= CAST(v_now::TIME AS TIME))
           OR
           (NEW.task_date < v_today)
       ) THEN
        -- Get employee name
        SELECT name INTO v_employee_name
        FROM employees
        WHERE id = NEW.employee_id;
        
        -- Create NSFT exception immediately
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
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_unacknowledged_on_insert ON hourly_tasks;
CREATE TRIGGER check_unacknowledged_on_insert
    AFTER INSERT ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_unacknowledged_on_insert();

-- ==========================================
-- UPDATED SCHEDULED FUNCTIONS (Include hourly tasks)
-- ==========================================
-- Schedule to check for overdue tasks (both regular and hourly) every minute
-- SELECT cron.schedule(
--     'check-overdue-tasks-all',
--     '* * * * *', -- Every minute
--     $$SELECT check_and_mark_overdue_tasks(); SELECT check_and_mark_overdue_hourly_tasks();$$
-- );

-- Schedule to check for unacknowledged tasks (both regular and hourly) every minute
-- SELECT cron.schedule(
--     'check-unacknowledged-tasks-all',
--     '* * * * *', -- Every minute
--     $$SELECT check_unacknowledged_tasks_at_start(); SELECT check_unacknowledged_hourly_tasks_at_start();$$
-- );

-- ==========================================
-- UPDATED COMMENTS
-- ==========================================
COMMENT ON FUNCTION create_nsft_exception_for_hourly_task IS 'Creates an NSFT exception log for a specific hourly task';
COMMENT ON FUNCTION check_and_mark_overdue_hourly_tasks IS 'Checks for overdue hourly tasks and automatically marks them, creating NSFT exceptions';
COMMENT ON FUNCTION check_unacknowledged_hourly_tasks_at_start IS 'Checks for unacknowledged hourly tasks at their start time and creates NSFT exceptions';
COMMENT ON FUNCTION trigger_check_overdue_on_hourly_task_update IS 'Trigger function that automatically marks hourly tasks as overdue when they pass their end time';
COMMENT ON FUNCTION trigger_create_nsft_on_hourly_overdue IS 'Trigger function that creates NSFT exceptions when an hourly task status changes to overdue';
COMMENT ON FUNCTION trigger_check_unacknowledged_hourly_at_start IS 'Trigger function that creates NSFT exceptions when hourly tasks are not acknowledged at their start time';


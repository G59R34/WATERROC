-- Fix Hourly Task Overdue Logic
-- ==============================
-- Run this in Supabase SQL Editor to fix the issue where hourly tasks are marked as overdue before they start

-- ==========================================
-- FIX: Trigger to check overdue on hourly task update
-- ==========================================
-- Only mark as overdue if task has started AND end time has passed

CREATE OR REPLACE FUNCTION trigger_check_overdue_on_hourly_task_update()
RETURNS TRIGGER AS $$
DECLARE
    v_now TIME;
    v_today DATE;
    v_task_start_time TIME;
    v_task_end_time TIME;
    v_start_text TEXT;
    v_end_text TEXT;
BEGIN
    -- Only check if status is not already overdue or completed
    IF NEW.status NOT IN ('completed', 'overdue') THEN
        v_now := CAST(NOW()::TIME AS TIME);
        v_today := CURRENT_DATE;
        
        -- Parse start_time (cast to text first, then convert to TIME)
        -- This handles both VARCHAR and TIME types
        v_start_text := CAST(NEW.start_time AS TEXT);
        v_end_text := CAST(NEW.end_time AS TEXT);
        
        -- Parse start_time
        IF v_start_text LIKE '%:%' THEN
            -- Has colon (HH:MM format)
            v_task_start_time := CAST(v_start_text AS TIME);
        ELSE
            -- No colon (HHMM format) - add colon
            v_task_start_time := CAST(
                SUBSTRING(v_start_text, 1, 2) || ':' || 
                SUBSTRING(v_start_text, 3, 2) || ':00' 
                AS TIME
            );
        END IF;
        
        -- Parse end_time
        IF v_end_text LIKE '%:%' THEN
            -- Has colon (HH:MM format)
            v_task_end_time := CAST(v_end_text AS TIME);
        ELSE
            -- No colon (HHMM format) - add colon
            v_task_end_time := CAST(
                SUBSTRING(v_end_text, 1, 2) || ':' || 
                SUBSTRING(v_end_text, 3, 2) || ':00' 
                AS TIME
            );
        END IF;
        
        -- Check if task should be overdue
        -- Task is overdue if:
        -- 1. Task date has passed, OR
        -- 2. Task date is today AND start time has passed AND end time has passed
        IF (NEW.task_date < v_today) OR
           (NEW.task_date = v_today AND v_task_start_time <= v_now AND v_task_end_time < v_now) THEN
            NEW.status := 'overdue';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- FIX: Function to check and mark overdue hourly tasks
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
    v_current_time TIME;
    v_task_start_time TIME;
    v_task_end_time TIME;
    v_start_text TEXT;
    v_end_text TEXT;
    v_marked_count INTEGER := 0;
    v_exception_count INTEGER := 0;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    v_current_time := CAST(v_now::TIME AS TIME);
    
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
            t.acknowledged,
            e.name as employee_name
        FROM hourly_tasks t
        JOIN employees e ON t.employee_id = e.id
        WHERE t.status NOT IN ('completed', 'overdue')
          AND (
              -- Task date has passed
              t.task_date < v_today
              OR
              -- Task date is today AND start time has passed AND end time has passed
              (t.task_date = v_today AND 
               -- Parse and check start_time (cast to text first to handle both types)
               (CASE 
                   WHEN CAST(t.start_time AS TEXT) LIKE '%:%' THEN CAST(t.start_time AS TIME)
                   ELSE CAST(SUBSTRING(CAST(t.start_time AS TEXT), 1, 2) || ':' || SUBSTRING(CAST(t.start_time AS TEXT), 3, 2) || ':00' AS TIME)
               END) <= v_current_time
               AND
               -- Parse and check end_time (cast to text first to handle both types)
               (CASE 
                   WHEN CAST(t.end_time AS TEXT) LIKE '%:%' THEN CAST(t.end_time AS TIME)
                   ELSE CAST(SUBSTRING(CAST(t.end_time AS TEXT), 1, 2) || ':' || SUBSTRING(CAST(t.end_time AS TEXT), 3, 2) || ':00' AS TIME)
               END) < v_current_time)
          )
    LOOP
        -- Parse times for this task (cast to text first to handle both VARCHAR and TIME types)
        v_start_text := CAST(v_task.start_time AS TEXT);
        v_end_text := CAST(v_task.end_time AS TEXT);
        
        -- Parse start_time
        IF v_start_text LIKE '%:%' THEN
            v_task_start_time := CAST(v_start_text AS TIME);
        ELSE
            v_task_start_time := CAST(
                SUBSTRING(v_start_text, 1, 2) || ':' || 
                SUBSTRING(v_start_text, 3, 2) || ':00' 
                AS TIME
            );
        END IF;
        
        -- Parse end_time
        IF v_end_text LIKE '%:%' THEN
            v_task_end_time := CAST(v_end_text AS TIME);
        ELSE
            v_task_end_time := CAST(
                SUBSTRING(v_end_text, 1, 2) || ':' || 
                SUBSTRING(v_end_text, 3, 2) || ':00' 
                AS TIME
            );
        END IF;
        
        -- Double-check: Only mark as overdue if start time has passed
        IF v_task.task_date < v_today OR
           (v_task.task_date = v_today AND v_task_start_time <= v_current_time AND v_task_end_time < v_current_time) THEN
            
            -- Mark task as overdue
            UPDATE hourly_tasks
            SET status = 'overdue',
                modified_at = NOW()
            WHERE id = v_task.id;
            
            v_marked_count := v_marked_count + 1;
            
            -- Create NSFT exception only if task has started and not acknowledged
            IF v_task.task_date = v_today AND v_task_start_time <= v_current_time AND NOT v_task.acknowledged THEN
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
                        'Hourly task overdue: ' || v_task.name
                    ) THEN
                        v_exception_count := v_exception_count + 1;
                    END IF;
                END IF;
            END IF;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_marked_count, v_exception_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_and_mark_overdue_hourly_tasks() IS 'Marks hourly tasks as overdue only if start time has passed AND end time has passed';

-- ==========================================
-- FIX: Reset incorrectly marked overdue tasks
-- ==========================================
-- Reset tasks that were marked overdue before their start time

UPDATE hourly_tasks
SET status = 'pending',
    modified_at = NOW()
WHERE status = 'overdue'
  AND task_date = CURRENT_DATE
  AND (
      -- Task hasn't started yet (current time < start time)
      -- Cast to text first to handle both VARCHAR and TIME types
      (CASE 
          WHEN CAST(start_time AS TEXT) LIKE '%:%' THEN CAST(start_time AS TIME)
          ELSE CAST(SUBSTRING(CAST(start_time AS TEXT), 1, 2) || ':' || SUBSTRING(CAST(start_time AS TEXT), 3, 2) || ':00' AS TIME)
      END) > CAST(NOW()::TIME AS TIME)
  );

COMMENT ON FUNCTION trigger_check_overdue_on_hourly_task_update() IS 'Only marks hourly tasks as overdue if start time has passed AND end time has passed';


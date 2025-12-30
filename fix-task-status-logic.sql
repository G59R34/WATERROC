-- Fix Task Status Logic
-- =====================
-- Fixes:
-- 1. Tasks should NOT go overdue when acknowledged before start time
-- 2. Tasks should automatically change to 'in-progress' when start time is reached and acknowledged
-- 3. Add function to handle task completion with admin notification

-- ==========================================
-- FIX 1: Update trigger to prevent overdue when acknowledged before start
-- ==========================================

-- First, drop any existing triggers that might be causing issues
DROP TRIGGER IF EXISTS check_overdue_on_hourly_task_update ON hourly_tasks;
DROP TRIGGER IF EXISTS trigger_check_overdue_on_hourly_task_update ON hourly_tasks;

CREATE OR REPLACE FUNCTION trigger_check_overdue_on_hourly_task_update()
RETURNS TRIGGER AS $$
BEGIN
    -- COMPLETELY DISABLE AUTO-OVERDUE IN TRIGGER
    -- Only the periodic check function should mark tasks as overdue
    -- This trigger will ONLY reset incorrectly marked overdue tasks
    
    -- If task is marked overdue but shouldn't be, reset it
    IF NEW.status = 'overdue' AND NEW.task_date = CURRENT_DATE THEN
        DECLARE
            v_now TIME;
            v_task_start_time TIME;
            v_task_end_time TIME;
            v_start_text TEXT;
            v_end_text TEXT;
        BEGIN
            v_now := CAST(NOW()::TIME AS TIME);
            
            -- Parse start_time
            v_start_text := CAST(NEW.start_time AS TEXT);
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
            v_end_text := CAST(NEW.end_time AS TEXT);
            IF v_end_text LIKE '%:%' THEN
                v_task_end_time := CAST(v_end_text AS TIME);
            ELSE
                v_task_end_time := CAST(
                    SUBSTRING(v_end_text, 1, 2) || ':' || 
                    SUBSTRING(v_end_text, 3, 2) || ':00' 
                    AS TIME
                );
            END IF;
            
            -- If start time OR end time hasn't passed, reset to pending
            IF v_task_start_time >= v_now OR v_task_end_time >= v_now THEN
                NEW.status := 'pending';
            END IF;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger to ensure it uses the new function
CREATE TRIGGER trigger_check_overdue_on_hourly_task_update
    BEFORE UPDATE ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_overdue_on_hourly_task_update();

-- ==========================================
-- FIX 2: Function to auto-change to in-progress when start time reached
-- ==========================================

CREATE OR REPLACE FUNCTION auto_update_task_to_in_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_now TIME;
    v_today DATE;
    v_task_start_time TIME;
    v_start_text TEXT;
    v_status_explicitly_changed BOOLEAN;
BEGIN
    -- Check if status was explicitly changed by the user/admin
    -- For UPDATE: If status changed from one value to another, respect that change
    -- For INSERT: OLD.status will be NULL, so we allow auto-logic
    IF TG_OP = 'UPDATE' THEN
        v_status_explicitly_changed := (OLD.status IS DISTINCT FROM NEW.status);
        
        -- If status was explicitly changed, respect that change completely
        IF v_status_explicitly_changed THEN
            -- Status was explicitly changed by user/admin - respect their choice
            RETURN NEW;
        END IF;
    ELSE
        -- For INSERT, allow auto-logic to run
        v_status_explicitly_changed := FALSE;
    END IF;
    
    -- Only process if task is acknowledged and status is pending
    -- Don't auto-change if status was explicitly set
    IF NEW.acknowledged = TRUE AND NEW.status = 'pending' THEN
        v_now := CAST(NOW()::TIME AS TIME);
        v_today := CURRENT_DATE;
        
        -- Parse start_time
        v_start_text := CAST(NEW.start_time AS TEXT);
        IF v_start_text LIKE '%:%' THEN
            v_task_start_time := CAST(v_start_text AS TIME);
        ELSE
            v_task_start_time := CAST(
                SUBSTRING(v_start_text, 1, 2) || ':' || 
                SUBSTRING(v_start_text, 3, 2) || ':00' 
                AS TIME
            );
        END IF;
        
        -- If task date is today and start time has been reached, change to in-progress
        -- But only if status wasn't explicitly changed
        IF NEW.task_date = v_today AND v_task_start_time <= v_now AND NOT v_status_explicitly_changed THEN
            NEW.status := 'in-progress';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto in-progress update
DROP TRIGGER IF EXISTS trigger_auto_in_progress_on_hourly_task_update ON hourly_tasks;
CREATE TRIGGER trigger_auto_in_progress_on_hourly_task_update
    BEFORE UPDATE ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION auto_update_task_to_in_progress();

-- Also trigger on INSERT in case task is created as acknowledged
DROP TRIGGER IF EXISTS trigger_auto_in_progress_on_hourly_task_insert ON hourly_tasks;
CREATE TRIGGER trigger_auto_in_progress_on_hourly_task_insert
    BEFORE INSERT ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION auto_update_task_to_in_progress();

-- ==========================================
-- FIX 3: Function to periodically check and update task statuses
-- ==========================================

CREATE OR REPLACE FUNCTION check_and_update_task_statuses()
RETURNS TABLE (
    tasks_updated_to_in_progress INTEGER,
    tasks_marked_overdue INTEGER
) AS $$
DECLARE
    v_task RECORD;
    v_now TIME;
    v_today DATE;
    v_current_time TIME;
    v_task_start_time TIME;
    v_task_end_time TIME;
    v_start_text TEXT;
    v_end_text TEXT;
    v_in_progress_count INTEGER := 0;
    v_overdue_count INTEGER := 0;
BEGIN
    v_now := NOW();
    v_today := CURRENT_DATE;
    v_current_time := CAST(v_now::TIME AS TIME);
    
    -- Update tasks to in-progress if acknowledged and start time reached
    FOR v_task IN
        SELECT 
            t.id,
            t.employee_id,
            t.name,
            t.task_date,
            t.start_time,
            t.end_time,
            t.status,
            t.acknowledged
        FROM hourly_tasks t
        WHERE t.status = 'pending'
          AND t.acknowledged = TRUE
          AND t.task_date = v_today
    LOOP
        v_start_text := CAST(v_task.start_time AS TEXT);
        IF v_start_text LIKE '%:%' THEN
            v_task_start_time := CAST(v_start_text AS TIME);
        ELSE
            v_task_start_time := CAST(
                SUBSTRING(v_start_text, 1, 2) || ':' || 
                SUBSTRING(v_start_text, 3, 2) || ':00' 
                AS TIME
            );
        END IF;
        
        -- If start time has been reached, update to in-progress
        IF v_task_start_time <= v_current_time THEN
            UPDATE hourly_tasks
            SET status = 'in-progress',
                modified_at = NOW()
            WHERE id = v_task.id;
            v_in_progress_count := v_in_progress_count + 1;
        END IF;
    END LOOP;
    
    -- Mark overdue tasks (existing logic, but respecting acknowledged status)
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
              t.task_date < v_today
              OR
              (t.task_date = v_today AND 
               -- Start time must have PASSED (not just reached)
               (CASE 
                   WHEN CAST(t.start_time AS TEXT) LIKE '%:%' THEN CAST(t.start_time AS TIME)
                   ELSE CAST(SUBSTRING(CAST(t.start_time AS TEXT), 1, 2) || ':' || SUBSTRING(CAST(t.start_time AS TEXT), 3, 2) || ':00' AS TIME)
               END) < v_current_time
               AND
               -- End time must have PASSED
               (CASE 
                   WHEN CAST(t.end_time AS TEXT) LIKE '%:%' THEN CAST(t.end_time AS TIME)
                   ELSE CAST(SUBSTRING(CAST(t.end_time AS TEXT), 1, 2) || ':' || SUBSTRING(CAST(t.end_time AS TEXT), 3, 2) || ':00' AS TIME)
               END) < v_current_time)
          )
    LOOP
        v_start_text := CAST(v_task.start_time AS TEXT);
        v_end_text := CAST(v_task.end_time AS TEXT);
        
        IF v_start_text LIKE '%:%' THEN
            v_task_start_time := CAST(v_start_text AS TIME);
        ELSE
            v_task_start_time := CAST(
                SUBSTRING(v_start_text, 1, 2) || ':' || 
                SUBSTRING(v_start_text, 3, 2) || ':00' 
                AS TIME
            );
        END IF;
        
        IF v_end_text LIKE '%:%' THEN
            v_task_end_time := CAST(v_end_text AS TIME);
        ELSE
            v_task_end_time := CAST(
                SUBSTRING(v_end_text, 1, 2) || ':' || 
                SUBSTRING(v_end_text, 3, 2) || ':00' 
                AS TIME
            );
        END IF;
        
        -- Only mark overdue if BOTH start time AND end time have passed
        -- Critical: start time must be LESS than current time (has passed)
        IF v_task.task_date < v_today OR
           (v_task.task_date = v_today AND v_task_start_time < v_current_time AND v_task_end_time < v_current_time) THEN
            UPDATE hourly_tasks
            SET status = 'overdue',
                modified_at = NOW()
            WHERE id = v_task.id;
            v_overdue_count := v_overdue_count + 1;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_in_progress_count, v_overdue_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- Create table for task completion notifications (admin alerts)
-- ==========================================

CREATE TABLE IF NOT EXISTS task_completion_notifications (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES hourly_tasks(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    task_name TEXT NOT NULL,
    task_date DATE NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_completion_notifications_status ON task_completion_notifications(status);
CREATE INDEX IF NOT EXISTS idx_task_completion_notifications_task_id ON task_completion_notifications(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completion_notifications_employee_id ON task_completion_notifications(employee_id);

-- RLS Policies for task_completion_notifications
ALTER TABLE task_completion_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can view own completion notifications" ON task_completion_notifications;
CREATE POLICY "Employees can view own completion notifications" ON task_completion_notifications
    FOR SELECT
    TO authenticated
    USING (
        employee_id IN (
            SELECT id FROM employees WHERE user_id IN (
                SELECT id FROM users WHERE auth_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Admins can manage completion notifications" ON task_completion_notifications;
CREATE POLICY "Admins can manage completion notifications" ON task_completion_notifications
    FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = TRUE)
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = TRUE)
    );

COMMENT ON TABLE task_completion_notifications IS 'Stores notifications when employees mark tasks as completed, requiring admin review';

-- ==========================================
-- Reset incorrectly marked overdue tasks
-- ==========================================
-- Reset tasks that were marked overdue before their start time or end time

UPDATE hourly_tasks
SET status = 'pending',
    modified_at = NOW()
WHERE status = 'overdue'
  AND task_date = CURRENT_DATE
  AND (
      -- Task hasn't started yet (current time < start time) - use > not >=
      (CASE 
          WHEN CAST(start_time AS TEXT) LIKE '%:%' THEN CAST(start_time AS TIME)
          ELSE CAST(SUBSTRING(CAST(start_time AS TEXT), 1, 2) || ':' || SUBSTRING(CAST(start_time AS TEXT), 3, 2) || ':00' AS TIME)
      END) > CAST(NOW()::TIME AS TIME)
      OR
      -- Task has started but hasn't ended yet (current time < end time) - use > not >=
      (CASE 
          WHEN CAST(end_time AS TEXT) LIKE '%:%' THEN CAST(end_time AS TIME)
          ELSE CAST(SUBSTRING(CAST(end_time AS TEXT), 1, 2) || ':' || SUBSTRING(CAST(end_time AS TEXT), 3, 2) || ':00' AS TIME)
      END) > CAST(NOW()::TIME AS TIME)
  );


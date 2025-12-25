-- Fix create_nsft_exception_for_task Function Signature
-- The function is being called with VARCHAR types but expects TEXT
-- This ensures the function accepts both TEXT and VARCHAR

-- Drop and recreate with proper type casting
DROP FUNCTION IF EXISTS create_nsft_exception_for_task(BIGINT, INTEGER, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_nsft_exception_for_task(BIGINT, INTEGER, VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_nsft_exception_for_task(BIGINT, INTEGER, VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR) CASCADE;

 -- Recreate with correct parameter types
-- employees.id is BIGINT, and VARCHAR columns will auto-cast to TEXT
CREATE OR REPLACE FUNCTION create_nsft_exception_for_task(
    p_task_id BIGINT,
    p_employee_id BIGINT,  -- Changed to BIGINT to match employees.id type (BIGSERIAL)
    p_employee_name TEXT,  -- Will accept VARCHAR via implicit cast
    p_task_name TEXT,      -- Will accept VARCHAR via implicit cast
    p_task_date DATE,
    p_start_time TEXT,      -- Will accept VARCHAR(4) via implicit cast
    p_end_time TEXT,        -- Will accept VARCHAR(4) via implicit cast
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
    
    -- Format time from HHMM or HH:MM to HH:MM:SS
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
        
        RETURN TRUE;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Error creating NSFT exception for task %: %', p_task_id, SQLERRM;
            RETURN FALSE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_nsft_exception_for_task IS 'Creates an NSFT exception for a task that has started but is not acknowledged';


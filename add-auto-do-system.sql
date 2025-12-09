-- Automatic Day Off (DO) Exception System
-- This system automatically creates DO exception logs for employees without shifts each day
-- When a shift is assigned, the DO is automatically removed

-- Function to check and create DO exceptions for employees without shifts on a given date
CREATE OR REPLACE FUNCTION auto_apply_do_exceptions()
RETURNS void AS $$
DECLARE
    target_date DATE := CURRENT_DATE;
    emp RECORD;
    existing_shift INTEGER;
    existing_exception INTEGER;
BEGIN
    -- For each active employee
    FOR emp IN 
        SELECT id, name 
        FROM employees 
        WHERE status = 'active' OR status IS NULL
    LOOP
        -- Check if employee has a shift on target date
        SELECT COUNT(*) INTO existing_shift
        FROM employee_shifts
        WHERE employee_id = emp.id 
        AND shift_date = target_date;
        
        -- Check if there's already an exception log for this date
        SELECT COUNT(*) INTO existing_exception
        FROM exception_logs
        WHERE employee_id = emp.id 
        AND exception_date = target_date
        AND exception_code = 'DO';
        
        -- If no shift and no DO exception exists, create one
        IF existing_shift = 0 AND existing_exception = 0 THEN
            INSERT INTO exception_logs (
                employee_id,
                employee_name,
                exception_code,
                exception_date,
                reason,
                approved_by,
                approved_at,
                created_by
            ) VALUES (
                emp.id,
                emp.name,
                'DO',
                target_date,
                'Automatic Day Off - No shift scheduled',
                'SYSTEM',
                NOW(),
                'SYSTEM'
            );
            
            RAISE NOTICE 'Created DO exception for employee % on %', emp.name, target_date;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to remove DO when a shift is assigned
CREATE OR REPLACE FUNCTION remove_do_on_shift_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- When a shift is inserted, remove any DO exceptions for that employee on that date
    DELETE FROM exception_logs
    WHERE employee_id = NEW.employee_id
    AND exception_date = NEW.shift_date
    AND exception_code = 'DO'
    AND created_by = 'SYSTEM'; -- Only remove automatic DOs, not manually created ones
    
    -- Also clear DO from the shift itself if it exists
    UPDATE employee_shifts
    SET exception_code = NULL,
        exception_reason = NULL,
        exception_approved_by = NULL,
        exception_approved_at = NULL
    WHERE id = NEW.id
    AND exception_code = 'DO';
    
    RAISE NOTICE 'Removed DO exception for employee % on %', NEW.employee_id, NEW.shift_date;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to reapply DO when a shift is deleted
CREATE OR REPLACE FUNCTION reapply_do_on_shift_delete()
RETURNS TRIGGER AS $$
DECLARE
    remaining_shifts INTEGER;
    existing_exception INTEGER;
    emp_name TEXT;
BEGIN
    -- Check if employee has any other shifts on this date
    SELECT COUNT(*) INTO remaining_shifts
    FROM employee_shifts
    WHERE employee_id = OLD.employee_id
    AND shift_date = OLD.shift_date
    AND id != OLD.id;
    
    -- Check if there's already a DO exception
    SELECT COUNT(*) INTO existing_exception
    FROM exception_logs
    WHERE employee_id = OLD.employee_id
    AND exception_date = OLD.shift_date
    AND exception_code = 'DO';
    
    -- If no remaining shifts and no DO exception, create one
    IF remaining_shifts = 0 AND existing_exception = 0 THEN
        -- Get employee name
        SELECT name INTO emp_name FROM employees WHERE id = OLD.employee_id;
        
        INSERT INTO exception_logs (
            employee_id,
            employee_name,
            exception_code,
            exception_date,
            reason,
            approved_by,
            approved_at,
            created_by
        ) VALUES (
            OLD.employee_id,
            emp_name,
            'DO',
            OLD.shift_date,
            'Automatic Day Off - Shift removed',
            'SYSTEM',
            NOW(),
            'SYSTEM'
        );
        
        RAISE NOTICE 'Reapplied DO exception for employee % on %', OLD.employee_id, OLD.shift_date;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS auto_remove_do_on_shift_insert ON employee_shifts;
CREATE TRIGGER auto_remove_do_on_shift_insert
    AFTER INSERT ON employee_shifts
    FOR EACH ROW
    EXECUTE FUNCTION remove_do_on_shift_insert();

DROP TRIGGER IF EXISTS auto_reapply_do_on_shift_delete ON employee_shifts;
CREATE TRIGGER auto_reapply_do_on_shift_delete
    AFTER DELETE ON employee_shifts
    FOR EACH ROW
    EXECUTE FUNCTION reapply_do_on_shift_delete();

-- Create a scheduled job to run the auto DO function daily (requires pg_cron extension)
-- If pg_cron is not available, you can call auto_apply_do_exceptions() manually or via an edge function

-- Optional: Function to backfill DO exceptions for a date range
CREATE OR REPLACE FUNCTION backfill_do_exceptions(start_date DATE, end_date DATE)
RETURNS void AS $$
DECLARE
    target_date DATE;
    emp RECORD;
    existing_shift INTEGER;
    existing_exception INTEGER;
BEGIN
    -- For each date in range
    FOR target_date IN 
        SELECT generate_series(start_date, end_date, '1 day'::interval)::DATE
    LOOP
        -- For each active employee
        FOR emp IN 
            SELECT id, name 
            FROM employees 
            WHERE status = 'active' OR status IS NULL
        LOOP
            -- Check if employee has a shift on target date
            SELECT COUNT(*) INTO existing_shift
            FROM employee_shifts
            WHERE employee_id = emp.id 
            AND shift_date = target_date;
            
            -- Check if there's already an exception log for this date
            SELECT COUNT(*) INTO existing_exception
            FROM exception_logs
            WHERE employee_id = emp.id 
            AND exception_date = target_date
            AND exception_code = 'DO';
            
            -- If no shift and no DO exception exists, create one
            IF existing_shift = 0 AND existing_exception = 0 THEN
                INSERT INTO exception_logs (
                    employee_id,
                    employee_name,
                    exception_code,
                    exception_date,
                    reason,
                    approved_by,
                    approved_at,
                    created_by
                ) VALUES (
                    emp.id,
                    emp.name,
                    'DO',
                    target_date,
                    'Automatic Day Off - No shift scheduled',
                    'SYSTEM',
                    NOW(),
                    'SYSTEM'
                );
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Backfilled DO exceptions from % to %', start_date, end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example usage to backfill for the past 30 days:
-- SELECT backfill_do_exceptions(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE);

-- Create a function that can be called from the frontend to ensure DO exceptions are up to date
CREATE OR REPLACE FUNCTION ensure_do_exceptions_for_date(target_date DATE)
RETURNS TABLE(employee_id INTEGER, employee_name TEXT, action TEXT) AS $$
BEGIN
    RETURN QUERY
    WITH employees_without_shifts AS (
        SELECT e.id, e.name
        FROM employees e
        WHERE (e.status = 'active' OR e.status IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM employee_shifts es
            WHERE es.employee_id = e.id
            AND es.shift_date = target_date
        )
        AND NOT EXISTS (
            SELECT 1 FROM exception_logs el
            WHERE el.employee_id = e.id
            AND el.exception_date = target_date
            AND el.exception_code = 'DO'
        )
    ),
    inserted_exceptions AS (
        INSERT INTO exception_logs (
            employee_id,
            employee_name,
            exception_code,
            exception_date,
            reason,
            approved_by,
            approved_at,
            created_by
        )
        SELECT 
            id,
            name,
            'DO',
            target_date,
            'Automatic Day Off - No shift scheduled',
            'SYSTEM',
            NOW(),
            'SYSTEM'
        FROM employees_without_shifts
        RETURNING employee_id, employee_name
    )
    SELECT 
        employee_id,
        employee_name,
        'DO exception created'::TEXT as action
    FROM inserted_exceptions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_apply_do_exceptions() IS 'Automatically creates DO exceptions for employees without shifts on current date';
COMMENT ON FUNCTION remove_do_on_shift_insert() IS 'Removes automatic DO exceptions when a shift is assigned';
COMMENT ON FUNCTION reapply_do_on_shift_delete() IS 'Reapplies DO exceptions when a shift is deleted';
COMMENT ON FUNCTION backfill_do_exceptions(DATE, DATE) IS 'Backfills DO exceptions for a date range';
COMMENT ON FUNCTION ensure_do_exceptions_for_date(DATE) IS 'Ensures all employees without shifts have DO exceptions for specified date';

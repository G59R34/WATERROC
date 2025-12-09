-- Add exception codes to the scheduling system
-- VAUT: Verified Authorized Unavailable Time - Admin authorized employee to stop working
-- DO: Day Off - Employee is not scheduled to work
-- UAEO: Unauthorized Absence from Expected Operations - Employee stops work without approval

-- Add exception_code column to employee_shifts table
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS exception_code TEXT 
CHECK (exception_code IN ('VAUT', 'DO', 'UAEO', NULL));

ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS exception_reason TEXT;
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS exception_approved_by TEXT;
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS exception_approved_at TIMESTAMPTZ;
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS exception_start_time TIME;
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS exception_end_time TIME;

-- Add exception_code to hourly_tasks table as well
ALTER TABLE hourly_tasks ADD COLUMN IF NOT EXISTS exception_code TEXT 
CHECK (exception_code IN ('VAUT', 'DO', 'UAEO', NULL));

ALTER TABLE hourly_tasks ADD COLUMN IF NOT EXISTS exception_reason TEXT;
ALTER TABLE hourly_tasks ADD COLUMN IF NOT EXISTS exception_approved_by TEXT;
ALTER TABLE hourly_tasks ADD COLUMN IF NOT EXISTS exception_approved_at TIMESTAMPTZ;

-- Create exception_logs table to track all exception events
CREATE TABLE IF NOT EXISTS exception_logs (
    id BIGSERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    exception_code TEXT NOT NULL CHECK (exception_code IN ('VAUT', 'DO', 'UAEO')),
    exception_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    reason TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    shift_id BIGINT REFERENCES employee_shifts(id) ON DELETE SET NULL,
    task_id BIGINT REFERENCES hourly_tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    additional_data JSONB
);

-- Create indexes for exception_logs
CREATE INDEX IF NOT EXISTS idx_exception_logs_employee ON exception_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_exception_logs_date ON exception_logs(exception_date);
CREATE INDEX IF NOT EXISTS idx_exception_logs_code ON exception_logs(exception_code);
CREATE INDEX IF NOT EXISTS idx_exception_logs_shift ON exception_logs(shift_id);
CREATE INDEX IF NOT EXISTS idx_exception_logs_task ON exception_logs(task_id);

-- RLS Policies for exception_logs
ALTER TABLE exception_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins view all exception_logs" ON exception_logs;
DROP POLICY IF EXISTS "Employees view own exception_logs" ON exception_logs;
DROP POLICY IF EXISTS "Admins manage exception_logs" ON exception_logs;

-- Admins can view all exception logs
CREATE POLICY "Admins view all exception_logs" ON exception_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Employees can view their own exception logs
CREATE POLICY "Employees view own exception_logs" ON exception_logs
    FOR SELECT
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.name = u.full_name
            WHERE u.auth_id = auth.uid()
        )
    );

-- Admins can create and manage exception logs
CREATE POLICY "Admins manage exception_logs" ON exception_logs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Function to log exception events automatically
CREATE OR REPLACE FUNCTION log_exception_event()
RETURNS TRIGGER AS $$
DECLARE
    emp_name TEXT;
BEGIN
    -- Get employee name
    SELECT name INTO emp_name FROM employees WHERE id = NEW.employee_id;
    
    -- Only log if an exception code is set
    IF NEW.exception_code IS NOT NULL THEN
        INSERT INTO exception_logs (
            employee_id, employee_name, exception_code, exception_date,
            start_time, end_time, reason, approved_by, approved_at,
            shift_id, created_by
        ) VALUES (
            NEW.employee_id,
            emp_name,
            NEW.exception_code,
            NEW.shift_date,
            NEW.exception_start_time,
            NEW.exception_end_time,
            NEW.exception_reason,
            NEW.exception_approved_by,
            NEW.exception_approved_at,
            NEW.id,
            NEW.created_by
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log exception events on employee_shifts
DROP TRIGGER IF EXISTS log_shift_exception ON employee_shifts;
CREATE TRIGGER log_shift_exception
    AFTER INSERT OR UPDATE OF exception_code ON employee_shifts
    FOR EACH ROW
    WHEN (NEW.exception_code IS NOT NULL)
    EXECUTE FUNCTION log_exception_event();

-- Function to log task exception events
CREATE OR REPLACE FUNCTION log_task_exception_event()
RETURNS TRIGGER AS $$
DECLARE
    emp_name TEXT;
BEGIN
    -- Get employee name
    SELECT name INTO emp_name FROM employees WHERE id = NEW.employee_id;
    
    -- Only log if an exception code is set
    IF NEW.exception_code IS NOT NULL THEN
        INSERT INTO exception_logs (
            employee_id, employee_name, exception_code, exception_date,
            start_time, end_time, reason, approved_by, approved_at,
            task_id
        ) VALUES (
            NEW.employee_id,
            emp_name,
            NEW.exception_code,
            NEW.task_date,
            NEW.start_time,
            NEW.end_time,
            NEW.exception_reason,
            NEW.exception_approved_by,
            NEW.exception_approved_at,
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log exception events on hourly_tasks
DROP TRIGGER IF EXISTS log_task_exception ON hourly_tasks;
CREATE TRIGGER log_task_exception
    AFTER INSERT OR UPDATE OF exception_code ON hourly_tasks
    FOR EACH ROW
    WHEN (NEW.exception_code IS NOT NULL)
    EXECUTE FUNCTION log_task_exception_event();

-- Create a view for exception summary by employee
CREATE OR REPLACE VIEW exception_summary AS
SELECT 
    e.id as employee_id,
    e.name as employee_name,
    el.exception_code,
    COUNT(*) as total_exceptions,
    COUNT(CASE WHEN el.approved_by IS NOT NULL THEN 1 END) as approved_count,
    COUNT(CASE WHEN el.approved_by IS NULL THEN 1 END) as unapproved_count,
    MIN(el.exception_date) as first_exception_date,
    MAX(el.exception_date) as last_exception_date
FROM employees e
LEFT JOIN exception_logs el ON e.id = el.employee_id
GROUP BY e.id, e.name, el.exception_code;

-- Create a view for daily exception report
CREATE OR REPLACE VIEW daily_exceptions AS
SELECT 
    el.exception_date,
    el.employee_name,
    el.exception_code,
    el.start_time,
    el.end_time,
    el.reason,
    el.approved_by,
    el.approved_at,
    CASE 
        WHEN el.exception_code = 'VAUT' THEN 'Verified Authorized Unavailable Time'
        WHEN el.exception_code = 'DO' THEN 'Day Off'
        WHEN el.exception_code = 'UAEO' THEN 'Unauthorized Absence from Expected Operations'
    END as exception_description
FROM exception_logs el
ORDER BY el.exception_date DESC, el.employee_name;

COMMENT ON TABLE exception_logs IS 'Tracks all employee exception events (VAUT, DO, UAEO)';
COMMENT ON COLUMN exception_logs.exception_code IS 'VAUT: Admin approved leave, DO: Day Off, UAEO: Unauthorized absence';
COMMENT ON VIEW exception_summary IS 'Summary of exceptions by employee and type';
COMMENT ON VIEW daily_exceptions IS 'Daily report of all exception events';

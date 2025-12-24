-- Add new exception codes to the scheduling system
-- NSFT: No Show For Task - Employee didn't acknowledge a task
-- VATO: Verified Authorized Time Off - For approved time off requests
-- EMWM: Employee Meeting With Management - Employee is in a meeting with management

-- Update CHECK constraints to include new exception codes
-- First, drop the old constraints
ALTER TABLE employee_shifts DROP CONSTRAINT IF EXISTS employee_shifts_exception_code_check;
ALTER TABLE hourly_tasks DROP CONSTRAINT IF EXISTS hourly_tasks_exception_code_check;
ALTER TABLE exception_logs DROP CONSTRAINT IF EXISTS exception_logs_exception_code_check;

-- Add new CHECK constraints with all exception codes
ALTER TABLE employee_shifts ADD CONSTRAINT employee_shifts_exception_code_check 
    CHECK (exception_code IN ('VAUT', 'DO', 'UAEO', 'NSFT', 'VATO', 'EMWM', NULL));

ALTER TABLE hourly_tasks ADD CONSTRAINT hourly_tasks_exception_code_check 
    CHECK (exception_code IN ('VAUT', 'DO', 'UAEO', 'NSFT', 'VATO', 'EMWM', NULL));

ALTER TABLE exception_logs ADD CONSTRAINT exception_logs_exception_code_check 
    CHECK (exception_code IN ('VAUT', 'DO', 'UAEO', 'NSFT', 'VATO', 'EMWM'));

-- Update the daily_exceptions view to include new exception codes
DROP VIEW IF EXISTS daily_exceptions;
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
        WHEN el.exception_code = 'NSFT' THEN 'No Show For Task'
        WHEN el.exception_code = 'VATO' THEN 'Verified Authorized Time Off'
        WHEN el.exception_code = 'EMWM' THEN 'Employee Meeting With Management'
    END as exception_description
FROM exception_logs el
ORDER BY el.exception_date DESC, el.employee_name;

-- Update comments
COMMENT ON COLUMN exception_logs.exception_code IS 'Exception codes: VAUT (Verified Authorized Unavailable Time), DO (Day Off), UAEO (Unauthorized Absence), NSFT (No Show For Task), VATO (Verified Authorized Time Off), EMWM (Employee Meeting With Management)';

COMMENT ON VIEW daily_exceptions IS 'Daily report of all exception events with descriptions';


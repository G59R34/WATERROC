-- Analytics, Employee Profiles, and Shift Scheduling Tables
-- Run this in Supabase SQL Editor after running supabase-schema.sql

-- ==============================================
-- EMPLOYEE PROFILES
-- ==============================================

-- Employee profiles with extended information
CREATE TABLE IF NOT EXISTS employee_profiles (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    phone VARCHAR(20),
    email VARCHAR(255),
    skills TEXT[], -- Array of skills/certifications
    certifications TEXT[], -- Array of certification names
    certification_expiry JSONB, -- {certification_name: expiry_date}
    hire_date DATE,
    notes TEXT,
    profile_photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id)
);

-- ==============================================
-- SHIFT SCHEDULING
-- ==============================================

-- Shift templates (e.g., "Morning", "Evening", "Night")
CREATE TABLE IF NOT EXISTS shift_templates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    color VARCHAR(7) DEFAULT '#3b82f6',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employee shift assignments
CREATE TABLE IF NOT EXISTS employee_shifts (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    shift_template_id BIGINT REFERENCES shift_templates(id) ON DELETE SET NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no-show')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time off requests
CREATE TABLE IF NOT EXISTS time_off_requests (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

-- ==============================================
-- ANALYTICS & TIME TRACKING
-- ==============================================

-- Task time logs (clock in/out)
CREATE TABLE IF NOT EXISTS task_time_logs (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    clock_in TIMESTAMPTZ NOT NULL,
    clock_out TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task completion metrics (auto-calculated)
CREATE TABLE IF NOT EXISTS task_metrics (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    completed_on_time BOOLEAN,
    completion_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(task_id)
);

-- ==============================================
-- INDEXES
-- ==============================================

CREATE INDEX IF NOT EXISTS idx_employee_profiles_employee_id ON employee_profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_employee_date ON employee_shifts(employee_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_date ON employee_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_time_off_employee_dates ON time_off_requests(employee_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_task ON task_time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_employee ON task_time_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_task_metrics_task ON task_metrics(task_id);

-- ==============================================
-- RLS POLICIES
-- ==============================================

-- Employee Profiles
ALTER TABLE employee_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view employee profiles"
    ON employee_profiles FOR SELECT
    USING (true);

CREATE POLICY "Employees can update own profile"
    ON employee_profiles FOR INSERT
    WITH CHECK (
        employee_id IN (
            SELECT id FROM employees WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Employees can update own profile data"
    ON employee_profiles FOR UPDATE
    USING (
        employee_id IN (
            SELECT id FROM employees WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage all employee profiles"
    ON employee_profiles FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            WHERE e.user_id = auth.uid() AND e.role = 'admin'
        )
    );

-- Shift Templates
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shift templates"
    ON shift_templates FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage shift templates"
    ON shift_templates FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            WHERE e.user_id = auth.uid() AND e.role = 'admin'
        )
    );

-- Employee Shifts
ALTER TABLE employee_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shifts"
    ON employee_shifts FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage shifts"
    ON employee_shifts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            WHERE e.user_id = auth.uid() AND e.role = 'admin'
        )
    );

-- Time Off Requests
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own time off requests"
    ON time_off_requests FOR SELECT
    USING (
        employee_id IN (
            SELECT id FROM employees WHERE user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM employees e
            WHERE e.user_id = auth.uid() AND e.role = 'admin'
        )
    );

CREATE POLICY "Employees can create own time off requests"
    ON time_off_requests FOR INSERT
    WITH CHECK (
        employee_id IN (
            SELECT id FROM employees WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage all time off requests"
    ON time_off_requests FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            WHERE e.user_id = auth.uid() AND e.role = 'admin'
        )
    );

-- Task Time Logs
ALTER TABLE task_time_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view time logs"
    ON task_time_logs FOR SELECT
    USING (true);

CREATE POLICY "Employees can create own time logs"
    ON task_time_logs FOR INSERT
    WITH CHECK (
        employee_id IN (
            SELECT id FROM employees WHERE user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM employees e
            WHERE e.user_id = auth.uid() AND e.role = 'admin'
        )
    );

CREATE POLICY "Employees can update own time logs"
    ON task_time_logs FOR UPDATE
    USING (
        employee_id IN (
            SELECT id FROM employees WHERE user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM employees e
            WHERE e.user_id = auth.uid() AND e.role = 'admin'
        )
    );

-- Task Metrics
ALTER TABLE task_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view task metrics"
    ON task_metrics FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage task metrics"
    ON task_metrics FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM employees e
            WHERE e.user_id = auth.uid() AND e.role = 'admin'
        )
    );

-- ==============================================
-- SEED DATA
-- ==============================================

-- Insert default shift templates
INSERT INTO shift_templates (name, start_time, end_time, color) VALUES
    ('Morning Shift', '06:00:00', '14:00:00', '#3b82f6'),
    ('Day Shift', '08:00:00', '16:00:00', '#10b981'),
    ('Evening Shift', '14:00:00', '22:00:00', '#f59e0b'),
    ('Night Shift', '22:00:00', '06:00:00', '#8b5cf6'),
    ('Full Day', '08:00:00', '17:00:00', '#ef4444')
ON CONFLICT DO NOTHING;

-- ==============================================
-- FUNCTIONS
-- ==============================================

-- Function to calculate task actual hours
CREATE OR REPLACE FUNCTION calculate_task_actual_hours(task_id_param BIGINT)
RETURNS DECIMAL AS $$
DECLARE
    total_hours DECIMAL;
BEGIN
    SELECT COALESCE(SUM(
        EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600
    ), 0) INTO total_hours
    FROM task_time_logs
    WHERE task_id = task_id_param AND clock_out IS NOT NULL;
    
    RETURN total_hours;
END;
$$ LANGUAGE plpgsql;

-- Function to update task metrics when task is completed
CREATE OR REPLACE FUNCTION update_task_metrics()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO task_metrics (task_id, actual_hours, completed_on_time, completion_date)
        VALUES (
            NEW.id,
            calculate_task_actual_hours(NEW.id),
            NOW() <= (NEW.date + NEW.end_time::time),
            NOW()
        )
        ON CONFLICT (task_id) DO UPDATE SET
            actual_hours = EXCLUDED.actual_hours,
            completed_on_time = EXCLUDED.completed_on_time,
            completion_date = EXCLUDED.completion_date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for task metrics
DROP TRIGGER IF EXISTS task_completion_metrics_trigger ON tasks;
CREATE TRIGGER task_completion_metrics_trigger
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_task_metrics();

-- Function to get employee workload
CREATE OR REPLACE FUNCTION get_employee_workload(start_date_param DATE, end_date_param DATE)
RETURNS TABLE (
    employee_id BIGINT,
    employee_name VARCHAR,
    total_tasks BIGINT,
    completed_tasks BIGINT,
    pending_tasks BIGINT,
    total_hours DECIMAL,
    completion_rate DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.name,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN t.status IN ('pending', 'in-progress') THEN 1 END) as pending_tasks,
        COALESCE(SUM(tm.actual_hours), 0) as total_hours,
        CASE 
            WHEN COUNT(t.id) > 0 THEN 
                ROUND((COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::DECIMAL / COUNT(t.id)::DECIMAL) * 100, 2)
            ELSE 0
        END as completion_rate
    FROM employees e
    LEFT JOIN tasks t ON t.employee_id = e.id 
        AND t.date BETWEEN start_date_param AND end_date_param
    LEFT JOIN task_metrics tm ON tm.task_id = t.id
    GROUP BY e.id, e.name
    ORDER BY completion_rate DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE employee_profiles IS 'Extended employee information including skills and certifications';
COMMENT ON TABLE shift_templates IS 'Reusable shift templates for scheduling';
COMMENT ON TABLE employee_shifts IS 'Employee shift assignments by date';
COMMENT ON TABLE time_off_requests IS 'Employee time off requests and approvals';
COMMENT ON TABLE task_time_logs IS 'Clock in/out logs for task time tracking';
COMMENT ON TABLE task_metrics IS 'Calculated metrics for task performance analysis';

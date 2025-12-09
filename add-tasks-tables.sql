-- Drop the foreign key constraint if it exists (from previous schema)
ALTER TABLE IF EXISTS task_logs DROP CONSTRAINT IF EXISTS task_logs_task_id_fkey;

-- Tasks table to store all hourly tasks
CREATE TABLE IF NOT EXISTS hourly_tasks (
    id BIGSERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    task_date DATE NOT NULL,
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    work_area TEXT NOT NULL CHECK (work_area IN ('music-prod', 'video-creation', 'administrative', 'other', 'note-other')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'overdue', 'on-hold')),
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    UNIQUE(employee_id, task_date, start_time, work_area)
);

-- Task logs table for tracking all task events
CREATE TABLE IF NOT EXISTS task_logs (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT, -- No foreign key constraint to allow logging deleted tasks
    action TEXT NOT NULL CHECK (action IN ('created', 'modified', 'completed', 'deleted', 'acknowledged')),
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    task_name TEXT NOT NULL,
    task_date DATE NOT NULL,
    work_area TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status TEXT NOT NULL,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    previous_status TEXT,
    performed_by TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    additional_data JSONB
);

-- Task statistics table for employee performance metrics
CREATE TABLE IF NOT EXISTS task_statistics (
    id BIGSERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_assigned INTEGER DEFAULT 0,
    total_completed INTEGER DEFAULT 0,
    total_acknowledged INTEGER DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    acknowledgment_rate DECIMAL(5,2) DEFAULT 0,
    by_work_area JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hourly_tasks_employee_date ON hourly_tasks(employee_id, task_date);
CREATE INDEX IF NOT EXISTS idx_hourly_tasks_date ON hourly_tasks(task_date);
CREATE INDEX IF NOT EXISTS idx_hourly_tasks_status ON hourly_tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_logs_employee ON task_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_date ON task_logs(task_date);
CREATE INDEX IF NOT EXISTS idx_task_logs_action ON task_logs(action);
CREATE INDEX IF NOT EXISTS idx_task_statistics_employee ON task_statistics(employee_id);
CREATE INDEX IF NOT EXISTS idx_task_statistics_date ON task_statistics(date);

-- RLS Policies for hourly_tasks
ALTER TABLE hourly_tasks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins full access to hourly_tasks" ON hourly_tasks;
DROP POLICY IF EXISTS "Employees view own hourly_tasks" ON hourly_tasks;
DROP POLICY IF EXISTS "Employees update own hourly_tasks" ON hourly_tasks;

-- Admins can do everything
CREATE POLICY "Admins full access to hourly_tasks" ON hourly_tasks
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Employees can view their own tasks
CREATE POLICY "Employees view own hourly_tasks" ON hourly_tasks
    FOR SELECT
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.name = u.full_name
            WHERE u.auth_id = auth.uid()
        )
    );

-- Employees can update their own tasks (acknowledge, status)
CREATE POLICY "Employees update own hourly_tasks" ON hourly_tasks
    FOR UPDATE
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.name = u.full_name
            WHERE u.auth_id = auth.uid()
        )
    );

-- RLS Policies for task_logs
ALTER TABLE task_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins view all task_logs" ON task_logs;
DROP POLICY IF EXISTS "Employees view own task_logs" ON task_logs;
DROP POLICY IF EXISTS "Authenticated users insert task_logs" ON task_logs;

-- Admins can view all logs
CREATE POLICY "Admins view all task_logs" ON task_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Employees can view their own logs
CREATE POLICY "Employees view own task_logs" ON task_logs
    FOR SELECT
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.name = u.full_name
            WHERE u.auth_id = auth.uid()
        )
    );

-- Anyone authenticated can insert logs
CREATE POLICY "Authenticated users insert task_logs" ON task_logs
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for task_statistics
ALTER TABLE task_statistics ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins view all task_statistics" ON task_statistics;
DROP POLICY IF EXISTS "Employees view own task_statistics" ON task_statistics;
DROP POLICY IF EXISTS "Authenticated users update task_statistics" ON task_statistics;

-- Admins can view all statistics
CREATE POLICY "Admins view all task_statistics" ON task_statistics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.auth_id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Employees can view their own statistics
CREATE POLICY "Employees view own task_statistics" ON task_statistics
    FOR SELECT
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN users u ON e.name = u.full_name
            WHERE u.auth_id = auth.uid()
        )
    );

-- Anyone authenticated can update statistics
CREATE POLICY "Authenticated users update task_statistics" ON task_statistics
    FOR ALL
    USING (auth.uid() IS NOT NULL);

-- Function to automatically update modified_at timestamp
CREATE OR REPLACE FUNCTION update_modified_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update modified_at on hourly_tasks
DROP TRIGGER IF EXISTS update_hourly_tasks_modified_at ON hourly_tasks;
CREATE TRIGGER update_hourly_tasks_modified_at
    BEFORE UPDATE ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_at();

-- Function to log task events automatically
CREATE OR REPLACE FUNCTION log_task_event()
RETURNS TRIGGER AS $$
DECLARE
    action_type TEXT;
    emp_name TEXT;
BEGIN
    -- Get employee name
    SELECT name INTO emp_name FROM employees WHERE id = COALESCE(NEW.employee_id, OLD.employee_id);
    
    -- Determine action type
    IF TG_OP = 'INSERT' THEN
        action_type := 'created';
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
            action_type := 'completed';
        ELSIF NEW.acknowledged = true AND OLD.acknowledged = false THEN
            action_type := 'acknowledged';
        ELSE
            action_type := 'modified';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        action_type := 'deleted';
    END IF;
    
    -- Insert log entry
    INSERT INTO task_logs (
        task_id, action, employee_id, employee_name, task_name,
        task_date, work_area, start_time, end_time, status,
        acknowledged, acknowledged_by, acknowledged_at, previous_status
    ) VALUES (
        COALESCE(NEW.id, OLD.id),
        action_type,
        COALESCE(NEW.employee_id, OLD.employee_id),
        emp_name,
        COALESCE(NEW.name, OLD.name),
        COALESCE(NEW.task_date, OLD.task_date),
        COALESCE(NEW.work_area, OLD.work_area),
        COALESCE(NEW.start_time, OLD.start_time),
        COALESCE(NEW.end_time, OLD.end_time),
        COALESCE(NEW.status, OLD.status),
        COALESCE(NEW.acknowledged, OLD.acknowledged, false),
        COALESCE(NEW.acknowledged_by, OLD.acknowledged_by),
        COALESCE(NEW.acknowledged_at, OLD.acknowledged_at),
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically log task events
DROP TRIGGER IF EXISTS log_task_insert ON hourly_tasks;
CREATE TRIGGER log_task_insert
    AFTER INSERT ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_event();

DROP TRIGGER IF EXISTS log_task_update ON hourly_tasks;
CREATE TRIGGER log_task_update
    AFTER UPDATE ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_event();

DROP TRIGGER IF EXISTS log_task_delete ON hourly_tasks;
CREATE TRIGGER log_task_delete
    AFTER DELETE ON hourly_tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_event();

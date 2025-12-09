-- Task Templates Table
-- Run this in Supabase SQL Editor to add task template functionality

-- Create task_templates table
CREATE TABLE IF NOT EXISTS task_templates (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    duration_hours DECIMAL(4,2) DEFAULT 2.0,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    auto_assign BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "enable_read_for_authenticated_users" ON task_templates;
DROP POLICY IF EXISTS "enable_all_for_admins" ON task_templates;

-- Create policies for task_templates
CREATE POLICY "enable_read_for_authenticated_users"
    ON task_templates FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "enable_all_for_admins"
    ON task_templates FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM employees
            WHERE employees.user_id = auth.uid()
            AND employees.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM employees
            WHERE employees.user_id = auth.uid()
            AND employees.role = 'admin'
        )
    );

-- Create function to auto-generate tasks from templates
-- Note: This will be called manually from the application rather than as a trigger
-- because tasks are managed in localStorage/Gantt system, not directly in database
CREATE OR REPLACE FUNCTION auto_generate_tasks_from_shifts()
RETURNS TRIGGER AS $$
BEGIN
    -- For now, just return NEW without generating tasks
    -- Task generation will be handled by the frontend when shifts are loaded
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (disabled for now - frontend will handle task generation)
DROP TRIGGER IF EXISTS trigger_auto_generate_tasks ON employee_shifts;
-- Commented out: CREATE TRIGGER trigger_auto_generate_tasks
--     AFTER INSERT ON employee_shifts
--     FOR EACH ROW
--     EXECUTE FUNCTION auto_generate_tasks_from_shifts();

-- Add some default task templates
INSERT INTO task_templates (title, description, duration_hours, priority, auto_assign) VALUES
    ('Morning Inspection', 'Complete morning equipment and facility inspection', 1.0, 'high', true),
    ('Water Quality Testing', 'Test and record water quality parameters', 2.0, 'high', true),
    ('Maintenance Check', 'Routine maintenance and equipment checks', 3.0, 'normal', true),
    ('Safety Review', 'Review and update safety protocols', 1.5, 'normal', true),
    ('End of Day Report', 'Complete and submit daily report', 0.5, 'normal', true);

COMMENT ON TABLE task_templates IS 'Templates for automatically generating tasks based on employee shifts';

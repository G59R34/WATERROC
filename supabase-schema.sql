-- Waterstream Supabase Database Schema
-- =====================================
-- Run this SQL in your Supabase SQL Editor to create the necessary tables

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- USERS TABLE (Custom user profiles)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'employee',
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Valid roles
    CONSTRAINT valid_role CHECK (role IN ('admin', 'employee'))
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- ==========================================
-- EMPLOYEES TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.employees (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_employees_created_at ON public.employees(created_at);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);

-- ==========================================
-- TASKS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.tasks (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time VARCHAR(4) DEFAULT '0000',
    end_time VARCHAR(4) DEFAULT '2359',
    status VARCHAR(50) DEFAULT 'pending',
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Add constraint to ensure valid time format (HHMM)
    CONSTRAINT valid_start_time CHECK (start_time ~ '^[0-2][0-9][0-5][0-9]$'),
    CONSTRAINT valid_end_time CHECK (end_time ~ '^[0-2][0-9][0-5][0-9]$'),
    
    -- Add constraint to ensure valid status
    CONSTRAINT valid_status CHECK (status IN ('pending', 'in-progress', 'completed', 'overdue', 'on-hold')),
    
    -- Ensure end date is not before start date
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_tasks_employee_id ON public.tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON public.tasks(start_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);

-- ==========================================
-- TASK ACKNOWLEDGEMENTS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.task_acknowledgements (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    acknowledged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    
    -- Prevent duplicate acknowledgements
    UNIQUE(task_id, user_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_task_ack_task_id ON public.task_acknowledgements(task_id);
CREATE INDEX IF NOT EXISTS idx_task_ack_user_id ON public.task_acknowledgements(user_id);
CREATE INDEX IF NOT EXISTS idx_task_ack_acknowledged_at ON public.task_acknowledgements(acknowledged_at);

-- ==========================================
-- TASK MESSAGES TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.task_messages (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_from_admin BOOLEAN DEFAULT FALSE,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_task_messages_task_id ON public.task_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_user_id ON public.task_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_created_at ON public.task_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_task_messages_is_read ON public.task_messages(is_read);

-- ==========================================
-- ANNOUNCEMENTS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.announcements (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal',
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Priority constraint
    CONSTRAINT valid_priority CHECK (priority IN ('normal', 'important', 'urgent'))
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements(created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_priority ON public.announcements(priority);
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON public.announcements(created_by);

-- ==========================================
-- ANNOUNCEMENT READS TABLE (Track who has read announcements)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.announcement_reads (
    id BIGSERIAL PRIMARY KEY,
    announcement_id BIGINT NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate reads
    UNIQUE(announcement_id, user_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id ON public.announcement_reads(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON public.announcement_reads(user_id);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Users Table Policies
CREATE POLICY "Users can view all users"
    ON public.users FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = auth_id);

-- Employees Table Policies
CREATE POLICY "Anyone can view employees"
    ON public.employees FOR SELECT
    USING (true);

CREATE POLICY "Admins can insert employees"
    ON public.employees FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_id = auth.uid() AND is_admin = TRUE
        )
    );

CREATE POLICY "Admins can update employees"
    ON public.employees FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_id = auth.uid() AND is_admin = TRUE
        )
    );

CREATE POLICY "Admins can delete employees"
    ON public.employees FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_id = auth.uid() AND is_admin = TRUE
        )
    );

-- Tasks Table Policies
CREATE POLICY "Anyone can view tasks"
    ON public.tasks FOR SELECT
    USING (true);

CREATE POLICY "Admins can insert tasks"
    ON public.tasks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_id = auth.uid() AND is_admin = TRUE
        )
    );

CREATE POLICY "Admins can update tasks"
    ON public.tasks FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_id = auth.uid() AND is_admin = TRUE
        )
    );

CREATE POLICY "Admins can delete tasks"
    ON public.tasks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_id = auth.uid() AND is_admin = TRUE
        )
    );

-- Task Acknowledgements Policies
CREATE POLICY "Anyone can view acknowledgements"
    ON public.task_acknowledgements FOR SELECT
    USING (true);

CREATE POLICY "Employees can acknowledge their own tasks"
    ON public.task_acknowledgements FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u
            JOIN public.employees e ON e.user_id = u.id
            JOIN public.tasks t ON t.employee_id = e.id
            WHERE u.auth_id = auth.uid() AND t.id = task_id
        )
    );

CREATE POLICY "Users can delete own acknowledgements"
    ON public.task_acknowledgements FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_id = auth.uid() AND id = user_id
        )
    );

-- ==========================================
-- FUNCTIONS AND TRIGGERS
-- ==========================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for employees table
DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
    BEFORE UPDATE ON public.employees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for tasks table
DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create user profile after signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (auth_id, username, email, full_name, role, is_admin)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        'employee', -- Default role
        FALSE       -- Default not admin (can be changed later in database)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- SAMPLE DATA (Optional)
-- ==========================================

-- Uncomment to add sample data for testing
-- INSERT INTO public.employees (name, role) VALUES
--     ('Sarah Johnson', 'Project Manager'),
--     ('Mike Chen', 'Senior Developer'),
--     ('Emily Davis', 'UX Designer');

-- INSERT INTO public.tasks (employee_id, name, start_date, end_date, start_time, end_time, status) VALUES
--     (1, 'Project Planning', CURRENT_DATE, CURRENT_DATE + INTERVAL '5 days', '0900', '1700', 'in-progress'),
--     (2, 'API Development', CURRENT_DATE + INTERVAL '2 days', CURRENT_DATE + INTERVAL '12 days', '0800', '1600', 'pending');

-- ==========================================
-- ADMIN MANAGEMENT FUNCTIONS
-- ==========================================

-- Function to promote user to admin
-- Usage: SELECT promote_to_admin('username');
CREATE OR REPLACE FUNCTION promote_to_admin(username_param VARCHAR)
RETURNS TEXT AS $$
BEGIN
    UPDATE public.users 
    SET is_admin = TRUE, role = 'admin'
    WHERE username = username_param;
    
    IF FOUND THEN
        RETURN 'User ' || username_param || ' promoted to admin';
    ELSE
        RETURN 'User ' || username_param || ' not found';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to demote user from admin
-- Usage: SELECT demote_from_admin('username');
CREATE OR REPLACE FUNCTION demote_from_admin(username_param VARCHAR)
RETURNS TEXT AS $$
BEGIN
    UPDATE public.users 
    SET is_admin = FALSE, role = 'employee'
    WHERE username = username_param;
    
    IF FOUND THEN
        RETURN 'User ' || username_param || ' demoted from admin';
    ELSE
        RETURN 'User ' || username_param || ' not found';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Quick commands to manage admins:
-- SELECT promote_to_admin('crouch');
-- SELECT promote_to_admin('hoen');
-- SELECT demote_from_admin('username');

-- ==========================================
-- HELPFUL QUERIES
-- ==========================================

-- View all employees with their task count
-- SELECT 
--     e.id,
--     e.name,
--     e.role,
--     COUNT(t.id) as task_count
-- FROM employees e
-- LEFT JOIN tasks t ON e.id = t.employee_id
-- GROUP BY e.id, e.name, e.role
-- ORDER BY e.created_at;

-- View all tasks with employee information
-- SELECT 
--     t.id,
--     t.name as task_name,
--     e.name as employee_name,
--     e.role,
--     t.start_date,
--     t.end_date,
--     t.start_time,
--     t.end_time,
--     t.status
-- FROM tasks t
-- JOIN employees e ON t.employee_id = e.id
-- ORDER BY t.start_date, t.start_time;

-- Find tasks by status
-- SELECT * FROM tasks WHERE status = 'in-progress';

-- Find tasks for a specific date range
-- SELECT * FROM tasks 
-- WHERE start_date <= '2025-12-31' 
-- AND end_date >= '2025-12-01';

-- ==========================================
-- ADDITIONAL RLS POLICIES FOR ANNOUNCEMENTS
-- ==========================================

-- Announcements Table Policies
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view announcements"
    ON public.announcements FOR SELECT
    USING (true);

CREATE POLICY "Only admins can create announcements"
    ON public.announcements FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid() AND users.is_admin = TRUE
        )
    );

CREATE POLICY "Only admins can delete announcements"
    ON public.announcements FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid() AND users.is_admin = TRUE
        )
    );

-- Announcement Reads Table Policies
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reads"
    ON public.announcement_reads FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM public.users WHERE auth_id = auth.uid()
        )
    );

CREATE POLICY "Users can mark announcements as read"
    ON public.announcement_reads FOR INSERT
    WITH CHECK (
        user_id IN (
            SELECT id FROM public.users WHERE auth_id = auth.uid()
        )
    );


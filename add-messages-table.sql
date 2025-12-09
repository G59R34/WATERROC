-- Add Task Messages Table to Waterstream
-- =======================================
-- Run this SQL in your Supabase SQL Editor to add messaging functionality

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

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_task_messages_task_id ON public.task_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_user_id ON public.task_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_created_at ON public.task_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_task_messages_is_read ON public.task_messages(is_read);

-- Enable Row Level Security (RLS)
ALTER TABLE public.task_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_messages
-- Allow users to view all messages for tasks they're involved with
CREATE POLICY "Users can view messages for their tasks"
    ON public.task_messages
    FOR SELECT
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid() AND users.is_admin = TRUE
        )
    );

-- Allow authenticated users to insert messages
CREATE POLICY "Authenticated users can send messages"
    ON public.task_messages
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to update their own messages
CREATE POLICY "Users can update their own messages"
    ON public.task_messages
    FOR UPDATE
    USING (auth.uid() IN (
        SELECT auth_id FROM public.users WHERE id = user_id
    ));

-- Add comment
COMMENT ON TABLE public.task_messages IS 'Stores messages between employees and admins for specific tasks';

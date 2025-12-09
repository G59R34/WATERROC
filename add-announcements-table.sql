-- Add Announcements Feature to Waterstream
-- =========================================
-- Run this SQL in your Supabase SQL Editor to add global announcements

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

-- Add indexes for better performance
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

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id ON public.announcement_reads(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON public.announcement_reads(user_id);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on announcements table
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Anyone can view announcements
CREATE POLICY "Anyone can view announcements"
    ON public.announcements FOR SELECT
    USING (true);

-- Only admins can create announcements
CREATE POLICY "Only admins can create announcements"
    ON public.announcements FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid() AND users.is_admin = TRUE
        )
    );

-- Only admins can delete announcements
CREATE POLICY "Only admins can delete announcements"
    ON public.announcements FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid() AND users.is_admin = TRUE
        )
    );

-- Enable RLS on announcement reads table
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Users can view their own reads
CREATE POLICY "Users can view their own reads"
    ON public.announcement_reads FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM public.users WHERE auth_id = auth.uid()
        )
    );

-- Users can mark announcements as read
CREATE POLICY "Users can mark announcements as read"
    ON public.announcement_reads FOR INSERT
    WITH CHECK (
        user_id IN (
            SELECT id FROM public.users WHERE auth_id = auth.uid()
        )
    );

-- Add comments for documentation
COMMENT ON TABLE public.announcements IS 'Global announcements from admins to all employees';
COMMENT ON TABLE public.announcement_reads IS 'Tracks which users have read which announcements';

-- Grant necessary permissions
GRANT SELECT ON public.announcements TO authenticated;
GRANT SELECT, INSERT ON public.announcement_reads TO authenticated;

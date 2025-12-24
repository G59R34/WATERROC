-- Add Company-Wide Chat Feature to WaterROC
-- ===========================================
-- Run this SQL in your Supabase SQL Editor to add company chat functionality

-- ==========================================
-- COMPANY CHAT MESSAGES TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.company_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_company_chat_user_id ON public.company_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_company_chat_created_at ON public.company_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_chat_deleted_at ON public.company_chat_messages(deleted_at) WHERE deleted_at IS NULL;

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on company_chat_messages table
ALTER TABLE public.company_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view all non-deleted messages
DROP POLICY IF EXISTS "Authenticated users can view company chat messages" ON public.company_chat_messages;
CREATE POLICY "Authenticated users can view company chat messages"
    ON public.company_chat_messages
    FOR SELECT
    TO authenticated
    USING (
        deleted_at IS NULL AND
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid()
        )
    );

-- Policy: Authenticated users can send messages
DROP POLICY IF EXISTS "Authenticated users can send company chat messages" ON public.company_chat_messages;
CREATE POLICY "Authenticated users can send company chat messages"
    ON public.company_chat_messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = user_id AND users.auth_id = auth.uid()
        )
    );

-- Policy: Users can update their own messages (for editing)
DROP POLICY IF EXISTS "Users can update their own company chat messages" ON public.company_chat_messages;
CREATE POLICY "Users can update their own company chat messages"
    ON public.company_chat_messages
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = user_id AND users.auth_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = user_id AND users.auth_id = auth.uid()
        )
    );

-- Policy: Users can delete (soft delete) their own messages
DROP POLICY IF EXISTS "Users can delete their own company chat messages" ON public.company_chat_messages;
CREATE POLICY "Users can delete their own company chat messages"
    ON public.company_chat_messages
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = user_id AND users.auth_id = auth.uid()
        )
    );

-- Policy: Admins can delete any message
DROP POLICY IF EXISTS "Admins can delete any company chat message" ON public.company_chat_messages;
CREATE POLICY "Admins can delete any company chat message"
    ON public.company_chat_messages
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid() AND users.is_admin = TRUE
        )
    );

-- ==========================================
-- FUNCTION: Update updated_at timestamp
-- ==========================================

CREATE OR REPLACE FUNCTION update_company_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_company_chat_messages_updated_at ON public.company_chat_messages;
CREATE TRIGGER update_company_chat_messages_updated_at
    BEFORE UPDATE ON public.company_chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_company_chat_updated_at();


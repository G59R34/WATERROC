-- Fix Company Chat Admin RLS Policies
-- Run this in Supabase SQL Editor to allow admins to clear chat and delete any message

-- Drop ALL existing update policies to avoid conflicts
DROP POLICY IF EXISTS "Users can update their own company chat messages" ON public.company_chat_messages;
DROP POLICY IF EXISTS "Users can delete their own company chat messages" ON public.company_chat_messages;
DROP POLICY IF EXISTS "Admins can delete any company chat message" ON public.company_chat_messages;
 DROP POLICY IF EXISTS "Admins can update any company chat message" ON public.company_chat_messages;

-- Recreate policy for users to update their own messages (for editing and deleting)
-- This policy allows users to update messages where they are the owner
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

-- Create policy for admins to update (delete) ANY message
-- This policy allows admins to update any message, including bulk updates
-- The key is that WITH CHECK doesn't restrict which rows can be updated, just that the user is an admin
CREATE POLICY "Admins can update any company chat message"
    ON public.company_chat_messages
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid() AND users.is_admin = TRUE
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.auth_id = auth.uid() AND users.is_admin = TRUE
        )
    );

COMMENT ON POLICY "Users can update their own company chat messages" ON public.company_chat_messages IS 'Allows users to update (edit/delete) their own messages';
COMMENT ON POLICY "Admins can update any company chat message" ON public.company_chat_messages IS 'Allows admins to update (delete) any message, including bulk updates for clearing chat';


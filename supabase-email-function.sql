-- Supabase Email Notification Setup
-- =====================================
-- This enables email notifications for task assignments and messages

-- First, you need to enable the pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to send email notifications
CREATE OR REPLACE FUNCTION public.send_task_notification_email()
RETURNS TRIGGER AS $$
DECLARE
    employee_email TEXT;
    employee_name TEXT;
    task_name TEXT;
    notification_type TEXT;
BEGIN
    -- Determine notification type
    IF TG_OP = 'INSERT' THEN
        notification_type := 'new_task';
        
        -- Get employee email and details
        SELECT u.email, u.full_name, NEW.name
        INTO employee_email, employee_name, task_name
        FROM public.employees e
        JOIN public.users u ON e.user_id = u.id
        WHERE e.id = NEW.employee_id;
        
        -- Send email via Supabase Edge Function or external service
        -- You'll need to set this up in Supabase dashboard
        PERFORM net.http_post(
            url := 'https://your-project.supabase.co/functions/v1/send-email',
            headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
            body := json_build_object(
                'to', employee_email,
                'subject', 'New Task Assigned: ' || task_name,
                'html', '<h2>You have been assigned a new task</h2>' ||
                        '<p><strong>Task:</strong> ' || task_name || '</p>' ||
                        '<p><strong>Start Date:</strong> ' || NEW.start_date || '</p>' ||
                        '<p><strong>End Date:</strong> ' || NEW.end_date || '</p>' ||
                        '<p><a href="https://your-app-url.com/employee.html">View in Waterstream</a></p>'
            )::jsonb
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new tasks
CREATE TRIGGER task_email_notification_trigger
    AFTER INSERT ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.send_task_notification_email();

-- Create a function to send message notification emails
CREATE OR REPLACE FUNCTION public.send_message_notification_email()
RETURNS TRIGGER AS $$
DECLARE
    recipient_email TEXT;
    sender_name TEXT;
    task_name TEXT;
BEGIN
    -- Get task name
    SELECT name INTO task_name FROM public.tasks WHERE id = NEW.task_id;
    
    -- Get sender name
    SELECT full_name INTO sender_name FROM public.users WHERE id = NEW.user_id;
    
    -- If message is from employee to admin
    IF NEW.is_from_admin = FALSE THEN
        -- Send to all admins
        FOR recipient_email IN 
            SELECT email FROM public.users WHERE is_admin = TRUE
        LOOP
            PERFORM net.http_post(
                url := 'https://your-project.supabase.co/functions/v1/send-email',
                headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
                body := json_build_object(
                    'to', recipient_email,
                    'subject', 'New message about task: ' || task_name,
                    'html', '<h2>New message from ' || sender_name || '</h2>' ||
                            '<p><strong>Task:</strong> ' || task_name || '</p>' ||
                            '<p><strong>Message:</strong> ' || NEW.message || '</p>' ||
                            '<p><a href="https://your-app-url.com/admin.html">View in Waterstream</a></p>'
                )::jsonb
            );
        END LOOP;
    ELSE
        -- Message is from admin to employee, send to task assignee
        SELECT u.email INTO recipient_email
        FROM public.tasks t
        JOIN public.employees e ON t.employee_id = e.id
        JOIN public.users u ON e.user_id = u.id
        WHERE t.id = NEW.task_id;
        
        IF recipient_email IS NOT NULL THEN
            PERFORM net.http_post(
                url := 'https://your-project.supabase.co/functions/v1/send-email',
                headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
                body := json_build_object(
                    'to', recipient_email,
                    'subject', 'Admin replied to your message: ' || task_name,
                    'html', '<h2>Admin replied to your question</h2>' ||
                            '<p><strong>Task:</strong> ' || task_name || '</p>' ||
                            '<p><strong>Message:</strong> ' || NEW.message || '</p>' ||
                            '<p><a href="https://your-app-url.com/employee.html">View in Waterstream</a></p>'
                )::jsonb
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new messages
CREATE TRIGGER message_email_notification_trigger
    AFTER INSERT ON public.task_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.send_message_notification_email();

-- Note: You need to create the actual Edge Function in Supabase
-- See the send-email-edge-function.ts file for the Edge Function code

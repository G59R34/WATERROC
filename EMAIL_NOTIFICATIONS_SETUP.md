# Email Notifications Setup Guide

## Overview
This guide will help you set up email notifications for Waterstream using Supabase Edge Functions and Resend email service.

## 📧 What Gets Email Notifications?

1. **New Task Assigned** - Employee receives email when admin assigns a task
2. **New Message from Employee** - Admin receives email when employee asks a question
3. **Admin Reply** - Employee receives email when admin replies to their message

## 🚀 Setup Steps

### Step 1: Choose Email Service

**Recommended: Resend** (Free tier: 100 emails/day, 3,000/month)
- Website: https://resend.com
- Pros: Simple API, generous free tier, great deliverability
- Cons: Need to verify domain (or use test mode)

**Alternative: SendGrid** (Free tier: 100 emails/day)
- Website: https://sendgrid.com
- Pros: Well-established, good documentation
- Cons: More complex setup

### Step 2: Set Up Email Service

#### Using Resend:
1. Sign up at https://resend.com
2. Verify your email
3. Get your API key from the dashboard
4. (Optional) Add and verify your domain, or use test mode

#### Using SendGrid:
1. Sign up at https://sendgrid.com
2. Create an API key with "Mail Send" permissions
3. Verify a sender email address

### Step 3: Install Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Or with Homebrew (Mac)
brew install supabase/tap/supabase

# Verify installation
supabase --version
```

### Step 4: Initialize Supabase Functions

```bash
# Navigate to your project directory
cd /path/to/MAGROC

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Create the email function
supabase functions new send-email
```

### Step 5: Set Up the Edge Function

1. Copy the code from `send-email-edge-function.ts` to:
   ```
   supabase/functions/send-email/index.ts
   ```

2. Update the "from" email address in the code:
   ```typescript
   from: 'Waterstream <notifications@your-domain.com>'
   ```

### Step 6: Set Environment Variables

```bash
# Set your email service API key
supabase secrets set RESEND_API_KEY=re_your_api_key_here

# Or for SendGrid:
# supabase secrets set SENDGRID_API_KEY=SG.your_api_key_here
```

### Step 7: Deploy the Edge Function

```bash
# Deploy the function
supabase functions deploy send-email

# Test the function (optional)
supabase functions invoke send-email --data '{
  "to": "test@example.com",
  "subject": "Test Email",
  "html": "<h1>Hello from Waterstream!</h1>"
}'
```

### Step 8: Update Database Triggers

1. Go to Supabase Dashboard → SQL Editor
2. Open the `supabase-email-function.sql` file
3. Replace these placeholders:
   - `https://your-project.supabase.co` → Your actual Supabase project URL
   - `YOUR_ANON_KEY` → Your Supabase anon/public key
   - `https://your-app-url.com` → Your actual app URL
4. Run the SQL

### Step 9: Test Email Notifications

1. **Test New Task Email:**
   - Login as admin
   - Create a new task for an employee
   - Employee should receive an email

2. **Test Message Email:**
   - Login as employee
   - Click on a task and send a message
   - Admin should receive an email

3. **Test Reply Email:**
   - Login as admin
   - Reply to an employee message
   - Employee should receive an email

## 🛠️ Troubleshooting

### Emails Not Sending?

1. **Check Edge Function Logs:**
   ```bash
   supabase functions logs send-email
   ```

2. **Verify API Key:**
   ```bash
   supabase secrets list
   ```

3. **Test Edge Function Directly:**
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/send-email \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "to": "test@example.com",
       "subject": "Test",
       "html": "<h1>Test</h1>"
     }'
   ```

4. **Check Email Service Dashboard:**
   - Resend: Check activity/logs
   - SendGrid: Check email activity

### Common Issues:

- **"Domain not verified"**: Use test mode or verify your domain
- **"Invalid API key"**: Re-set the secret with correct key
- **"Function not found"**: Re-deploy the function
- **Emails in spam**: Verify domain with SPF/DKIM records

## 💰 Cost Considerations

### Free Tiers:
- **Resend**: 100 emails/day, 3,000/month (FREE)
- **SendGrid**: 100 emails/day (FREE)
- **Supabase Edge Functions**: 500K invocations/month (FREE)

### Paid Plans (if you exceed free tier):
- **Resend**: $20/month for 50K emails
- **SendGrid**: $19.95/month for 50K emails

## 🎨 Customizing Email Templates

Edit the HTML in `supabase-email-function.sql`:

```sql
'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #3b82f6;">New Task Assigned</h2>
  <div style="background: #f8fafc; padding: 20px; border-radius: 8px;">
    <p><strong>Task:</strong> ' || task_name || '</p>
    <p><strong>Start Date:</strong> ' || NEW.start_date || '</p>
    <p><strong>End Date:</strong> ' || NEW.end_date || '</p>
  </div>
  <a href="https://your-app-url.com/employee.html" 
     style="display: inline-block; margin-top: 20px; padding: 12px 24px; 
            background: #3b82f6; color: white; text-decoration: none; 
            border-radius: 8px;">
    View Task in Waterstream
  </a>
</div>'
```

## 🔒 Security Notes

- Never commit API keys to Git
- Use environment variables for all secrets
- The Edge Function uses your anon key (safe for client-side)
- Database triggers run server-side (secure)

## 📝 Optional: Email Preferences

To let users opt-out of emails, add this to your `users` table:

```sql
ALTER TABLE public.users 
ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE;
```

Then update the trigger functions to check this preference before sending.

## ✅ Verification Checklist

- [ ] Email service account created
- [ ] API key obtained
- [ ] Supabase CLI installed
- [ ] Edge function created and deployed
- [ ] Secrets configured
- [ ] SQL triggers installed
- [ ] Test emails received
- [ ] Email templates customized
- [ ] Domain verified (optional but recommended)

## 🆘 Need Help?

- Supabase Docs: https://supabase.com/docs/guides/functions
- Resend Docs: https://resend.com/docs
- SendGrid Docs: https://docs.sendgrid.com

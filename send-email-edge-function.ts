// Supabase Edge Function to Send Emails
// =====================================
// Save this file as: supabase/functions/send-email/index.ts
// Deploy with: supabase functions deploy send-email

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// You can use various email services:
// 1. Resend (recommended - simple and free tier)
// 2. SendGrid
// 3. Mailgun
// 4. AWS SES

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  try {
    const { to, subject, html } = await req.json()

    // Using Resend (https://resend.com) - Free tier: 100 emails/day
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'Waterstream <notifications@your-domain.com>', // Must be verified domain
        to: [to],
        subject: subject,
        html: html
      })
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.message || 'Failed to send email')
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})

/* 
ALTERNATIVE: Using SendGrid

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')

const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SENDGRID_API_KEY}`
  },
  body: JSON.stringify({
    personalizations: [{
      to: [{ email: to }]
    }],
    from: { email: 'notifications@your-domain.com', name: 'Waterstream' },
    subject: subject,
    content: [{
      type: 'text/html',
      value: html
    }]
  })
})
*/

/* 
SETUP INSTRUCTIONS:

1. Install Supabase CLI:
   npm install -g supabase

2. Initialize Supabase in your project:
   supabase init

3. Create the function:
   supabase functions new send-email

4. Copy this code to: supabase/functions/send-email/index.ts

5. Set up Resend (or your preferred email service):
   - Sign up at https://resend.com
   - Get your API key
   - Verify your domain (or use test mode)

6. Set the secret in Supabase:
   supabase secrets set RESEND_API_KEY=re_your_api_key_here

7. Deploy the function:
   supabase functions deploy send-email

8. Update the SQL triggers with your function URL:
   https://your-project.supabase.co/functions/v1/send-email
*/

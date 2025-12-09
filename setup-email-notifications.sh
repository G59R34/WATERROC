#!/bin/bash

# Waterstream Email Notifications Setup Script
# =============================================
# This script will help you set up email notifications

echo "🚀 Waterstream Email Notifications Setup"
echo "========================================"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null
then
    echo "❌ Supabase CLI is not installed."
    echo "📦 Installing Supabase CLI..."
    npm install -g supabase
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install Supabase CLI."
        echo "Please install manually: npm install -g supabase"
        exit 1
    fi
fi

echo "✅ Supabase CLI is installed"
echo ""

# Check if user is logged in
echo "🔐 Checking Supabase login status..."
if ! supabase projects list &> /dev/null; then
    echo "📝 Please login to Supabase..."
    supabase login
fi

echo "✅ Logged in to Supabase"
echo ""

# Get project reference
echo "🔗 Enter your Supabase project reference ID:"
echo "   (Find this in your Supabase dashboard URL: https://supabase.com/dashboard/project/YOUR-PROJECT-REF)"
read -p "Project Reference: " PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
    echo "❌ Project reference is required"
    exit 1
fi

# Link project
echo "🔗 Linking to Supabase project..."
supabase link --project-ref $PROJECT_REF

if [ $? -ne 0 ]; then
    echo "❌ Failed to link project"
    exit 1
fi

echo "✅ Project linked successfully"
echo ""

# Create functions directory if it doesn't exist
if [ ! -d "supabase/functions/send-email" ]; then
    echo "📁 Creating Edge Function..."
    supabase functions new send-email
fi

# Copy the email function
echo "📝 Setting up email function..."
cp send-email-edge-function.ts supabase/functions/send-email/index.ts

echo "✅ Email function created"
echo ""

# Set the API key
echo "🔑 Setting up Resend API key..."
supabase secrets set RESEND_API_KEY=re_9c8XiiaT_BCkVJbng4mYaFFKXFZv9HiWV

if [ $? -ne 0 ]; then
    echo "❌ Failed to set API key"
    exit 1
fi

echo "✅ API key configured"
echo ""

# Deploy the function
echo "🚀 Deploying email function..."
supabase functions deploy send-email

if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy function"
    exit 1
fi

echo "✅ Email function deployed successfully"
echo ""

# Get project URL
echo "📋 Getting your project details..."
PROJECT_URL="https://$PROJECT_REF.supabase.co"

echo ""
echo "✅ Setup Complete!"
echo "===================="
echo ""
echo "📝 Next Steps:"
echo "1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/$PROJECT_REF"
echo "2. Navigate to: SQL Editor"
echo "3. Open the file: supabase-email-function-configured.sql"
echo "4. Copy and paste the SQL into the editor"
echo "5. Click 'Run' to create the email triggers"
echo ""
echo "🧪 Test your setup:"
echo "   supabase functions invoke send-email --data '{\"to\":\"your-email@example.com\",\"subject\":\"Test\",\"html\":\"<h1>It works!</h1>\"}'"
echo ""
echo "📧 Your email function URL:"
echo "   $PROJECT_URL/functions/v1/send-email"
echo ""

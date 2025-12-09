# Waterstream - Complete Setup Guide

## 🌊 Complete Feature List

### ✅ Implemented Features

1. **Time-Based Scheduling (0000-2359)**
   - Each day shows full 24-hour time range
   - Tasks can be scheduled with specific start/end times
   - Time displayed in HH:MM format

2. **Supabase Authentication**
   - Secure user signup and login
   - Session management
   - Role-based access control

3. **Admin Privileges (crouch & hoen only)**
   - Only 'crouch' and 'hoen' usernames can have admin access
   - Database-level constraint enforcement
   - Admin dashboard with full edit capabilities

4. **Real-Time Task Synchronization**
   - Changes made by admin instantly appear in employee view
   - Supabase real-time subscriptions
   - Automatic data refresh

5. **Task Acknowledgements**
   - Employees can acknowledge tasks
   - Admin sees all acknowledgements
   - Timestamp tracking
   - Remove acknowledgement capability

6. **No Default Employees**
   - System starts empty
   - Admins must add employees manually
   - Clean slate for each installation

7. **Complete CRUD Operations**
   - Create, Read, Update, Delete for employees
   - Create, Read, Update, Delete for tasks
   - All operations sync with Supabase

## 🚀 Quick Start Guide

### Step 1: Set Up Supabase

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Note your Project URL and anon key

2. **Run Database Schema**
   - Go to SQL Editor in Supabase
   - Copy all contents from `supabase-schema.sql`
   - Execute the SQL

3. **Verify Tables Created**
   - Check Table Editor for:
     - `users`
     - `employees`
     - `tasks`
     - `task_acknowledgements`

### Step 2: Configure Application

1. **Copy Configuration Template**
   ```bash
   cp config.template.js scripts/config.js
   ```

2. **Edit scripts/config.js**
   ```javascript
   const SUPABASE_URL = 'https://your-project.supabase.co';
   const SUPABASE_ANON_KEY = 'your-anon-key-here';
   const USE_SUPABASE = true;
   ```

3. **Add to .gitignore** (already included)
   ```
   scripts/config.js
   ```

### Step 3: Create Admin Accounts

1. **Open index.html in browser**

2. **Sign up as admin (crouch)**
   - Username: `crouch`
   - Email: `crouch@waterstream.local`
   - Password: (choose strong password)
   - Role: Admin

3. **Sign up as admin (hoen)**
   - Username: `hoen`
   - Email: `hoen@waterstream.local`
   - Password: (choose strong password)
   - Role: Admin

Note: Only these two usernames can be admins due to database constraint.

### Step 4: Create Employee Accounts

1. **Employees sign up**
   - Any username except 'crouch' or 'hoen'
   - Email format: `username@waterstream.local`
   - Choose password
   - Role: Employee

2. **Or use offline mode**
   - Set `USE_SUPABASE = false` in config.js
   - Use demo credentials

## 🎯 Usage Guide

### For Admins (crouch & hoen)

1. **Login**
   - Use admin credentials
   - Select "Admin" role

2. **Add Employees**
   - Click "Add Employee"
   - Enter name and role/position
   - Submit

3. **Create Tasks**
   - Click "Add Task"
   - Select employee
   - Set task name
   - Choose start date and time
   - Choose end date and time
   - Set status
   - Submit

4. **Edit Tasks**
   - Click any task bar in Gantt chart
   - Modify details
   - See acknowledgements from employees
   - Save or delete

5. **Monitor Acknowledgements**
   - View who acknowledged tasks
   - See timestamps
   - Track employee engagement

### For Employees

1. **Login**
   - Use employee credentials
   - Select "Employee" role

2. **View Schedule**
   - See all tasks in read-only Gantt chart
   - View assigned employees and timelines
   - Check task statuses with color coding

3. **Acknowledge Tasks**
   - Click on any task
   - View task details including time
   - Click "Acknowledge Task"
   - Acknowledgement appears instantly to admin

4. **Remove Acknowledgement**
   - Click acknowledged task
   - Click "Remove Acknowledgement"

## 🔄 Real-Time Synchronization

### How It Works

1. **Admin makes changes** (add/edit/delete tasks)
2. **Changes saved to Supabase**
3. **Supabase triggers real-time event**
4. **All connected employees see updates instantly**

### Subscribe to Changes

The system automatically subscribes to:
- Employee changes
- Task changes
- Acknowledgement updates

## 🔒 Security Features

### Admin Restrictions
- Only 'crouch' and 'hoen' can be admins
- Enforced at database level with CHECK constraint
- Cannot be bypassed

### Row Level Security (RLS)
- Users can only view their own profile
- Only admins can modify employees and tasks
- Employees can only acknowledge their own tasks
- All policies enforced by Supabase

### Authentication
- Secure password hashing by Supabase
- Session management
- Automatic token refresh

## 📊 Database Schema Summary

### users
- Stores user profiles linked to Supabase auth
- Tracks admin status
- Links to employees

### employees
- Employee records
- Can be linked to user accounts
- Managed by admins only

### tasks
- Task assignments
- Time-based scheduling
- Status tracking
- Audit trail (created_by, updated_by)

### task_acknowledgements
- Employee task acknowledgements
- Timestamps
- Optional notes
- Unique per user/task

## 🐛 Troubleshooting

### "Admin privileges required"
- Only 'crouch' or 'hoen' usernames can access admin
- Check username spelling
- Verify role selection during login

### "Supabase not initialized"
- Check config.js has correct URL and key
- Verify USE_SUPABASE = true
- Check browser console for errors

### "No employees available"
- System starts empty by design
- Admin must add employees first
- Click "Add Employee" button

### Real-time not working
- Verify Supabase Realtime is enabled in project settings
- Check browser console for subscription errors
- Refresh page to reconnect

### Task not showing
- Check date range in view
- Use "Reset View" button
- Verify task dates are within visible range

## 🎨 Customization

### Add Custom Statuses
1. Edit `supabase-schema.sql`
2. Add status to CHECK constraint
3. Update status dropdowns in HTML
4. Add color in `gantt.css`

### Change Time Display
- Modify `formatTime()` in gantt.js
- Adjust time input types in HTML forms

### Add More Admin Users
- Edit CHECK constraint in database
- Add usernames to admin_usernames list

## 📈 Production Deployment

### Prerequisites
- Static web hosting (Netlify, Vercel, GitHub Pages)
- Supabase project
- Custom domain (optional)

### Steps
1. Configure Supabase with production URLs
2. Enable email authentication
3. Set up custom email templates
4. Configure CORS in Supabase
5. Deploy static files
6. Test authentication flow

### Security Checklist
- [ ] Change default passwords
- [ ] Enable email verification
- [ ] Configure password policies
- [ ] Set up backup schedule
- [ ] Monitor usage logs
- [ ] Configure rate limiting

## 💡 Tips & Best Practices

1. **Regular Backups**
   - Supabase auto-backs up daily
   - Export data regularly for safety

2. **Task Organization**
   - Use consistent naming conventions
   - Set realistic time ranges
   - Update statuses promptly

3. **Employee Engagement**
   - Encourage task acknowledgements
   - Review acknowledgements regularly
   - Use as communication tool

4. **Performance**
   - Keep date range reasonable
   - Limit visible tasks to current period
   - Clear old completed tasks

## 📞 Support

For issues or questions:
1. Check this guide first
2. Review `SUPABASE_SETUP.md`
3. Check Supabase documentation
4. Review browser console for errors

---

**Built with ❤️ for Waterstream**

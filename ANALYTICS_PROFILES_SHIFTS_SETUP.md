# Analytics, Employee Profiles & Shift Scheduling Setup

## 🎉 What's Been Added

### 1. **Analytics Dashboard** 📊
- Real-time performance metrics
- Employee workload analysis
- Task completion rates and on-time performance
- Recent activity feed
- Accessible from admin dashboard via "📊 View Analytics" button

### 2. **Employee Profiles** 👥
- Extended employee information (phone, email, hire date)
- Skills and certifications tracking
- Profile cards with edit functionality
- Accessible from admin dashboard via "👤 Employee Profiles" button

### 3. **Shift Scheduling** 📅
- Weekly calendar view
- Drag-and-drop style shift assignment
- Shift templates (Morning, Day, Evening, Night, Full Day)
- Time off request management
- Accessible from admin dashboard via "📅 Shift Scheduling" button

## 📋 Setup Instructions

### Step 1: Run the SQL Schema
1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Open the file `add-analytics-profiles-shifts.sql`
4. Copy and paste the entire contents into the SQL Editor
5. Click **Run** to create all the new tables, functions, and policies

**What this creates:**
- `employee_profiles` - Extended employee info
- `shift_templates` - Reusable shift definitions
- `employee_shifts` - Shift assignments
- `time_off_requests` - Time off tracking
- `task_time_logs` - Clock in/out for tasks
- `task_metrics` - Performance analytics
- Helper functions for workload calculation
- RLS policies for security

### Step 2: Refresh Your Application
1. Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
2. Log in as admin
3. You should now see three new buttons:
   - "📊 View Analytics"
   - "👤 Employee Profiles"
   - "📅 Shift Scheduling"

## 🚀 Features Overview

### Analytics Dashboard
**URL:** `analytics.html`

**Features:**
- Date range selector (Today, This Week, Month, Quarter, Year, Custom)
- Summary cards showing:
  - Total tasks
  - Completed tasks with percentage
  - On-time completion rate
  - Total hours logged
- Employee performance table with completion rates
- Task status breakdown (visual bars)
- Recent activity feed

### Employee Profiles
**URL:** `profiles.html`

**Features:**
- Grid view of all employee profile cards
- Click any card to edit profile
- Fields:
  - Phone number
  - Email address
  - Hire date
  - Skills (comma-separated)
  - Certifications (comma-separated)
  - Notes
- Visual skill/cert tags on cards

### Shift Scheduling
**URL:** `shifts.html`

**Features:**
- Weekly calendar view (Monday-Sunday)
- Grid layout: employees × days
- Click empty cell to assign shift
- Click shift block to delete
- Week navigation (prev/next)
- Shift templates:
  - Morning Shift (06:00-14:00)
  - Day Shift (08:00-16:00)
  - Evening Shift (14:00-22:00)
  - Night Shift (22:00-06:00)
  - Full Day (08:00-17:00)
- Time off request management
  - Approve/deny pending requests
  - View all time off status

## 🔧 How to Use

### Analytics
1. Click "📊 View Analytics" from admin dashboard
2. Select date range from dropdown
3. View metrics and employee performance
4. Identify top performers and workload distribution

### Employee Profiles
1. Click "👤 Employee Profiles" from admin dashboard
2. See all employee profile cards
3. Click "✏️ Edit Profile" on any card
4. Fill in employee details
5. Add skills/certifications (comma-separated)
6. Click "💾 Save Profile"

### Shift Scheduling
1. Click "📅 Shift Scheduling" from admin dashboard
2. Use week navigation to view different weeks
3. Click "+" Add Shift" or click empty cell
4. Select employee and date
5. Choose shift template or set custom times
6. Click "💾 Save Shift"
7. To delete: click the shift block and confirm
8. Manage time off requests at bottom of page

## 📊 Analytics Data Collection

### Automatic Tracking
- Task completion metrics are automatically calculated when tasks are completed
- The system tracks:
  - Actual hours worked (from time logs)
  - On-time vs late completion
  - Completion dates

### Time Tracking (Future Feature)
- Employees can clock in/out of tasks
- Actual hours are calculated automatically
- Data feeds into analytics dashboard

## 🎯 Tips

1. **Set up profiles first** - Add employee contact info and skills
2. **Create shifts weekly** - Plan shifts for the upcoming week
3. **Check analytics regularly** - Monitor team performance
4. **Review time off requests** - Approve/deny as needed

## 🐛 Troubleshooting

**Issue:** Buttons don't work
- **Fix:** Hard refresh browser (Ctrl+Shift+R)

**Issue:** "Error loading data"
- **Fix:** Ensure SQL schema has been run in Supabase

**Issue:** No employees showing
- **Fix:** Add employees from main admin dashboard first

**Issue:** Analytics shows zero
- **Fix:** You need tasks in the selected date range

## 📝 Database Schema Summary

```
employee_profiles (employee extensions)
├── phone, email, hire_date
├── skills[], certifications[]
└── notes

shift_templates (reusable shifts)
├── name, start_time, end_time
└── color

employee_shifts (assignments)
├── employee_id, shift_date
├── start_time, end_time
└── status

time_off_requests
├── employee_id, start_date, end_date
├── reason, status
└── reviewed_by, reviewed_at

task_time_logs (clock in/out)
├── task_id, employee_id
├── clock_in, clock_out
└── notes

task_metrics (analytics)
├── task_id, actual_hours
├── completed_on_time
└── completion_date
```

## 🎨 Color Coding

**Shift Status Colors:**
- 🔵 Scheduled (default blue)
- 🟢 Completed (green)
- 🔴 Cancelled (red)
- ⚪ No-show (gray)

**Performance Badges:**
- 🟢 Excellent (90%+)
- 🔵 Good (75-89%)
- 🟡 Average (50-74%)
- 🔴 Needs Improvement (<50%)

## 🚀 Next Steps

After setup, consider:
1. Populate employee profiles with contact info
2. Add skills/certifications for each employee
3. Create shift schedules for the week
4. Monitor analytics to identify trends
5. Use insights to optimize task assignments

---

**All features are now integrated and ready to use!** 🎉

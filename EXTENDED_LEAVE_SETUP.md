# Extended Leave System Setup Guide

## Overview
The Extended Leave system provides a restricted view for employees who are on extended leave from work. When an employee's status is set to "extended_leave", they are automatically redirected to a special page that shows only essential company information (announcements and HR contact details) without access to schedules, tasks, or other operational features.

## Database Setup

### 1. Add Extended Leave Status to Database

Run the SQL migration to add the new employment status:

```bash
# Run in Supabase SQL Editor
```

Execute the contents of `add-extended-leave-status.sql`:

```sql
-- Add 'extended_leave' status to employee_profiles

-- Update the employment_status constraint to include 'extended_leave'
ALTER TABLE employee_profiles 
DROP CONSTRAINT IF EXISTS employee_profiles_employment_status_check;

ALTER TABLE employee_profiles
ADD CONSTRAINT employee_profiles_employment_status_check 
CHECK (employment_status IN ('active', 'terminated', 'administrative_leave', 'extended_leave'));
```

## How It Works

### Status Hierarchy
- **Active**: Full access to all system features
- **Administrative Leave**: Access denied, forced logout
- **Extended Leave**: Limited access, redirected to extended-leave.html
- **Terminated**: Access denied, forced logout

### User Flow

1. **Employee sets to Extended Leave**: Admin changes employee status to "extended_leave" in Profiles page
2. **Login Redirect**: When employee logs in, they are automatically redirected to the Extended Leave page
3. **Page Protection**: All main pages (admin, employee, tasks) check status and redirect if needed
4. **Limited Access**: Employee can only view:
   - Company announcements
   - HR contact information
   - Their name and current date
   - Logout button

### Protected Pages
The following pages automatically redirect extended leave employees:
- `admin.html` → `extended-leave.html`
- `employee.html` → `extended-leave.html`
- `employee-tasks.html` → `extended-leave.html`

## Setting an Employee to Extended Leave

1. Log in as Admin
2. Navigate to **Profiles** page
3. Click on the employee you want to put on extended leave
4. Change **Employment Status** dropdown to "Extended Leave"
5. Click **Save Profile**

The employee will be automatically redirected to the extended leave page on their next login or page refresh.

## Extended Leave Page Features

### Information Displayed
- **Status Banner**: Orange banner indicating extended leave status
- **Employee Information**: Employee name and current status
- **Date Information**: Current date (with potential for return date)
- **Company Announcements**: All active announcements posted by admins
- **HR Contact**: Contact information for HR department
- **Logout Button**: Allows employee to sign out

### Customization Options

You can customize the extended leave page by editing `extended-leave.html`:

1. **HR Contact Information** (lines 179-182):
```html
<p>Email: hr@waterroc.com</p>
<p>Phone: (555) 123-4567</p>
```

2. **Page Colors** (lines 15-17):
```css
.status-banner {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}
```

3. **Return Date** (line 132): Enable expected return date display
```html
<p id="returnDateInfo" style="display: none;">
```
Change `display: none` to `display: block` and set the return date dynamically.

## Security Features

### Authentication Checks
- Verifies user is logged in before showing any content
- Checks Supabase session validity
- Loads user profile from database

### Status Verification
- Checks employment status on every page load
- Prevents URL manipulation (direct access to other pages)
- Redirects before any sensitive data loads

### Session Management
- Maintains session storage for user info
- Proper logout clears all session data
- Returns to login page after logout

## Announcements Integration

The Extended Leave page automatically displays company announcements from the `announcements` table. Admins can post announcements that will be visible to extended leave employees.

### Posting Announcements Visible to Extended Leave Employees

1. Log in as Admin
2. Click **Send Announcement** button
3. Enter announcement title and message
4. Click **Send**

The announcement will appear on:
- Admin dashboard (banner)
- Employee dashboard (banner)
- Extended Leave page (announcement list)

## Testing the Feature

### Test Checklist

1. **Set Employee to Extended Leave**
   - [ ] Log in as admin
   - [ ] Open Profiles page
   - [ ] Change an employee's status to "Extended Leave"
   - [ ] Save the profile

2. **Test Login Redirect**
   - [ ] Log out
   - [ ] Log in as the extended leave employee
   - [ ] Verify redirect to extended-leave.html

3. **Test Page Protection**
   - [ ] Try to navigate to employee.html
   - [ ] Try to navigate to employee-tasks.html
   - [ ] Verify redirect back to extended-leave.html

4. **Test Limited Access**
   - [ ] Verify only announcements and contact info visible
   - [ ] Verify no access to schedules or tasks
   - [ ] Verify logout button works

5. **Test Return to Active**
   - [ ] Log in as admin
   - [ ] Change employee back to "Active" status
   - [ ] Log in as that employee
   - [ ] Verify full access restored

## Troubleshooting

### Employee Can Access Main Pages
- Check that `add-extended-leave-status.sql` was run in Supabase
- Verify employment_status column exists in employee_profiles table
- Clear browser cache and session storage
- Check browser console for JavaScript errors

### Extended Leave Page Shows "Loading..."
- Verify Supabase connection is working
- Check that config.js has correct Supabase URL and anon key
- Ensure announcements table exists
- Check browser console for errors

### Status Change Not Taking Effect
- Refresh the page after changing status
- Log out and log back in
- Check that the employee_profiles table was updated
- Verify RLS policies allow reading employment_status

### Announcements Not Showing
- Verify announcements table exists
- Check that some announcements have been created
- Ensure RLS policies allow reading announcements
- Check browser console for query errors

## Files Modified

- **Created**:
  - `add-extended-leave-status.sql` - Database migration
  - `extended-leave.html` - Extended leave page
  - `EXTENDED_LEAVE_SETUP.md` - This guide

- **Modified**:
  - `scripts/login.js` - Added extended leave redirect on login
  - `scripts/admin.js` - Added extended leave check
  - `scripts/employee.js` - Added extended leave check
  - `scripts/employee-tasks.js` - Added extended leave check
  - `profiles.html` - Added "Extended Leave" option to status dropdown

## Future Enhancements

Potential features to add:
- Return date tracking in employee_profiles
- Automatic status change back to active on return date
- Email notifications when status changes
- Custom messages per employee
- Leave duration tracking
- Benefits information display
- Company policy documents access
- Request form for early return

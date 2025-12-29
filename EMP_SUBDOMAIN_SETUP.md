# Employee Portal Subdomain Setup Guide

## Overview

The employee portal is a mobile-friendly web application accessible at `emp.waterroc.com` that allows employees to:
- View their tasks in real-time
- Check their current and upcoming shifts
- Track completed tasks
- Access their schedule on mobile devices

## Files Created

### 1. **emp-login.html**
Employee-only login page with:
- Mobile-optimized design
- Supabase authentication
- Username/email login support
- Remember me functionality
- Auto-redirect if already logged in

### 2. **emp-portal.html**
Main employee portal interface with:
- Real-time task display
- Pull-to-refresh functionality
- Bottom navigation bar
- Responsive design for all screen sizes
- Dark/light theme support
- Auto-refresh every 2 minutes

### 3. **scripts/emp-portal.js**
Portal functionality including:
- Supabase integration
- Task loading and categorization
- Time-based filtering (upcoming, current, completed)
- Session management
- Auto-refresh capabilities

## Subdomain Configuration

### Option 1: GitHub Pages with Separate Repository (Recommended)

For the best subdomain setup with GitHub Pages, create a separate repository:

1. **Create New Repository**:
   - Create a new repo named `employee-portal` (or similar)
   - Copy these files to the new repo:
     - emp-login.html → index.html
     - emp-portal.html
     - scripts/emp-portal.js
     - scripts/config.js
     - scripts/supabase.js (if needed)
     - favicon.png

2. **Add CNAME file to new repo**:
   Create a file named `CNAME` with content: `emp.waterroc.com`

3. **GitHub Repository Settings**:
   - Go to Settings → Pages
   - Enable GitHub Pages from main branch
   - Custom domain: `emp.waterroc.com`
   - Enable "Enforce HTTPS"

4. **DNS Configuration (at your DNS provider)**:
   ```
   Type: CNAME
   Name: emp
   Value: [your-github-username].github.io
   TTL: 3600
   ```

### Option 1b: GitHub Pages - Same Repository

If you prefer to keep everything in one repository:

1. **DNS Configuration**:
   - Keep www.waterroc.com pointing to main GitHub Pages
   - Add another CNAME record:
     ```
     Type: CNAME
     Name: emp
     Value: www.waterroc.com
     TTL: 3600
     ```

2. **Setup URL Redirect**:
   Create `index.html` in root or use JavaScript redirect:
   ```javascript
   if (window.location.hostname === 'emp.waterroc.com') {
       window.location.href = '/emp-login.html';
   }
   ```

3. **Or use a simple index page**:
   Add this to your main index.html:
   ```html
   <script>
   if (window.location.hostname.startsWith('emp.')) {
       window.location.replace('/emp-login.html');
   }
   </script>
   ```

### Option 2: Custom Server

If hosting on a custom server:

1. **Create Virtual Host Configuration**:
   ```nginx
   server {
       listen 80;
       server_name emp.waterroc.com;
       root /path/to/your/workspace;
       index emp-login.html;
       
       location / {
           try_files $uri $uri/ =404;
       }
   }
   ```

2. **DNS Configuration**:
   ```
   Type: A
   Name: emp
   Value: [your-server-ip]
   TTL: 3600
   ```

3. **SSL Certificate** (recommended):
   ```bash
   sudo certbot --nginx -d emp.waterroc.com
   ```

### Option 3: Subdomain Folder Approach

If you can't create a separate subdomain, you can use a folder approach:

1. Create a folder called `emp` in your website root
2. Copy these files to the `emp` folder:
   - emp-login.html (rename to index.html)
   - emp-portal.html
   - scripts/emp-portal.js
   - All other necessary assets

3. Access via: `https://www.waterroc.com/emp/`

## Supabase Configuration

Make sure your Supabase is properly configured:

### 1. Database Tables Required
- `users` - User authentication and profiles
- `employees` - Employee records
- `hourly_tasks` - Hourly task assignments
- `tasks` - Daily/long-term tasks
- `employee_profiles` - Employment status

### 2. Row Level Security (RLS)

Ensure RLS policies allow employees to read their own data:

```sql
-- Allow employees to read their own tasks
CREATE POLICY "Employees can read own tasks"
ON hourly_tasks FOR SELECT
USING (employee_id = auth.uid());

CREATE POLICY "Employees can read own daily tasks"
ON tasks FOR SELECT
USING (employee_id = auth.uid());
```

### 3. Authentication Settings

In Supabase Dashboard → Authentication → URL Configuration:
- Add `emp.waterroc.com` to Redirect URLs
- Add `https://emp.waterroc.com/**` to Site URL

## Testing the Portal

### 1. Test Login
1. Navigate to `https://emp.waterroc.com` (or your test URL)
2. You should see the login page
3. Try logging in with an employee account
4. Should redirect to the portal

### 2. Test Task Display
1. After login, verify tasks load correctly
2. Test pull-to-refresh (swipe down on mobile)
3. Check auto-refresh (wait 2 minutes)
4. Verify task categorization (upcoming, current, completed)

### 3. Mobile Testing
1. Open on mobile device or use browser DevTools
2. Test in portrait and landscape orientations
3. Verify touch interactions work smoothly
4. Check that text is readable without zooming

## Security Considerations

1. **HTTPS Only**: Always use HTTPS in production
2. **Session Management**: Sessions expire after inactivity
3. **Employee-Only Access**: Login page verifies employee role
4. **RLS Policies**: Employees can only see their own data
5. **No Admin Access**: Admin users cannot access this portal

## Troubleshooting

### Login Issues
- **"Configuration error"**: Check that `scripts/config.js` has correct Supabase credentials
- **"Invalid username or password"**: Verify user exists in database with role='employee'
- **Redirect loop**: Clear browser cache and sessionStorage

### Task Loading Issues
- **No tasks showing**: Check RLS policies allow employee to read tasks
- **Tasks not updating**: Verify Supabase connection and check browser console
- **Wrong tasks showing**: Ensure employee_id matches correctly in database

### Mobile Display Issues
- **Text too small**: Check viewport meta tag is present
- **Touch not working**: Clear cache and disable any conflicting browser extensions
- **Layout broken**: Test in different browsers, check CSS loaded correctly

## Features

### Current Features ✅
- Employee-only login
- Real-time task viewing
- Task categorization (upcoming, current, today, completed)
- Pull-to-refresh
- Auto-refresh every 2 minutes
- Current shift display
- Employment status badge
- Mobile-optimized interface
- Bottom navigation
- Logout functionality

### Future Enhancements 🚀
- Task acknowledgement/completion
- Profile editing
- Time clock in/out
- Push notifications
- Offline mode with service workers
- Calendar view
- Task search/filter
- Team chat integration

## Maintenance

### Regular Tasks
1. Monitor Supabase usage and quotas
2. Check error logs regularly
3. Update dependencies monthly
4. Test on new mobile OS versions
5. Backup database regularly

### Updates
To update the portal:
1. Edit the HTML/JS/CSS files
2. Test locally first
3. Deploy to staging environment
4. Test on mobile devices
5. Deploy to production
6. Monitor for errors

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify Supabase configuration
3. Test with different accounts
4. Check DNS propagation (for new subdomains)
5. Review database RLS policies

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [GitHub Pages Custom Domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
- [Mobile Web Best Practices](https://developers.google.com/web/fundamentals/design-and-ux/principles)

---

**Last Updated**: December 29, 2025  
**Version**: 1.0.0

# Employee Portal Deployment Checklist

Use this checklist to ensure proper deployment of the employee portal subdomain.

## Pre-Deployment

### 1. Verify Supabase Configuration

- [ ] Database schema is up to date
- [ ] All required tables exist:
  - [ ] `users`
  - [ ] `employees`
  - [ ] `hourly_tasks`
  - [ ] `tasks`
  - [ ] `employee_profiles`
- [ ] RLS policies are configured correctly
- [ ] Test employee account exists
- [ ] `scripts/config.js` has correct credentials
- [ ] Supabase URL is accessible
- [ ] API keys are valid

### 2. Test Files Locally

- [ ] `emp-login.html` loads without errors
- [ ] `emp-portal.html` loads without errors
- [ ] `scripts/emp-portal.js` has no syntax errors
- [ ] `scripts/subdomain-redirect.js` works
- [ ] All images load (favicon.png)
- [ ] CSS styles apply correctly
- [ ] No console errors in browser

### 3. Test Authentication

- [ ] Can login with valid credentials
- [ ] Invalid credentials show error
- [ ] Employee-only access enforced
- [ ] Admin accounts cannot access
- [ ] Session persists on refresh
- [ ] Remember me works
- [ ] Logout works properly

### 4. Test Task Loading

- [ ] Tasks load from database
- [ ] Upcoming tasks show correctly
- [ ] Current tasks show correctly
- [ ] Completed tasks show correctly
- [ ] Empty states display properly
- [ ] Task counts are accurate
- [ ] Task times format correctly

## Deployment Steps

### Option A: Separate GitHub Repository

#### Step 1: Create New Repository
- [ ] Create new GitHub repository
- [ ] Name: `waterroc-employee-portal`
- [ ] Make it public or private
- [ ] Initialize with README

#### Step 2: Copy Files
Copy these files to new repository:
- [ ] `emp-login.html` → rename to `index.html`
- [ ] `emp-portal.html`
- [ ] `scripts/emp-portal.js`
- [ ] `scripts/config.js`
- [ ] `scripts/supabase.js`
- [ ] `favicon.png`
- [ ] Create `CNAME` file with: `emp.waterroc.com`

#### Step 3: Configure GitHub Pages
- [ ] Go to Settings → Pages
- [ ] Source: Deploy from main branch
- [ ] Custom domain: `emp.waterroc.com`
- [ ] Enforce HTTPS (wait for SSL cert)
- [ ] Save changes

#### Step 4: Configure DNS
Add to your DNS provider:
- [ ] Type: `CNAME`
- [ ] Name: `emp`
- [ ] Value: `[username].github.io`
- [ ] TTL: `3600` (or provider default)
- [ ] Save DNS record

#### Step 5: Wait for Propagation
- [ ] Wait 5-30 minutes for DNS propagation
- [ ] Check with: `nslookup emp.waterroc.com`
- [ ] Or use: https://dnschecker.org
- [ ] Verify CNAME points correctly

#### Step 6: Enable HTTPS
- [ ] In GitHub Pages settings
- [ ] Check "Enforce HTTPS"
- [ ] Wait for certificate provisioning (can take up to 24 hours)
- [ ] Verify SSL certificate is active

### Option B: Same Repository (Simpler)

#### Step 1: Add Files
- [ ] Files already in repository
- [ ] `emp-login.html` exists
- [ ] `emp-portal.html` exists
- [ ] `scripts/emp-portal.js` exists
- [ ] `scripts/subdomain-redirect.js` exists

#### Step 2: Update Main Index
- [ ] `index.html` includes subdomain redirect script
- [ ] Redirect logic works correctly
- [ ] Test on localhost first

#### Step 3: Configure DNS
Add to your DNS provider:
- [ ] Type: `CNAME`
- [ ] Name: `emp`
- [ ] Value: `www.waterroc.com` (or main domain)
- [ ] TTL: `3600`
- [ ] Save DNS record

#### Step 4: Test Subdomain
- [ ] Visit `emp.waterroc.com`
- [ ] Should redirect to `/emp-login.html`
- [ ] Verify redirect works
- [ ] Test login functionality

## Post-Deployment Testing

### 1. DNS & SSL

- [ ] `https://emp.waterroc.com` loads
- [ ] No SSL certificate errors
- [ ] Green padlock shows in browser
- [ ] HTTP redirects to HTTPS
- [ ] No mixed content warnings

### 2. Mobile Testing (iOS)

- [ ] Opens in Safari
- [ ] Login page displays correctly
- [ ] Touch targets are large enough
- [ ] Text is readable without zoom
- [ ] Forms work properly
- [ ] Virtual keyboard doesn't break layout
- [ ] Pull-to-refresh works
- [ ] Bottom navigation works
- [ ] Logout works

### 3. Mobile Testing (Android)

- [ ] Opens in Chrome
- [ ] Login page displays correctly
- [ ] Touch targets work
- [ ] Text is readable
- [ ] Forms work
- [ ] Keyboard doesn't break layout
- [ ] Pull-to-refresh works
- [ ] Navigation works
- [ ] Logout works

### 4. Functionality Testing

- [ ] Login with test employee account
- [ ] Tasks load correctly
- [ ] Refresh button works
- [ ] Pull-to-refresh works
- [ ] Auto-refresh works (wait 2 min)
- [ ] Task categorization correct
- [ ] Time displays accurately
- [ ] Current shift shows
- [ ] Status badge shows
- [ ] Logout redirects to login

### 5. Performance Testing

- [ ] Page loads in < 3 seconds
- [ ] No unnecessary network requests
- [ ] Images load quickly
- [ ] No JavaScript errors
- [ ] No console warnings
- [ ] Smooth animations
- [ ] No layout shifts

### 6. Security Testing

- [ ] Can't access without login
- [ ] Session expires appropriately
- [ ] Can't see other employees' data
- [ ] SQL injection protected (Supabase RLS)
- [ ] XSS protection works
- [ ] HTTPS enforced
- [ ] Passwords not in URL/logs

### 7. Cross-Browser Testing

Desktop:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

Mobile:
- [ ] iOS Safari 12+
- [ ] Chrome Mobile 80+
- [ ] Firefox Mobile 80+
- [ ] Samsung Internet 12+

### 8. Edge Cases

- [ ] No tasks scheduled
- [ ] All tasks completed
- [ ] Task starts in < 1 minute
- [ ] Task starts in > 2 hours
- [ ] Multiple tasks same time
- [ ] Very long task names
- [ ] No internet connection behavior
- [ ] Supabase down behavior

## Supabase Configuration

### 1. Authentication Settings

In Supabase Dashboard → Authentication → URL Configuration:

- [ ] Add `https://emp.waterroc.com` to Site URL
- [ ] Add `https://emp.waterroc.com/**` to Redirect URLs
- [ ] Add `https://emp.waterroc.com/emp-portal.html` to Redirect URLs
- [ ] Save changes

### 2. RLS Policies

Verify these policies exist and work:

```sql
-- Employees can read own tasks
CREATE POLICY "Employees read own hourly_tasks"
ON hourly_tasks FOR SELECT
USING (employee_id = auth.uid());

CREATE POLICY "Employees read own tasks"
ON tasks FOR SELECT
USING (employee_id = auth.uid());

-- Employees can read own profile
CREATE POLICY "Employees read own profile"
ON employee_profiles FOR SELECT
USING (employee_id = auth.uid());
```

Testing:
- [ ] Employee can see own tasks
- [ ] Employee cannot see other tasks
- [ ] Admin access works separately
- [ ] Policies don't conflict

### 3. Database Indexes

For better performance:

```sql
CREATE INDEX IF NOT EXISTS idx_hourly_tasks_employee_date 
ON hourly_tasks(employee_id, task_date);

CREATE INDEX IF NOT EXISTS idx_tasks_employee_dates 
ON tasks(employee_id, start_date, end_date);
```

- [ ] Indexes created
- [ ] Query performance tested
- [ ] No slow queries

## Rollback Plan

If deployment fails:

### Emergency Rollback

1. **DNS Level**
   - [ ] Remove `emp` CNAME record
   - [ ] Wait for DNS propagation (5-30 min)
   - [ ] Verify subdomain no longer resolves

2. **GitHub Pages**
   - [ ] Disable custom domain in settings
   - [ ] Revert to previous commit
   - [ ] Or delete deployment branch

3. **Supabase**
   - [ ] Keep database as-is (safe)
   - [ ] Remove redirect URLs if needed
   - [ ] RLS policies can stay (won't affect main site)

## Monitoring

### First Week

Monitor these daily:
- [ ] Check error logs
- [ ] Monitor Supabase usage
- [ ] Check employee feedback
- [ ] Review access logs
- [ ] Test on different devices
- [ ] Monitor page load times

### Ongoing

Monitor these weekly:
- [ ] Supabase quota usage
- [ ] Error rates
- [ ] User complaints
- [ ] Feature requests
- [ ] Security updates needed

## Success Criteria

Deployment is successful when:

- [x] DNS resolves correctly
- [x] SSL certificate active
- [x] Login works for test employees
- [x] Tasks load and display correctly
- [x] Mobile experience is smooth
- [x] No critical errors in console
- [x] Auto-refresh works
- [x] Performance is acceptable
- [x] Security checks pass

## Go-Live Checklist

Ready to announce to employees:

- [ ] All deployment steps complete
- [ ] All testing passed
- [ ] Monitoring in place
- [ ] Support process defined
- [ ] Documentation ready
- [ ] Training materials prepared
- [ ] Announcement email drafted
- [ ] Supervisors briefed

## Communication Plan

### Before Launch

- [ ] Email to all supervisors
- [ ] Post on company bulletin
- [ ] Share quick start guide
- [ ] Schedule training session

### At Launch

- [ ] Send announcement email
- [ ] Include: `emp.waterroc.com`
- [ ] Attach quick start PDF
- [ ] Provide support contact

### After Launch

- [ ] Monitor for issues (first 3 days)
- [ ] Collect feedback
- [ ] Address urgent issues
- [ ] Plan improvements

## Support Preparation

### Support Team Briefing

- [ ] Train support staff
- [ ] Provide troubleshooting guide
- [ ] Share common issues list
- [ ] Give admin access
- [ ] Test support process

### Documentation

- [ ] Quick start guide available
- [ ] Setup documentation complete
- [ ] FAQ prepared
- [ ] Video tutorial (optional)
- [ ] Troubleshooting guide ready

## Notes

**Deployment Date**: _______________

**Deployed By**: _______________

**Issues Found**:
- 
- 
- 

**Resolutions**:
- 
- 
- 

**Employee Feedback**:
- 
- 
- 

---

**Deployment Status**: ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Rolled Back

**Date Completed**: _______________

**Signed Off By**: _______________

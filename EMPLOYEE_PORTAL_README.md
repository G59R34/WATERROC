# Employee Portal - Mobile Employee Task Management

A mobile-first web application for WaterROC employees to view and manage their tasks on-the-go.

## 🚀 Quick Start

### For Employees

1. **Access the Portal**:
   - Visit `https://emp.waterroc.com` on your mobile device
   - Or go to the main site and you'll be redirected

2. **Login**:
   - Enter your username or email
   - Enter your password
   - Check "Remember me" for faster future logins
   - Tap "Sign In"

3. **View Your Tasks**:
   - See upcoming tasks (next 2 hours)
   - Check current active tasks
   - View all tasks for today
   - Review completed tasks

4. **Refresh**:
   - Pull down to refresh (swipe down gesture)
   - Tap the refresh button (🔄)
   - Auto-refreshes every 2 minutes

### For Administrators

See `EMP_SUBDOMAIN_SETUP.md` for detailed setup instructions.

## 📱 Features

### Current Features

✅ **Mobile-Optimized Design**
- Touch-friendly interface
- Large, tappable buttons
- Readable text without zooming
- Works in portrait and landscape

✅ **Real-Time Task Management**
- View tasks assigned to you
- See upcoming tasks (within 2 hours)
- Track current active tasks
- Review completed tasks
- Auto-categorization by time

✅ **Smart Refresh**
- Pull-to-refresh gesture
- Manual refresh button
- Auto-refresh every 2 minutes
- Updates when app regains focus

✅ **Employee Information**
- Current shift display
- Employment status badge
- Personal task count

✅ **Secure Authentication**
- Supabase-powered login
- Employee-only access
- Session management
- Automatic logout on inactivity

✅ **Responsive Design**
- Works on all screen sizes
- Optimized for phones (primary)
- Works on tablets
- Desktop-friendly (max 600px width)

## 📂 Files

### Core Files

- **emp-login.html** - Employee login page
- **emp-portal.html** - Main portal interface
- **scripts/emp-portal.js** - Portal functionality
- **scripts/subdomain-redirect.js** - Subdomain routing

### Configuration

- **scripts/config.js** - Supabase credentials
- **emp-CNAME** - Subdomain DNS record

### Documentation

- **EMP_SUBDOMAIN_SETUP.md** - Complete setup guide
- **EMPLOYEE_PORTAL_README.md** - This file

## 🎨 Design Principles

### Mobile-First
- Designed for phones primarily
- Touch-optimized interactions
- Large tap targets (minimum 44x44px)
- Easy one-handed use

### Performance
- Fast load times
- Efficient data fetching
- Minimal JavaScript
- Optimized images

### User Experience
- Intuitive navigation
- Clear visual hierarchy
- Instant feedback
- Smooth animations

### Accessibility
- High contrast colors
- Readable fonts
- Clear labels
- Semantic HTML

## 🔧 Technical Details

### Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Hosting**: GitHub Pages (recommended)

### Browser Support

- ✅ iOS Safari 12+
- ✅ Chrome Mobile 80+
- ✅ Firefox Mobile 80+
- ✅ Samsung Internet 12+
- ✅ Desktop browsers (all modern)

### Database Schema

Required tables:
- `users` - User accounts and roles
- `employees` - Employee records
- `hourly_tasks` - Hour-by-hour task assignments
- `tasks` - Daily/long-term tasks
- `employee_profiles` - Employment status

### Security

- **HTTPS Only**: All traffic encrypted
- **RLS Policies**: Row-level security on all tables
- **Employee Scope**: Can only see own data
- **Session Management**: Automatic timeout
- **Role Verification**: Employee role checked on every request

## 📊 Task Categories

### Upcoming Tasks (⏰)
Tasks starting within the next 2 hours.

**Display:**
- Shows time until start
- Highlights urgent tasks (< 30 min)
- Red accent for very soon tasks
- Auto-updates countdown

### Current Tasks (🎯)
Tasks happening right now.

**Display:**
- Blue accent color
- Shows current time window
- Prioritized at top
- Most important section

### All Tasks Today (📅)
Every task scheduled for today.

**Display:**
- Complete daily schedule
- Shows all time slots
- Includes past and future
- Overview of full day

### Completed Tasks (✅)
Tasks marked as completed today.

**Display:**
- Green accent color
- Slightly faded opacity
- Shows completion status
- Sense of accomplishment

## 🔄 Auto-Refresh Behavior

### Automatic Refresh
- Every 2 minutes when app is visible
- Pauses when tab is hidden
- Resumes on tab focus
- Updates time displays every second

### Manual Refresh
- Tap refresh button (🔄)
- Pull-down gesture (mobile)
- Visual feedback on refresh
- Shows loading state

### Smart Updates
- Only fetches changed data
- Preserves scroll position
- Maintains UI state
- Efficient network usage

## 🌐 Offline Support (Future)

Planned features:
- Service worker caching
- Offline task viewing
- Queue actions for sync
- "You're offline" banner

## 🎯 Roadmap

### Phase 1 (Current) ✅
- [x] Login page
- [x] Task viewing
- [x] Mobile optimization
- [x] Auto-refresh

### Phase 2 (Next)
- [ ] Task completion
- [ ] Clock in/out
- [ ] Profile viewing/editing
- [ ] Time tracking

### Phase 3 (Future)
- [ ] Push notifications
- [ ] Task filters
- [ ] Calendar view
- [ ] Team chat
- [ ] Offline mode

### Phase 4 (Advanced)
- [ ] Native mobile app (PWA)
- [ ] Voice commands
- [ ] Geofencing
- [ ] Photo uploads

## 📱 Mobile Testing

### Test Checklist

- [ ] Login works on mobile
- [ ] Tasks load correctly
- [ ] Pull-to-refresh works
- [ ] Bottom nav functions
- [ ] Logout works
- [ ] Landscape mode works
- [ ] Text is readable
- [ ] Buttons are tappable
- [ ] Auto-refresh works
- [ ] Session persists

### Testing Tools

- Chrome DevTools (Device Mode)
- Firefox Responsive Design Mode
- BrowserStack (real devices)
- Physical test devices

### Common Issues

1. **Text too small**: Check viewport meta tag
2. **Buttons hard to tap**: Increase touch target size
3. **Scroll issues**: Check body height/overflow
4. **Layout breaks**: Test in portrait/landscape
5. **Loading issues**: Check network/Supabase

## 🔐 Privacy & Data

### What We Collect
- Login credentials (encrypted)
- Task assignments
- Completion status
- Session tokens (temporary)

### What We Don't Collect
- Location data (yet)
- Contact lists
- Photos/media (yet)
- Personal browsing data

### Data Storage
- All data in Supabase
- Encrypted at rest
- Encrypted in transit
- Regular backups

### Employee Rights
- View your own data
- Cannot see other employees
- Cannot modify task assignments
- Can complete assigned tasks

## 🆘 Support

### Common Issues

**"Cannot login"**
- Verify username/password
- Check if account is active
- Try using email instead
- Contact admin for reset

**"No tasks showing"**
- Pull to refresh
- Check if you have tasks assigned
- Verify date/time is correct
- Log out and back in

**"App is slow"**
- Check internet connection
- Clear browser cache
- Close other tabs
- Try different browser

**"Tasks not updating"**
- Manual refresh (button or pull)
- Check auto-refresh is working
- Verify Supabase connection
- Check browser console

### Getting Help

1. Try the troubleshooting steps above
2. Check browser console for errors
3. Contact your supervisor
4. Email IT support
5. Check documentation

## 📞 Contact

For technical issues or questions:
- **IT Support**: support@waterroc.com
- **Administrator**: admin@waterroc.com
- **Emergency**: Call your supervisor

## 📄 License

Copyright © 2025 WaterROC  
Internal use only - Not for public distribution

---

**Version**: 1.0.0  
**Last Updated**: December 29, 2025  
**Maintained By**: WaterROC IT Department

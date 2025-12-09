# Waterstream Employee Management System

A sophisticated web-based Gantt chart system for managing employee schedules and tasks with **hourly time precision (0000-2359)** and **Supabase integration** for real-time collaboration. Built with pure HTML, CSS, and JavaScript - no frameworks required!

## 🌊 Features

### Admin Dashboard
- **Interactive Gantt Chart** - Visual timeline with employees on vertical axis and days/time on horizontal axis
- **Hourly Time Slots** - Each day shows 0000-2359 time range for precise scheduling
- **Time-Based Task Management** - Assign tasks with specific start and end times (HH:MM format)
- **Full Edit Capabilities** - Add, edit, and delete employees and tasks
- **Color-Coded Status System**:
  - 🔵 Blue: In Progress
  - 🟢 Green: Completed
  - 🟡 Orange: Pending
  - 🔴 Red: Overdue
  - 🟣 Purple: On Hold
- **Date Range Controls** - Customize the visible date range
- **Real-time Sync** - Optional Supabase integration for cloud storage and multi-user collaboration
- **Auto-Save** - Changes are automatically saved (localStorage or Supabase)
- **Modal-Based Editing** - Clean interface for managing data

### Employee Dashboard
- **Read-Only View** - Employees can view the schedule without editing
- **Task Details with Time** - Click on any task to see full details including time ranges
- **Color-Coded Status** - Same color system for easy status identification
- **Responsive Design** - Works on desktop and mobile devices

### Supabase Integration (Optional)
- **Cloud Database** - Store all data in Supabase PostgreSQL
- **Real-time Updates** - See changes instantly across all connected clients
- **Multi-user Support** - Multiple admins can edit simultaneously
- **Data Persistence** - Never lose your data
- **Offline Mode** - Falls back to localStorage if Supabase is not configured

## 🚀 Getting Started

### Quick Start (LocalStorage Mode)
1. Clone or download this repository
2. Open `index.html` in a web browser
3. Login and start adding employees and tasks
4. No setup or dependencies required!

### With Supabase Integration (Recommended for Production)
1. Follow the complete guide in `SUPABASE_SETUP.md`
2. Create a Supabase project and run the SQL schema
3. Copy `config.template.js` to `config.js`
4. Add your Supabase credentials to `config.js`
5. Open `index.html` and enjoy cloud-powered scheduling!

### Demo Credentials

**Admin Access:**
- Username: `admin`
- Password: `admin123`
- Role: Admin

**Employee Access:**
- Username: `employee`
- Password: `emp123`
- Role: Employee

## 📁 File Structure

```
MAGROC/
├── index.html              # Login page
├── admin.html              # Admin dashboard
├── employee.html           # Employee dashboard
├── styles/
│   ├── main.css           # Main styles and layout
│   └── gantt.css          # Gantt chart specific styles
├── scripts/
│   ├── login.js           # Authentication logic
│   ├── gantt.js           # Core Gantt chart functionality
│   ├── admin.js           # Admin-specific features
│   ├── employee.js        # Employee-specific features
│   └── supabase.js        # Supabase integration layer
├── config.template.js      # Configuration template
├── supabase-schema.sql     # Database schema for Supabase
├── SUPABASE_SETUP.md       # Complete Supabase setup guide
└── README.md               # This file
```

## 🎯 How to Use

### Admin Features

1. **Login** - Use admin credentials to access the admin dashboard

2. **Add Employees**
   - Click "Add Employee" button
   - Enter employee name and role
   - Submit to add to the chart

3. **Add Tasks with Precise Timing**
   - Click "Add Task" button
   - Select employee from dropdown
   - Enter task details:
     - **Task name**
     - **Start date and time** (e.g., 09:00)
     - **End date and time** (e.g., 17:00)
     - **Status**
   - Tasks display with time ranges (e.g., "09:00-17:00")
   - Submit to create task

4. **Edit Tasks**
   - Click on any task bar in the chart
   - Modify task details in the modal
   - Save changes or delete the task

5. **Change Date Range**
   - Select start and end dates
   - Click "Update" to refresh the view
   - Use "Reset View" to return to default range

6. **Save Changes**
   - Changes auto-save to localStorage
   - Click "Save Changes" for manual save confirmation

### Employee Features

1. **Login** - Use employee credentials to access the employee dashboard

2. **View Schedule**
   - See all employees and their assigned tasks
   - Color-coded tasks show status at a glance

3. **View Task Details**
   - Click on any task bar
   - See full task information in popup

## 🎨 Color Coding System

The Gantt chart uses an intuitive color system:

- **Blue (In Progress)** - Tasks currently being worked on
- **Green (Completed)** - Finished tasks
- **Orange (Pending)** - Tasks waiting to start
- **Red (Overdue)** - Tasks past their deadline
- **Purple (On Hold)** - Paused tasks

## 💾 Data Storage

- All data is stored in browser's localStorage
- Data persists across browser sessions
- No server or database required
- Each browser stores its own data

## 🌐 Browser Compatibility

Works with all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

## 📱 Responsive Design

- Optimized for desktop viewing
- Mobile-friendly layout
- Horizontal scrolling for long timelines
- Touch-friendly interface

## 🔧 Customization

### Change Color Scheme
Edit color variables in `styles/main.css`:
```css
:root {
    --primary-color: #3b82f6;
    --secondary-color: #64748b;
    /* etc... */
}
```

### Adjust Timeline Display
In `scripts/gantt.js`, modify:
- `dayWidth` - Width of each day column (default: 80px)
- Default date range in `init()` method

### Add More Status Types
1. Add color in CSS (gantt.css)
2. Update status options in HTML forms
3. Add to color legend

## 🛡️ Security Note

This is a demo application using client-side authentication. For production use:
- Implement server-side authentication
- Use secure password hashing
- Add role-based access control
- Store data in a proper database

## 🤝 Support

For issues or questions, please contact your system administrator.

## 📄 License

© 2025 Waterstream. All rights reserved.

---

**Built with ❤️ for Waterstream**

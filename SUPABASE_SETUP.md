# Supabase Integration Guide for Waterstream

## 🚀 Quick Start

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in your project details:
   - **Name**: Waterstream
   - **Database Password**: Choose a strong password
   - **Region**: Choose closest to your users
5. Wait for the project to be provisioned (~2 minutes)

### Step 2: Set Up Database Tables

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy and paste the entire contents of `supabase-schema.sql`
4. Click "Run" to execute the SQL
5. Verify tables were created in **Table Editor**

### Step 3: Get Your API Keys

1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

### Step 4: Configure Your Application

1. Open `config.js` (or create it if it doesn't exist)
2. Add your Supabase credentials:

```javascript
// config.js
const SUPABASE_URL = 'YOUR_PROJECT_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
```

### Step 5: Add Supabase Library to HTML

Add this script tag to your HTML files **before** other script tags:

```html
<!-- Add to admin.html and employee.html -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="scripts/supabase.js"></script>
<script src="scripts/config.js"></script>
```

### Step 6: Initialize Supabase in Your App

Add this to the beginning of `admin.js`:

```javascript
// Initialize Supabase
if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
    supabaseService.init(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Sync data on load
    supabaseService.syncFromSupabase().then(synced => {
        if (synced) {
            console.log('✅ Data synced from Supabase');
            gantt = new GanttChart('ganttChart', true);
        }
    });
} else {
    console.log('⚠️ Running in offline mode (localStorage only)');
}
```

## 📊 Database Schema

### Employees Table

| Column     | Type      | Description                  |
|------------|-----------|------------------------------|
| id         | BIGSERIAL | Primary key (auto-increment) |
| name       | VARCHAR   | Employee name                |
| role       | VARCHAR   | Job title/role               |
| created_at | TIMESTAMP | Creation timestamp           |
| updated_at | TIMESTAMP | Last update timestamp        |

### Tasks Table

| Column      | Type      | Description                              |
|-------------|-----------|------------------------------------------|
| id          | BIGSERIAL | Primary key (auto-increment)             |
| employee_id | BIGINT    | Foreign key to employees                 |
| name        | VARCHAR   | Task name                                |
| start_date  | DATE      | Task start date                          |
| end_date    | DATE      | Task end date                            |
| start_time  | VARCHAR(4)| Start time in HHMM format (e.g., "0900") |
| end_time    | VARCHAR(4)| End time in HHMM format (e.g., "1700")   |
| status      | VARCHAR   | pending/in-progress/completed/etc        |
| created_at  | TIMESTAMP | Creation timestamp                       |
| updated_at  | TIMESTAMP | Last update timestamp                    |

## 🔒 Security Considerations

### For Demo/Development
The current RLS policies allow public read/write access for ease of development.

### For Production
You should implement proper authentication:

1. **Enable Email Authentication**:
   - Go to **Authentication** → **Providers**
   - Enable Email provider
   - Configure email templates

2. **Update RLS Policies**:
   ```sql
   -- Example: Only allow authenticated users
   CREATE POLICY "Authenticated users only"
       ON public.employees
       FOR ALL
       USING (auth.role() = 'authenticated');
   ```

3. **Add User Roles**:
   - Create a `user_roles` table
   - Link users to admin/employee roles
   - Update policies based on roles

## 🔄 Real-Time Updates

Enable real-time synchronization:

```javascript
// In admin.js
supabaseService.subscribeToChanges((type, payload) => {
    console.log(`${type} changed:`, payload);
    
    // Refresh the Gantt chart
    gantt.render();
});
```

## 🧪 Testing Your Integration

### Test Employees API

```javascript
// Add an employee
const employee = await supabaseService.addEmployee('John Doe', 'Developer');

// Get all employees
const employees = await supabaseService.getEmployees();
console.log(employees);
```

### Test Tasks API

```javascript
// Add a task
const task = await supabaseService.addTask(
    1,              // employee_id
    'Test Task',    // name
    '2025-12-08',   // start_date
    '2025-12-10',   // end_date
    '0900',         // start_time
    '1700',         // end_time
    'pending'       // status
);

// Get all tasks
const tasks = await supabaseService.getTasks();
console.log(tasks);
```

## 🐛 Troubleshooting

### "Supabase library not loaded"
- Make sure the CDN script is included before your app scripts
- Check browser console for loading errors

### "Row Level Security policy violation"
- Check your RLS policies in Supabase dashboard
- Ensure policies allow the operation you're trying to perform

### "Cannot read property 'from' of null"
- Verify Supabase is initialized with correct URL and key
- Check that `supabaseService.init()` is called before any operations

### Data not syncing
- Check browser console for errors
- Verify your API keys are correct
- Test connection with: `await supabaseService.getEmployees()`

## 📈 Advanced Features

### Backup to Supabase

```javascript
// Export local data to Supabase
async function backupToSupabase() {
    const localData = JSON.parse(localStorage.getItem('ganttData'));
    
    for (const employee of localData.employees) {
        await supabaseService.addEmployee(employee.name, employee.role);
    }
    
    for (const task of localData.tasks) {
        await supabaseService.addTask(
            task.employeeId,
            task.name,
            task.startDate,
            task.endDate,
            task.startTime || '0000',
            task.endTime || '2359',
            task.status
        );
    }
}
```

### Filter Tasks by Date Range

```javascript
const { data, error } = await supabaseService.client
    .from('tasks')
    .select('*')
    .gte('start_date', '2025-12-01')
    .lte('end_date', '2025-12-31');
```

## 🔗 Useful Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Real-time Subscriptions](https://supabase.com/docs/guides/realtime)

## 💡 Tips

1. **Use Environment Variables**: Don't commit API keys to git
2. **Enable Real-time**: Get instant updates across all connected clients
3. **Set up Backups**: Configure automated backups in Supabase dashboard
4. **Monitor Usage**: Check dashboard for API usage and performance
5. **Test Policies**: Always test RLS policies before deploying

---

Need help? Check the Supabase documentation or community forum!

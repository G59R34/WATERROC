# Deploy Automatic DO System - Quick Start

## ⚠️ IMPORTANT: You MUST deploy the SQL schema before the system will work!

The automatic DO system requires database functions to be deployed to Supabase. Without this, you'll see errors in the console.

## Step 1: Deploy SQL Schema

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Run the SQL File**
   - Open `add-auto-do-system.sql` from your project
   - Copy ALL the contents (278 lines)
   - Paste into the Supabase SQL Editor
   - Click "Run" or press `Ctrl+Enter`

4. **Verify Success**
   - You should see "Success. No rows returned"
   - Check for any error messages

## Step 2: Test the System

1. **Reload the Exceptions Page**
   - Open Developer Console (F12)
   - Navigate to Exceptions & Absence page
   - Look for these console messages:
     - ✅ `DO exceptions ensured for date: 2025-12-09 → X DOs created`
     - OR ℹ️ `No new DO exceptions needed`

2. **Check Exception Logs**
   - Click "Exception Logs" tab
   - Filter by exception code "DO"
   - You should see automatic DOs for employees without shifts

3. **Test Automatic Removal**
   - Go to Shift Scheduling
   - Assign a shift to an employee with a DO
   - The DO should automatically disappear from exception logs

## Troubleshooting

### Error: "function ensure_do_exceptions_for_date does not exist"
**Solution:** The SQL file hasn't been deployed yet. Follow Step 1 above.

### No DOs appearing but no errors
**Possible causes:**
1. All employees already have shifts assigned for today
2. DOs already exist in the database
3. No employees in the database with status 'active'

**Check:**
```sql
-- Run this in Supabase SQL Editor to check:
SELECT * FROM employees WHERE status = 'active' OR status IS NULL;
SELECT * FROM employee_shifts WHERE shift_date = CURRENT_DATE;
SELECT * FROM exception_logs WHERE exception_date = CURRENT_DATE AND exception_code = 'DO';
```

### DOs created but not appearing in UI
**Solution:** 
1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R)
3. Check browser console for errors

## What Gets Created

The SQL file creates:
- ✅ `auto_apply_do_exceptions()` - Function to create DOs for current date
- ✅ `ensure_do_exceptions_for_date(date)` - Function to ensure DOs for specific date
- ✅ `backfill_do_exceptions(start_date, end_date)` - Backfill historical DOs
- ✅ `remove_do_on_shift_insert()` - Trigger function
- ✅ `reapply_do_on_shift_delete()` - Trigger function
- ✅ Two triggers on `employee_shifts` table

## Console Output Reference

**Normal operation:**
```
📅 Checking automatic DO exceptions for date: 2025-12-09
🔧 Calling ensure_do_exceptions_for_date function for: 2025-12-09
✅ DO exceptions ensured for date: 2025-12-09 → 3 DOs created
✅ Auto-created DO exceptions for employees without shifts: [...]
```

**No DOs needed:**
```
📅 Checking automatic DO exceptions for date: 2025-12-09
🔧 Calling ensure_do_exceptions_for_date function for: 2025-12-09
✅ DO exceptions ensured for date: 2025-12-09 → 0 DOs created
ℹ️ No new DO exceptions needed (all employees either have shifts or already have DOs)
```

**Function not deployed:**
```
❌ Database function error: {...}
⚠️ The SQL function "ensure_do_exceptions_for_date" does not exist in your database.
📝 Please run the SQL file: add-auto-do-system.sql
📍 Location: Supabase Dashboard → SQL Editor → paste and run the SQL file
```

## Next Steps After Deployment

1. **Optional: Backfill Historical Data**
   ```sql
   SELECT backfill_do_exceptions('2025-12-01', '2025-12-09');
   ```

2. **Monitor Console**
   - Keep browser console open when using the system
   - Watch for automatic DO messages
   - Check for any errors

3. **Test End-to-End**
   - Apply manual exception → Should appear in logs
   - Assign shift → Automatic DO should be removed
   - Delete shift → Automatic DO should reappear

## Files Modified

- `add-auto-do-system.sql` - SQL schema (DEPLOY THIS FIRST!)
- `scripts/supabase.js` - Backend methods with enhanced logging
- `scripts/exceptions.js` - Frontend logic with debug output
- `scripts/shifts.js` - Automatic DO check on week load
- `AUTO_DO_SETUP.md` - Full documentation
- `DEPLOY_AUTO_DO.md` - This quick start guide

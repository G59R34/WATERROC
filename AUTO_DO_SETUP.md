# Automatic Day Off (DO) Exception System Setup

## Overview
This system automatically tracks which employees have "Day Off" (DO) status when they don't have shifts scheduled. The DO exception is automatically applied and removed based on shift assignments.

## How It Works

### Automatic DO Application
- Every day, employees **without shifts** automatically get a DO exception
- The system checks this when:
  - Loading the exceptions page
  - Loading the shifts page (for the current week)
  - Manually triggered via database function

### Automatic DO Removal
- When a shift is **assigned** to an employee, any automatic DO for that date is removed
- When a shift is **deleted**, the DO is automatically reapplied (if no other shifts exist for that date)

### Manual vs Automatic DOs
- **Automatic DOs** (created by SYSTEM) are automatically removed when shifts are assigned
- **Manual DOs** (created by admins) remain even if shifts are assigned later

## Setup Instructions

### 1. Deploy the SQL Schema

Run the following SQL file in your Supabase SQL Editor:

```bash
add-auto-do-system.sql
```

This creates:
- ✅ `auto_apply_do_exceptions()` - Function to apply DOs for current date
- ✅ `remove_do_on_shift_insert()` - Trigger to remove DO when shift assigned
- ✅ `reapply_do_on_shift_delete()` - Trigger to reapply DO when shift deleted
- ✅ `backfill_do_exceptions(start_date, end_date)` - Backfill DOs for date range
- ✅ `ensure_do_exceptions_for_date(target_date)` - Ensure DOs for specific date
- ✅ Two triggers on `employee_shifts` table

### 2. Run Initial Backfill (Optional)

To backfill DO exceptions for past dates, run in Supabase SQL Editor:

```sql
-- Backfill for the past 30 days
SELECT backfill_do_exceptions(
    CURRENT_DATE - INTERVAL '30 days', 
    CURRENT_DATE
);
```

Or for a specific date range:

```sql
-- Backfill from December 1 to December 31, 2025
SELECT backfill_do_exceptions(
    '2025-12-01'::DATE, 
    '2025-12-31'::DATE
);
```

### 3. Verify the System is Working

After deployment, the system automatically runs when:

1. **Exceptions Page Load**: Ensures DOs for today
2. **Shifts Page Load**: Ensures DOs for the entire week being viewed
3. **Shift Assignment**: Automatic DO removal via trigger
4. **Shift Deletion**: Automatic DO reapplication via trigger

Check the browser console for messages like:
```
✅ Auto-created DO exceptions for employees without shifts: [...]
✅ Removed DO exception for employee X on 2025-12-09
```

## Database Functions Reference

### ensure_do_exceptions_for_date(date)
Called automatically from frontend to ensure all employees without shifts have DOs.

**Usage from SQL:**
```sql
SELECT * FROM ensure_do_exceptions_for_date('2025-12-09');
```

**Returns:** List of employees who had DO exceptions created

### auto_apply_do_exceptions()
Applies DOs for all employees without shifts on the current date.

**Usage from SQL:**
```sql
SELECT auto_apply_do_exceptions();
```

### backfill_do_exceptions(start_date, end_date)
Backfills DO exceptions for a date range.

**Usage from SQL:**
```sql
SELECT backfill_do_exceptions('2025-12-01', '2025-12-31');
```

## Frontend Integration

The system is integrated into:

### scripts/supabase.js
New methods added:
- `ensureDOExceptions(date)` - Ensure DOs for a specific date
- `backfillDOExceptions(startDate, endDate)` - Backfill date range
- `autoApplyDOExceptions()` - Apply DOs for current date

### scripts/exceptions.js
- Calls `ensureDOExceptions()` on page load for today
- Employees are now properly loaded into dropdowns

### scripts/shifts.js
- Calls `ensureDOExceptions()` for each day in the viewed week
- Ensures DOs are up to date when viewing/editing shifts

## How to Test

### Test Automatic DO Creation
1. Go to Exceptions & Absence page
2. Check Exception Logs tab
3. Filter by exception code "DO"
4. You should see automatic DOs for employees without shifts today

### Test Automatic DO Removal
1. Go to Shift Scheduling page
2. Assign a shift to an employee who has a DO for that date
3. Save the shift
4. Go back to Exceptions page
5. The DO for that employee on that date should be gone

### Test Automatic DO Reapplication
1. Go to Shift Scheduling page
2. Delete a shift from an employee
3. Go to Exceptions page
4. The employee should now have a DO for that date again

## Troubleshooting

### No employees showing in exceptions page
**Fixed!** The employee loading now includes proper error handling and logging.

Check browser console for:
```javascript
Loaded employees: [...]
✅ Employees loaded into dropdowns
```

### DOs not being created
1. Check that `add-auto-do-system.sql` was run successfully
2. Run manually in SQL Editor:
   ```sql
   SELECT * FROM ensure_do_exceptions_for_date(CURRENT_DATE);
   ```
3. Check browser console for errors

### DOs not being removed when shifts assigned
1. Verify triggers are active:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname LIKE '%do%';
   ```
2. Check trigger is firing:
   ```sql
   -- After assigning a shift, check for NOTICE messages
   ```

## Database Schema Changes

### employee_shifts table
Already has exception columns from `add-exception-codes.sql`:
- `exception_code` TEXT
- `exception_reason` TEXT
- `exception_approved_by` TEXT
- `exception_approved_at` TIMESTAMPTZ
- `exception_start_time` TIME
- `exception_end_time` TIME

### exception_logs table
Already exists from `add-exception-codes.sql`:
- Stores all exception events
- `created_by` field indicates 'SYSTEM' for automatic DOs
- `approved_by` is 'SYSTEM' for automatic DOs

## Advanced Usage

### Schedule Daily DO Application (Optional)

If you have pg_cron extension enabled, you can schedule automatic DO application:

```sql
-- Run daily at 1 AM
SELECT cron.schedule(
    'auto-apply-do-daily',
    '0 1 * * *',
    $$SELECT auto_apply_do_exceptions()$$
);
```

### Manual Override

To manually create a DO that won't be removed by triggers:

1. Use the Exceptions page UI to apply DO
2. The `created_by` will be the admin username (not 'SYSTEM')
3. These DOs persist even when shifts are assigned

## Next Steps

1. ✅ Deploy `add-auto-do-system.sql` to Supabase
2. ✅ (Optional) Run backfill for historical dates
3. ✅ Test the system end-to-end
4. ✅ Monitor browser console for automatic DO messages
5. ✅ Check Exception Logs to verify DOs are being created/removed correctly

## Files Modified

- ✅ `add-auto-do-system.sql` - New SQL schema for auto DO system
- ✅ `scripts/supabase.js` - Added 3 new methods for DO management
- ✅ `scripts/exceptions.js` - Fixed employee loading, added auto DO check on load
- ✅ `scripts/shifts.js` - Added auto DO check for viewed week
- ✅ `AUTO_DO_SETUP.md` - This documentation

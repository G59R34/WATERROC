# SMP and 401k Implementation Notes

## SQL Files to Run:
1. `add-smp-401k-system.sql` - Creates all tables and functions for SMP and 401k

## Features Added:

### Admin Features:
- **Stock Management**: Add new stocks dynamically via admin panel
- Button: "Manage Stocks" in Stock Market section
- Modal allows creating stocks with symbol, company name, initial price, and volatility

### Employee Features:
- **401k Plan**: 
  - Enroll in 401k with contribution percentage
  - View balance, contributions, employer match
  - Update contribution percentage
  - Pause contributions
  - View contribution history
  
- **Stock Market Purchase Plan (SMP)**:
  - Enroll in SMP with contribution percentage
  - Select which stock to purchase
  - View total shares purchased
  - Update contribution percentage
  - Pause contributions
  - View purchase history

### Accountant Features (to be added):
- Process 401k contributions during payroll
- Process SMP contributions during payroll
- Deduct contributions from gross pay before taxes

## Next Steps:
1. Add JavaScript handlers in admin.js for stock management
2. Add JavaScript handlers in employee.js for 401k/SMP
3. Update accountant.js to process contributions during payroll
4. Test the full flow





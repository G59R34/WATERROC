// Accountant Dashboard Script with Comprehensive Payroll Simulation
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'accountant') {
        window.location.href = 'index.html';
        return;
    }
    
    // Initialize variables
    let employees = [];
    let payrollHistory = [];
    let totalMoney = parseFloat(localStorage.getItem('accountantTotalMoney') || '0');
    let taxConfig = {
        federalTaxRate: parseFloat(localStorage.getItem('federalTaxRate') || '22'),
        stateTaxRate: parseFloat(localStorage.getItem('stateTaxRate') || '5'),
        socialSecurityRate: parseFloat(localStorage.getItem('socialSecurityRate') || '6.2'),
        medicareRate: parseFloat(localStorage.getItem('medicareRate') || '1.45'),
        unemploymentRate: parseFloat(localStorage.getItem('unemploymentRate') || '2.7'),
        healthInsurance: parseFloat(localStorage.getItem('healthInsurance') || '200')
    };
    
    // Update money display
    function updateMoneyDisplay() {
        const moneyDisplay = document.getElementById('totalMoney');
        if (moneyDisplay) {
            moneyDisplay.textContent = `$${totalMoney.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
    }
    
    // Load tax configuration
    function loadTaxConfig() {
        document.getElementById('federalTaxRate').value = taxConfig.federalTaxRate;
        document.getElementById('stateTaxRate').value = taxConfig.stateTaxRate;
        document.getElementById('socialSecurityRate').value = taxConfig.socialSecurityRate;
        document.getElementById('medicareRate').value = taxConfig.medicareRate;
        document.getElementById('unemploymentRate').value = taxConfig.unemploymentRate;
        document.getElementById('healthInsurance').value = taxConfig.healthInsurance;
    }
    
    // Save tax configuration
    function saveTaxConfig() {
        taxConfig.federalTaxRate = parseFloat(document.getElementById('federalTaxRate').value);
        taxConfig.stateTaxRate = parseFloat(document.getElementById('stateTaxRate').value);
        taxConfig.socialSecurityRate = parseFloat(document.getElementById('socialSecurityRate').value);
        taxConfig.medicareRate = parseFloat(document.getElementById('medicareRate').value);
        taxConfig.unemploymentRate = parseFloat(document.getElementById('unemploymentRate').value);
        taxConfig.healthInsurance = parseFloat(document.getElementById('healthInsurance').value);
        
        localStorage.setItem('federalTaxRate', taxConfig.federalTaxRate);
        localStorage.setItem('stateTaxRate', taxConfig.stateTaxRate);
        localStorage.setItem('socialSecurityRate', taxConfig.socialSecurityRate);
        localStorage.setItem('medicareRate', taxConfig.medicareRate);
        localStorage.setItem('unemploymentRate', taxConfig.unemploymentRate);
        localStorage.setItem('healthInsurance', taxConfig.healthInsurance);
    }
    
    // Calculate taxes for an employee
    function calculateTaxes(grossPay) {
        const federalTax = grossPay * (taxConfig.federalTaxRate / 100);
        const stateTax = grossPay * (taxConfig.stateTaxRate / 100);
        const socialSecurity = grossPay * (taxConfig.socialSecurityRate / 100);
        const medicare = grossPay * (taxConfig.medicareRate / 100);
        const unemployment = grossPay * (taxConfig.unemploymentRate / 100);
        const healthInsurance = taxConfig.healthInsurance;
        
        const totalTaxes = federalTax + stateTax + socialSecurity + medicare + unemployment;
        const totalDeductions = totalTaxes + healthInsurance;
        const netPay = grossPay - totalDeductions;
        
        return {
            grossPay,
            federalTax,
            stateTax,
            socialSecurity,
            medicare,
            unemployment,
            healthInsurance,
            totalTaxes,
            totalDeductions,
            netPay
        };
    }
    
    // Calculate employee payroll based on payroll hours set by admin
    async function calculateEmployeePayroll(employee, startDate, endDate) {
        // Default hourly rate based on role
        const hourlyRates = {
            'Project Manager': 45,
            'Senior Developer': 55,
            'Developer': 40,
            'UX Designer': 42,
            'Designer': 35,
            'Administrator': 30,
            'Employee': 25
        };
        
        let totalHours = 0;
        let hourlyRate = hourlyRates[employee.role] || 25;
        
        // Get hours from payroll_hours table (set by admin)
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            try {
                const payrollHours = await supabaseService.getPayrollHours(
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0],
                    employee.id
                );
                
                if (payrollHours && payrollHours.length > 0) {
                    const hoursData = payrollHours[0];
                    totalHours = parseFloat(hoursData.hours) || 0;
                    if (hoursData.hourly_rate) {
                        hourlyRate = parseFloat(hoursData.hourly_rate);
                    }
                }
            } catch (error) {
                console.error('Error getting payroll hours:', error);
            }
        }
        
        // If no payroll hours found, calculate from shifts as fallback
        if (totalHours === 0) {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                try {
                    const shifts = await supabaseService.getEmployeeShifts(
                        startDate.toISOString().split('T')[0],
                        endDate.toISOString().split('T')[0]
                    );
                    
                    const employeeShifts = shifts?.filter(s => s.employee_id === employee.id) || [];
                    
                    employeeShifts.forEach(shift => {
                        if (shift.start_time && shift.end_time) {
                            const start = shift.start_time.split(':').map(Number);
                            const end = shift.end_time.split(':').map(Number);
                            const startMinutes = start[0] * 60 + (start[1] || 0);
                            const endMinutes = end[0] * 60 + (end[1] || 0);
                            const hours = (endMinutes - startMinutes) / 60;
                            if (hours > 0) totalHours += hours;
                        }
                    });
                } catch (error) {
                    console.error('Error calculating hours from shifts:', error);
                }
            }
        }
        
        // If still no hours, use default 40 hours per week
        if (totalHours === 0) {
            const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
            const weeks = daysDiff / 7;
            totalHours = weeks * 40; // 40 hours per week
        }
        
        const grossPay = totalHours * hourlyRate;
        const payroll = calculateTaxes(grossPay);
        
        return {
            employee,
            hours: totalHours,
            hourlyRate,
            ...payroll
        };
    }
    
    // Load employees (only those with accountant access)
    async function loadEmployees() {
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('employee payroll data');
        }
        
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            // Get only employees with accountant access
            const accessList = await supabaseService.getAccountantAccessibleEmployees();
            const allEmployees = await supabaseService.getEmployees() || [];
            
            // Filter to only employees with accountant access
            const accessibleEmployeeIds = new Set(accessList.map(a => a.employee_id));
            employees = allEmployees.filter(emp => accessibleEmployeeIds.has(emp.id));
            
            if (employees.length === 0) {
                employees = allEmployees; // Fallback: show all if no access settings
            }
        } else {
            // Fallback: use localStorage
            const ganttData = localStorage.getItem('ganttData');
            if (ganttData) {
                const data = JSON.parse(ganttData);
                employees = data.employees || [];
            }
        }
        
        renderEmployeePayroll();
        updatePayrollSummary();
    }
    
    // Render employee payroll list
    function renderEmployeePayroll() {
        const list = document.getElementById('employeePayrollList');
        if (!list) return;
        
        if (employees.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No employees found</div>';
            return;
        }
        
        list.innerHTML = employees.map(emp => {
            return `
                <div class="employee-payroll-item" data-employee-id="${emp.id}" style="cursor: pointer;">
                    <div>
                        <div style="font-weight: 600; color: var(--text-primary, #1f2937);">${emp.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary, #6b7280);">${emp.role}</div>
                    </div>
                    <div>
                        <div class="payroll-amount" id="payroll-${emp.id}">$0.00</div>
                        <div style="font-size: 11px; color: #6b7280; margin-top: 4px;" id="payroll-hours-${emp.id}">0 hours</div>
                    </div>
                </div>
                <div class="tax-breakdown" id="tax-breakdown-${emp.id}" style="display: none; margin-top: 10px; padding: 15px; background: #f8fafc; border-radius: 8px;">
                    <div class="tax-item">
                        <span>Gross Pay:</span>
                        <span id="gross-${emp.id}">$0.00</span>
                    </div>
                    <div class="tax-item">
                        <span>Federal Tax (${taxConfig.federalTaxRate}%):</span>
                        <span id="federal-${emp.id}">$0.00</span>
                    </div>
                    <div class="tax-item">
                        <span>State Tax (${taxConfig.stateTaxRate}%):</span>
                        <span id="state-${emp.id}">$0.00</span>
                    </div>
                    <div class="tax-item">
                        <span>Social Security (${taxConfig.socialSecurityRate}%):</span>
                        <span id="ss-${emp.id}">$0.00</span>
                    </div>
                    <div class="tax-item">
                        <span>Medicare (${taxConfig.medicareRate}%):</span>
                        <span id="medicare-${emp.id}">$0.00</span>
                    </div>
                    <div class="tax-item">
                        <span>Unemployment (${taxConfig.unemploymentRate}%):</span>
                        <span id="unemployment-${emp.id}">$0.00</span>
                    </div>
                    <div class="tax-item">
                        <span>Health Insurance:</span>
                        <span id="health-${emp.id}">$${taxConfig.healthInsurance.toFixed(2)}</span>
                    </div>
                    <div class="tax-item total">
                        <span>Net Pay:</span>
                        <span id="net-${emp.id}">$0.00</span>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click handlers to show/hide tax breakdown
        employees.forEach(emp => {
            const item = list.querySelector(`[data-employee-id="${emp.id}"]`);
            if (item) {
                item.addEventListener('click', () => {
                    const breakdown = document.getElementById(`tax-breakdown-${emp.id}`);
                    if (breakdown) {
                        breakdown.style.display = breakdown.style.display === 'none' ? 'block' : 'none';
                    }
                });
            }
        });
    }
    
    // Update payroll summary
    function updatePayrollSummary() {
        document.getElementById('totalEmployees').textContent = employees.length;
        
        // Calculate totals (will be updated when payroll is processed)
        let totalGross = 0;
        let totalTaxes = 0;
        let totalDeductions = 0;
        let totalNet = 0;
        
        employees.forEach(emp => {
            const payrollEl = document.getElementById(`payroll-${emp.id}`);
            if (payrollEl) {
                const amount = parseFloat(payrollEl.textContent.replace('$', '').replace(/,/g, ''));
                if (!isNaN(amount)) {
                    totalNet += amount;
                }
            }
        });
        
        document.getElementById('totalGrossPay').textContent = `$${totalGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('totalTaxes').textContent = `$${totalTaxes.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('totalDeductions').textContent = `$${totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('netPayroll').textContent = `$${totalNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    // Process payroll
    async function processPayroll() {
        const startDate = new Date(document.getElementById('payPeriodStart').value);
        const endDate = new Date(document.getElementById('payPeriodEnd').value);
        const payDate = document.getElementById('payDate').value;
        
        if (!startDate || !endDate || !payDate) {
            alert('Please fill in all date fields');
            return;
        }
        
        if (typeof showFormLoadingScreen !== 'undefined') {
            showFormLoadingScreen('payroll processing');
        }
        
        let totalGross = 0;
        let totalTaxes = 0;
        let totalDeductions = 0;
        let totalNet = 0;
        
        const payrollResults = [];
        
        for (const employee of employees) {
            const payroll = await calculateEmployeePayroll(employee, startDate, endDate);
            payrollResults.push(payroll);
            
            totalGross += payroll.grossPay;
            totalTaxes += payroll.totalTaxes;
            totalDeductions += payroll.totalDeductions;
            totalNet += payroll.netPay;
            
            // Update employee payroll display with detailed breakdown
            const payrollEl = document.getElementById(`payroll-${employee.id}`);
            const hoursEl = document.getElementById(`payroll-hours-${employee.id}`);
            if (payrollEl) {
                payrollEl.textContent = `$${payroll.netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
            if (hoursEl) {
                hoursEl.textContent = `${payroll.hours.toFixed(1)} hours @ $${payroll.hourlyRate}/hr`;
            }
            
            // Update detailed tax breakdown
            document.getElementById(`gross-${employee.id}`).textContent = `$${payroll.grossPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById(`federal-${employee.id}`).textContent = `$${payroll.federalTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById(`state-${employee.id}`).textContent = `$${payroll.stateTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById(`ss-${employee.id}`).textContent = `$${payroll.socialSecurity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById(`medicare-${employee.id}`).textContent = `$${payroll.medicare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById(`unemployment-${employee.id}`).textContent = `$${payroll.unemployment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById(`health-${employee.id}`).textContent = `$${payroll.healthInsurance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById(`net-${employee.id}`).textContent = `$${payroll.netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        
        // Update summary
        document.getElementById('totalGrossPay').textContent = `$${totalGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('totalTaxes').textContent = `$${totalTaxes.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('totalDeductions').textContent = `$${totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('netPayroll').textContent = `$${totalNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        // Save to Supabase
        let payrollHistoryId = null;
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            try {
                const historyData = {
                    pay_period_start: startDate.toISOString().split('T')[0],
                    pay_period_end: endDate.toISOString().split('T')[0],
                    pay_date: payDate,
                    employee_count: employees.length,
                    total_gross: totalGross,
                    total_taxes: totalTaxes,
                    total_deductions: totalDeductions,
                    total_net: totalNet,
                    payroll_details: payrollResults
                };
                
                const result = await supabaseService.savePayrollHistory(historyData);
                if (result.data) {
                    payrollHistoryId = result.data.id;
                }
            } catch (error) {
                console.error('Error saving payroll history to Supabase:', error);
            }
        }
        
        // Add to local payroll history
        const historyItem = {
            id: payrollHistoryId || Date.now(),
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            payDate: payDate,
            totalGross,
            totalTaxes,
            totalDeductions,
            totalNet,
            employeeCount: employees.length,
            results: payrollResults
        };
        
        payrollHistory.unshift(historyItem);
        localStorage.setItem('payrollHistory', JSON.stringify(payrollHistory));
        
        renderPayrollHistory();
        
        // Send emails to employees
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady() && payrollHistoryId) {
            await sendPayrollEmails(payrollHistoryId, payrollResults, startDate, endDate, payDate);
        }
        
        alert(`✅ Payroll processed successfully!\n\nTotal Net Payroll: $${totalNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
    
    // Send payroll emails to employees
    async function sendPayrollEmails(payrollHistoryId, payrollResults, startDate, endDate, payDate) {
        if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
            return;
        }
        
        let emailsSent = 0;
        let emailsFailed = 0;
        
        for (const result of payrollResults) {
            try {
                // Get employee email from profile
                let employeeEmail = null;
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    const profile = await supabaseService.getEmployeeProfile(result.employee.id);
                    if (profile && profile.email) {
                        employeeEmail = profile.email;
                    }
                }
                
                // If no email in profile, try to get from user account
                if (!employeeEmail && result.employee.user_id) {
                    const user = await supabaseService.getUserById(result.employee.user_id);
                    if (user && user.email) {
                        employeeEmail = user.email;
                    }
                }
                
                if (!employeeEmail) {
                    console.warn(`No email found for employee ${result.employee.name}`);
                    await supabaseService.logPayrollEmail(
                        payrollHistoryId,
                        result.employee.id,
                        null,
                        'Payroll Statement',
                        false,
                        'No email address found'
                    );
                    emailsFailed++;
                    continue;
                }
                
                // Generate email HTML
                const emailHTML = generatePayrollEmailHTML(result, startDate, endDate, payDate);
                const subject = `Payroll Statement - ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;
                
                // Send email
                const emailResult = await supabaseService.sendPayrollEmail(employeeEmail, subject, emailHTML);
                
                // Log email
                await supabaseService.logPayrollEmail(
                    payrollHistoryId,
                    result.employee.id,
                    employeeEmail,
                    subject,
                    emailResult.success,
                    emailResult.error
                );
                
                if (emailResult.success) {
                    emailsSent++;
                } else {
                    emailsFailed++;
                }
            } catch (error) {
                console.error(`Error sending email to ${result.employee.name}:`, error);
                emailsFailed++;
                
                await supabaseService.logPayrollEmail(
                    payrollHistoryId,
                    result.employee.id,
                    null,
                    'Payroll Statement',
                    false,
                    error.message
                );
            }
        }
        
        // Update payroll history email status
        if (emailsSent > 0 && payrollHistoryId) {
            await supabaseService.updatePayrollHistoryEmailStatus(payrollHistoryId);
        }
        
        console.log(`📧 Payroll emails sent: ${emailsSent} successful, ${emailsFailed} failed`);
    }
    
    // Generate payroll email HTML
    function generatePayrollEmailHTML(payrollResult, startDate, endDate, payDate) {
        const periodStart = new Date(startDate).toLocaleDateString();
        const periodEnd = new Date(endDate).toLocaleDateString();
        const payDateFormatted = new Date(payDate).toLocaleDateString();
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; }
                    .content { background-color: #f9fafb; padding: 20px; margin-top: 20px; }
                    .section { margin-bottom: 20px; }
                    .section-title { font-weight: bold; font-size: 18px; margin-bottom: 10px; color: #1f2937; }
                    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
                    .row.total { font-weight: bold; font-size: 18px; border-top: 2px solid #3b82f6; margin-top: 10px; padding-top: 10px; }
                    .label { color: #6b7280; }
                    .value { font-weight: 600; color: #1f2937; }
                    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Payroll Statement</h1>
                        <p>WaterROC Payroll Department</p>
                    </div>
                    <div class="content">
                        <div class="section">
                            <div class="row">
                                <span class="label">Employee:</span>
                                <span class="value">${payrollResult.employee.name}</span>
                            </div>
                            <div class="row">
                                <span class="label">Pay Period:</span>
                                <span class="value">${periodStart} - ${periodEnd}</span>
                            </div>
                            <div class="row">
                                <span class="label">Pay Date:</span>
                                <span class="value">${payDateFormatted}</span>
                            </div>
                        </div>
                        
                        <div class="section">
                            <div class="section-title">Earnings</div>
                            <div class="row">
                                <span class="label">Hours Worked:</span>
                                <span class="value">${payrollResult.hours.toFixed(2)}</span>
                            </div>
                            <div class="row">
                                <span class="label">Hourly Rate:</span>
                                <span class="value">$${payrollResult.hourlyRate.toFixed(2)}</span>
                            </div>
                            <div class="row">
                                <span class="label">Gross Pay:</span>
                                <span class="value">$${payrollResult.grossPay.toFixed(2)}</span>
                            </div>
                        </div>
                        
                        <div class="section">
                            <div class="section-title">Deductions</div>
                            <div class="row">
                                <span class="label">Federal Tax:</span>
                                <span class="value">$${payrollResult.federalTax.toFixed(2)}</span>
                            </div>
                            <div class="row">
                                <span class="label">State Tax:</span>
                                <span class="value">$${payrollResult.stateTax.toFixed(2)}</span>
                            </div>
                            <div class="row">
                                <span class="label">Social Security:</span>
                                <span class="value">$${payrollResult.socialSecurity.toFixed(2)}</span>
                            </div>
                            <div class="row">
                                <span class="label">Medicare:</span>
                                <span class="value">$${payrollResult.medicare.toFixed(2)}</span>
                            </div>
                            <div class="row">
                                <span class="label">Unemployment:</span>
                                <span class="value">$${payrollResult.unemployment.toFixed(2)}</span>
                            </div>
                            <div class="row">
                                <span class="label">Health Insurance:</span>
                                <span class="value">$${payrollResult.healthInsurance.toFixed(2)}</span>
                            </div>
                            <div class="row">
                                <span class="label">Total Deductions:</span>
                                <span class="value">$${payrollResult.totalDeductions.toFixed(2)}</span>
                            </div>
                        </div>
                        
                        <div class="section">
                            <div class="row total">
                                <span>Net Pay:</span>
                                <span>$${payrollResult.netPay.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="footer">
                        <p>This is an automated payroll statement from WaterROC.</p>
                        <p>If you have any questions, please contact your administrator.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }
    
    // Load payroll history from Supabase
    async function loadPayrollHistory() {
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            try {
                const history = await supabaseService.getPayrollHistory(50);
                if (history && history.length > 0) {
                    payrollHistory = history.map(item => ({
                        id: item.id,
                        startDate: item.pay_period_start,
                        endDate: item.pay_period_end,
                        payDate: item.pay_date,
                        totalGross: parseFloat(item.total_gross),
                        totalTaxes: parseFloat(item.total_taxes),
                        totalDeductions: parseFloat(item.total_deductions),
                        totalNet: parseFloat(item.total_net),
                        employeeCount: item.employee_count,
                        results: item.payroll_details || []
                    }));
                }
            } catch (error) {
                console.error('Error loading payroll history:', error);
            }
        }
        
        // Also load from localStorage as fallback
        const localHistory = localStorage.getItem('payrollHistory');
        if (localHistory) {
            try {
                const parsed = JSON.parse(localHistory);
                // Merge with Supabase data (avoid duplicates)
                parsed.forEach(item => {
                    if (!payrollHistory.find(h => h.id === item.id)) {
                        payrollHistory.push(item);
                    }
                });
            } catch (error) {
                console.error('Error parsing local payroll history:', error);
            }
        }
        
        renderPayrollHistory();
    }
    
    // Render payroll history
    function renderPayrollHistory() {
        const historyList = document.getElementById('payrollHistoryList');
        if (!historyList) return;
        
        if (payrollHistory.length === 0) {
            historyList.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No payroll history yet</div>';
            return;
        }
        
        // Sort by date (newest first)
        const sortedHistory = [...payrollHistory].sort((a, b) => {
            const dateA = new Date(a.startDate);
            const dateB = new Date(b.startDate);
            return dateB - dateA;
        });
        
        historyList.innerHTML = sortedHistory.map(item => {
            const startDate = new Date(item.startDate).toLocaleDateString();
            const endDate = new Date(item.endDate).toLocaleDateString();
            const payDate = new Date(item.payDate).toLocaleDateString();
            
            return `
                <div class="history-item">
                    <div class="history-header">
                        <div>
                            <div class="history-date">${startDate} - ${endDate}</div>
                            <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">Pay Date: ${payDate} | ${item.employeeCount} employees</div>
                        </div>
                        <div class="history-amount">$${item.totalNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div style="margin-top: 15px; font-size: 14px; color: #6b7280;">
                        <div>Gross: $${item.totalGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div>Taxes: $${item.totalTaxes.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div>Deductions: $${item.totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // Money printer
    document.getElementById('printMoneyBtn').addEventListener('click', function() {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('money printing');
        }
        
        // Generate random amount between $1000 and $10000
        const amount = Math.floor(Math.random() * 9000) + 1000;
        totalMoney += amount;
        localStorage.setItem('accountantTotalMoney', totalMoney.toString());
        updateMoneyDisplay();
        
        // Add visual feedback
        const btn = document.getElementById('printMoneyBtn');
        const originalText = btn.textContent;
        btn.textContent = '💰 PRINTING...';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
            alert(`💰 Printed $${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}!\n\nTotal Money: $${totalMoney.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        }, 2000);
    });
    
    // Export payroll report
    document.getElementById('exportPayrollBtn').addEventListener('click', function() {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('payroll report generation');
        }
        
        if (payrollHistory.length === 0) {
            alert('No payroll history to export');
            return;
        }
        
        // Generate CSV content
        let csv = 'Payroll Report Export\n\n';
        csv += 'Period Start,Period End,Pay Date,Employees,Gross Pay,Total Taxes,Total Deductions,Net Payroll\n';
        
        payrollHistory.forEach(item => {
            csv += `${item.startDate},${item.endDate},${item.payDate},${item.employeeCount},$${item.totalGross.toFixed(2)},$${item.totalTaxes.toFixed(2)},$${item.totalDeductions.toFixed(2)},$${item.totalNet.toFixed(2)}\n`;
        });
        
        // Add detailed breakdown
        csv += '\n\nDetailed Employee Breakdown\n';
        csv += 'Employee Name,Role,Hours,Hourly Rate,Gross Pay,Federal Tax,State Tax,Social Security,Medicare,Unemployment,Health Insurance,Net Pay\n';
        
        payrollHistory.forEach(item => {
            item.results.forEach(result => {
                csv += `${result.employee.name},${result.employee.role},${result.hours.toFixed(1)},$${result.hourlyRate},$${result.grossPay.toFixed(2)},$${result.federalTax.toFixed(2)},$${result.stateTax.toFixed(2)},$${result.socialSecurity.toFixed(2)},$${result.medicare.toFixed(2)},$${result.unemployment.toFixed(2)},$${result.healthInsurance.toFixed(2)},$${result.netPay.toFixed(2)}\n`;
            });
        });
        
        // Download CSV
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payroll-report-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        alert('✅ Payroll report exported successfully!');
    });
    
    // Process payroll button
    document.getElementById('processPayrollBtn').addEventListener('click', processPayroll);
    
    // Save tax config button
    document.getElementById('saveTaxConfigBtn').addEventListener('click', function() {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('tax configuration');
        }
        saveTaxConfig();
        alert('✅ Tax configuration saved!');
    });
    
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', async function() {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('logout');
        }
        
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                await supabaseService.signOut();
            }
        } catch (error) {
            console.error('Error during logout:', error);
        }
        
        sessionStorage.clear();
        window.location.href = 'index.html';
    });
    
    // Set default dates
    const today = new Date();
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 14);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    document.getElementById('payPeriodStart').valueAsDate = twoWeeksAgo;
    document.getElementById('payPeriodEnd').valueAsDate = today;
    document.getElementById('payDate').valueAsDate = nextWeek;
    
    // Initialize
    updateMoneyDisplay();
    loadTaxConfig();
    await loadEmployees();
    await loadPayrollHistory();
});


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
        // Calculate 401k and SMP contributions (before taxes for 401k, after for SMP)
        let contribution401k = 0;
        let employerMatch401k = 0;
        let contributionSMP = 0;
        let smpStockSymbol = null;
        
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            // Get 401k enrollment
            const employee401k = await supabaseService.getEmployee401k(employee.id);
            if (employee401k && employee401k.status === 'active') {
                contribution401k = grossPay * (employee401k.contribution_percent / 100);
                // Apply max contribution limit if set
                if (employee401k.max_contribution) {
                    contribution401k = Math.min(contribution401k, employee401k.max_contribution);
                }
                // Calculate employer match (typically 50% of employee contribution up to a limit)
                employerMatch401k = contribution401k * (employee401k.employer_match_percent / 100);
            }
            
            // Get SMP enrollment
            const employeeSMP = await supabaseService.getEmployeeSMP(employee.id);
            if (employeeSMP && employeeSMP.status === 'active') {
                // SMP is calculated on net pay (after taxes and 401k)
                // We'll calculate it after we have the net pay
            }
        }
        
        // Deduct 401k from gross pay (pre-tax)
        const grossAfter401k = grossPay - contribution401k;
        
        // Recalculate taxes on reduced gross (401k is pre-tax)
        const federalTax = grossAfter401k * (taxConfig.federalTaxRate / 100);
        const stateTax = grossAfter401k * (taxConfig.stateTaxRate / 100);
        const socialSecurity = grossAfter401k * (taxConfig.socialSecurityRate / 100);
        const medicare = grossAfter401k * (taxConfig.medicareRate / 100);
        const unemployment = grossAfter401k * (taxConfig.unemploymentRate / 100);
        const totalTaxes = federalTax + stateTax + socialSecurity + medicare + unemployment;
        const totalDeductions = totalTaxes + healthInsurance + contribution401k;
        
        // Calculate net pay after taxes and 401k
        let netPay = grossAfter401k - totalTaxes - healthInsurance;
        
        // Calculate SMP contribution (post-tax, from net pay)
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            const employeeSMP = await supabaseService.getEmployeeSMP(employee.id);
            if (employeeSMP && employeeSMP.status === 'active') {
                contributionSMP = netPay * (employeeSMP.contribution_percent / 100);
                // Apply max contribution limit if set
                if (employeeSMP.max_contribution) {
                    contributionSMP = Math.min(contributionSMP, employeeSMP.max_contribution);
                }
                // Get stock symbol from first contribution or use WTRC as default
                const smpContributions = await supabaseService.getSMPContributions(employeeSMP.id);
                smpStockSymbol = smpContributions.length > 0 ? smpContributions[0].stock_symbol : 'WTRC';
            }
        }
        
        // Final net pay after SMP
        netPay = netPay - contributionSMP;
        
        return {
            grossPay,
            federalTax,
            stateTax,
            socialSecurity,
            medicare,
            unemployment,
            healthInsurance,
            contribution401k,
            employerMatch401k,
            contributionSMP,
            smpStockSymbol,
            totalTaxes,
            totalDeductions: totalDeductions + contributionSMP,
            netPay,
            employee401k: contribution401k > 0,
            employeeSMP: contributionSMP > 0
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
        
        // Get pay rate from employee_pay_rates table (set by admin)
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            try {
                const payRates = await supabaseService.getEmployeePayRates(employee.id);
                if (payRates && payRates.length > 0) {
                    // Get the most recent pay rate
                    const latestRate = payRates[0];
                    hourlyRate = parseFloat(latestRate.hourly_rate);
                }
            } catch (error) {
                console.error('Error getting pay rate:', error);
            }
        }
        
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
                    // Use hourly rate from payroll_hours if set, otherwise use employee_pay_rates
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
        
        // Get 401k and SMP enrollments
        let contribution401k = 0;
        let employerMatch401k = 0;
        let contributionSMP = 0;
        let smpStockSymbol = null;
        let employee401kId = null;
        let smpEnrollmentId = null;
        
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            // Get 401k enrollment
            const employee401k = await supabaseService.getEmployee401k(employee.id);
            if (employee401k && employee401k.status === 'active') {
                employee401kId = employee401k.id;
                contribution401k = grossPay * (employee401k.contribution_percent / 100);
                // Apply max contribution limit if set
                if (employee401k.max_contribution) {
                    contribution401k = Math.min(contribution401k, employee401k.max_contribution);
                }
                // Calculate employer match (typically 50% of employee contribution up to a limit)
                employerMatch401k = contribution401k * (employee401k.employer_match_percent / 100);
            }
            
            // Get SMP enrollment (we'll calculate contribution after taxes)
            const employeeSMP = await supabaseService.getEmployeeSMP(employee.id);
            if (employeeSMP && employeeSMP.status === 'active') {
                smpEnrollmentId = employeeSMP.id;
                // Get stock symbol from enrollment (stored in the enrollment record)
                smpStockSymbol = employeeSMP.stock_symbol || 'WTRC';
            }
        }
        
        // Calculate taxes on gross pay minus 401k (401k is pre-tax)
        const grossAfter401k = grossPay - contribution401k;
        const payroll = calculateTaxes(grossAfter401k);
        
        // Calculate SMP contribution (post-tax, from net pay after taxes and health insurance)
        const netAfterTaxes = grossAfter401k - payroll.totalTaxes - payroll.healthInsurance;
        if (smpEnrollmentId && typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            const employeeSMP = await supabaseService.getEmployeeSMP(employee.id);
            if (employeeSMP && employeeSMP.status === 'active') {
                contributionSMP = netAfterTaxes * (employeeSMP.contribution_percent / 100);
                // Apply max contribution limit if set
                if (employeeSMP.max_contribution) {
                    contributionSMP = Math.min(contributionSMP, employeeSMP.max_contribution);
                }
            }
        }
        
        // Final net pay after all deductions
        const netPay = netAfterTaxes - contributionSMP;
        
        return {
            employee,
            hours: totalHours,
            hourlyRate,
            grossPay,
            ...payroll,
            contribution401k,
            employerMatch401k,
            contributionSMP,
            smpStockSymbol,
            employee401kId,
            smpEnrollmentId,
            totalDeductions: payroll.totalDeductions + contribution401k + contributionSMP,
            netPay
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
                    <div id="deductions-${emp.id}"></div>
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
            
            // Update 401k and SMP deductions in breakdown
            const deductionsDiv = document.getElementById(`deductions-${employee.id}`);
            if (deductionsDiv) {
                let deductionsHTML = '';
                
                if (payroll.contribution401k > 0) {
                    deductionsHTML += `
                        <div class="tax-item" style="color: #3b82f6;">
                            <span>401k Contribution (${(payroll.contribution401k / payroll.grossPay * 100).toFixed(2)}%):</span>
                            <span>-$${payroll.contribution401k.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    `;
                    if (payroll.employerMatch401k > 0) {
                        deductionsHTML += `
                            <div class="tax-item" style="color: #10b981;">
                                <span>401k Employer Match:</span>
                                <span>+$${payroll.employerMatch401k.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        `;
                    }
                }
                
                if (payroll.contributionSMP > 0) {
                    const netBeforeSMP = payroll.grossPay - payroll.totalTaxes - payroll.healthInsurance - (payroll.contribution401k || 0);
                    deductionsHTML += `
                        <div class="tax-item" style="color: #8b5cf6;">
                            <span>SMP Contribution (${(payroll.contributionSMP / netBeforeSMP * 100).toFixed(2)}%):</span>
                            <span>-$${payroll.contributionSMP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    `;
                }
                
                deductionsDiv.innerHTML = deductionsHTML;
            }
            
            document.getElementById(`net-${employee.id}`).textContent = `$${payroll.netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        
        // Update summary
        document.getElementById('totalGrossPay').textContent = `$${totalGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('totalTaxes').textContent = `$${totalTaxes.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('totalDeductions').textContent = `$${totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('netPayroll').textContent = `$${totalNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        // Add money to employee wallets (CRITICAL: This adds paycheck funds to wallets automatically)
        // This happens automatically when payroll is processed - employees get paid immediately
        let walletUpdateSuccess = 0;
        let walletUpdateFailed = 0;
        
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            console.log('💰 Adding paycheck funds to employee wallets...');
            
            // Process wallet updates one at a time with delays to avoid timeouts
            for (let i = 0; i < payrollResults.length; i++) {
                const result = payrollResults[i];
                
                if (!result.employee || !result.employee.id) {
                    console.warn('⚠️ Skipping wallet update - invalid employee data');
                    continue;
                }
                
                if (!result.netPay || result.netPay <= 0) {
                    console.warn(`⚠️ Skipping wallet update for ${result.employee.name} - no net pay`);
                    continue;
                }
                
                try {
                    // Add small delay between updates to prevent database timeouts
                    if (i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
                    }
                    
                    const walletResult = await supabaseService.updateEmployeeWallet(
                        result.employee.id,
                        result.netPay,
                        'payroll',
                        `Payroll payment for ${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]}`
                    );
                    
                    if (walletResult.error) {
                        console.error(`❌ Failed to update wallet for ${result.employee.name}:`, walletResult.error);
                        walletUpdateFailed++;
                    } else {
                        console.log(`✅ Added $${result.netPay.toFixed(2)} to ${result.employee.name}'s wallet`);
                        walletUpdateSuccess++;
                    }
                } catch (error) {
                    console.error(`❌ Error updating wallet for ${result.employee.name}:`, error);
                    walletUpdateFailed++;
                }
            }
            
            console.log(`💰 Wallet update complete: ${walletUpdateSuccess} successful, ${walletUpdateFailed} failed`);
            
            if (walletUpdateFailed > 0) {
                console.warn(`⚠️ ${walletUpdateFailed} wallet update(s) failed. Check console for details.`);
            }
        } else {
            console.warn('⚠️ Supabase not available - cannot add funds to wallets');
        }
        
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
        
        // Email sending removed - focus on paychecks and wallets only
        
        // Show success message with wallet update info
        const walletMessage = walletUpdateSuccess > 0 
            ? `\n\n💰 Paycheck funds have been automatically added to ${walletUpdateSuccess} employee wallet(s)!`
            : '';
        const walletWarning = walletUpdateFailed > 0
            ? `\n\n⚠️ Warning: ${walletUpdateFailed} wallet update(s) failed. Check console for details.`
            : '';
        
        alert(`✅ Payroll processed successfully!\n\nTotal Net Payroll: $${totalNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${walletMessage}${walletWarning}`);
    }
    
    // Email sending functionality removed - focus on paychecks and wallets only
    
    // Publish paychecks to employee pages (makes them available for viewing)
    async function publishPaychecksToEmployees() {
        if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
            alert('❌ Supabase is not available. Cannot publish paychecks.');
            return;
        }
        
        // Get the latest payroll history
        if (payrollHistory.length === 0) {
            alert('❌ No payroll history found. Please process payroll first.');
            return;
        }
        
        const latestPayroll = payrollHistory[0];
        
        // Check if this payroll has employee data
        if (!latestPayroll.results || latestPayroll.results.length === 0) {
            alert('❌ No employee payroll data found in the latest payroll. Please process payroll first.');
            return;
        }
        
        // Confirm before publishing
        const confirmMessage = `Publish paychecks for ${latestPayroll.results.length} employee(s) for pay period ${latestPayroll.startDate} - ${latestPayroll.endDate}?\n\nEmployees will be able to view their paychecks on their dashboard.`;
        if (!confirm(confirmMessage)) {
            return;
        }
        
        // Always ensure payroll is saved to Supabase (force save)
        let payrollHistoryId = latestPayroll.id;
        
        try {
            const historyData = {
                pay_period_start: latestPayroll.startDate,
                pay_period_end: latestPayroll.endDate,
                pay_date: latestPayroll.payDate,
                employee_count: latestPayroll.employeeCount,
                total_gross: latestPayroll.totalGross,
                total_taxes: latestPayroll.totalTaxes,
                total_deductions: latestPayroll.totalDeductions,
                total_net: latestPayroll.totalNet,
                payroll_details: latestPayroll.results
            };
            
            console.log('Saving payroll to Supabase:', {
                period: `${historyData.pay_period_start} to ${historyData.pay_period_end}`,
                employeeCount: historyData.employee_count,
                payrollDetailsCount: historyData.payroll_details.length
            });
            
            const result = await supabaseService.savePayrollHistory(historyData);
            if (result.data) {
                payrollHistoryId = result.data.id;
                console.log('✅ Payroll saved to Supabase with ID:', payrollHistoryId);
                // Update local history with the new ID
                latestPayroll.id = payrollHistoryId;
                payrollHistory[0] = latestPayroll;
                localStorage.setItem('payrollHistory', JSON.stringify(payrollHistory));
            } else if (result.error) {
                console.error('Error saving payroll:', result.error);
                alert(`⚠️ Warning: Could not save payroll to database: ${result.error}`);
            }
        } catch (error) {
            console.error('Error saving payroll to Supabase:', error);
            alert(`⚠️ Warning: Could not save payroll to database: ${error.message}`);
        }
        
        // Add money to employee wallets (ensure wallets are updated when paychecks are published)
        // This ensures paycheck funds are in employee wallets, even if they weren't added during processing
        // NOTE: This may add funds twice if processPayroll already added them, but updateEmployeeWallet handles this correctly
        let walletUpdateSuccess = 0;
        let walletUpdateFailed = 0;
        
        if (latestPayroll.results && latestPayroll.results.length > 0) {
            console.log('💰 Ensuring paycheck funds are in employee wallets...');
            
            // Process wallet updates one at a time with delays to avoid timeouts
            for (let i = 0; i < latestPayroll.results.length; i++) {
                const result = latestPayroll.results[i];
                
                if (!result.employee || !result.employee.id) {
                    console.warn('⚠️ Skipping wallet update - invalid employee data');
                    continue;
                }
                
                if (!result.netPay || result.netPay <= 0) {
                    console.warn(`⚠️ Skipping wallet update for ${result.employee.name} - no net pay`);
                    continue;
                }
                
                try {
                    // Add small delay between updates to prevent database timeouts
                    if (i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
                    }
                    
                    const walletResult = await supabaseService.updateEmployeeWallet(
                        result.employee.id,
                        result.netPay,
                        'payroll',
                        `Payroll payment for ${latestPayroll.startDate} - ${latestPayroll.endDate}`
                    );
                    
                    if (walletResult.error) {
                        console.error(`❌ Failed to update wallet for ${result.employee.name}:`, walletResult.error);
                        walletUpdateFailed++;
                    } else {
                        console.log(`✅ Added $${result.netPay.toFixed(2)} to ${result.employee.name}'s wallet`);
                        walletUpdateSuccess++;
                    }
                } catch (error) {
                    console.error(`❌ Error updating wallet for ${result.employee.name}:`, error);
                    walletUpdateFailed++;
                }
            }
            
            console.log(`💰 Wallet update complete: ${walletUpdateSuccess} successful, ${walletUpdateFailed} failed`);
            
            if (walletUpdateFailed > 0) {
                console.warn(`⚠️ ${walletUpdateFailed} wallet update(s) failed. Check console for details.`);
            }
        } else {
            console.warn('⚠️ No payroll results found - cannot add funds to wallets');
        }
        
        // Refresh payroll history from Supabase to ensure employees can see it
        await loadPayrollHistory();
        
        // Verify the payroll was saved
        const verifyHistory = await supabaseService.getPayrollHistory(5);
        const savedPayroll = verifyHistory.find(h => 
            h.pay_period_start === latestPayroll.startDate &&
            h.pay_period_end === latestPayroll.endDate
        );
        
        if (savedPayroll) {
            console.log('✅ Verified payroll is in Supabase:', savedPayroll.id);
        } else {
            console.warn('⚠️ Payroll not found in Supabase after save');
        }
        
        // Show success message
        // Show success message with wallet update info
        const walletMessage = walletUpdateSuccess > 0 
            ? `\n\n💰 Paycheck funds have been automatically added to ${walletUpdateSuccess} employee wallet(s)!`
            : '';
        const walletWarning = walletUpdateFailed > 0
            ? `\n\n⚠️ Warning: ${walletUpdateFailed} wallet update(s) failed. Check console for details.`
            : '';
        
        alert(`✅ Paychecks published successfully!\n\n${latestPayroll.results.length} employee(s) can now view their paychecks on their dashboard.\n\nPay Period: ${latestPayroll.startDate} to ${latestPayroll.endDate}${walletMessage}${walletWarning}`);
        console.log(`✅ Paychecks published for ${latestPayroll.results.length} employees`);
    }
    
    // Email HTML generation removed - focus on paychecks and wallets only
    
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
    
    // Publish paychecks button (makes paychecks available on employee pages)
    document.getElementById('publishPaychecksBtn').addEventListener('click', async function() {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('publishing paychecks');
        }
        
        await publishPaychecksToEmployees();
    });
    
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
    
    // ==========================================
    // DEBT MANAGEMENT
    // ==========================================
    
    const addDebtModal = document.getElementById('addDebtModal');
    const addDebtBtn = document.getElementById('addDebtBtn');
    const closeDebtModal = document.getElementById('closeDebtModal');
    const cancelDebtBtn = document.getElementById('cancelDebtBtn');
    const addDebtForm = document.getElementById('addDebtForm');
    
    const payDebtModal = document.getElementById('payDebtModal');
    const closePayDebtModal = document.getElementById('closePayDebtModal');
    const cancelPayDebtBtn = document.getElementById('cancelPayDebtBtn');
    const payDebtForm = document.getElementById('payDebtForm');
    
    if (addDebtBtn) {
        addDebtBtn.addEventListener('click', () => {
            addDebtModal.style.display = 'block';
        });
    }
    
    if (closeDebtModal) {
        closeDebtModal.addEventListener('click', () => {
            addDebtModal.style.display = 'none';
        });
    }
    
    if (cancelDebtBtn) {
        cancelDebtBtn.addEventListener('click', () => {
            addDebtModal.style.display = 'none';
        });
    }
    
    if (addDebtForm) {
        addDebtForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('debt creation');
            }
            
            const debtData = {
                debt_name: document.getElementById('debtName').value,
                principal: parseFloat(document.getElementById('debtPrincipal').value),
                interest_rate: parseFloat(document.getElementById('debtInterestRate').value),
                monthly_payment: parseFloat(document.getElementById('debtMonthlyPayment').value),
                remaining_balance: parseFloat(document.getElementById('debtPrincipal').value),
                next_payment_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'active'
            };
            
            const result = await supabaseService.addCompanyDebt(debtData);
            
            if (result.error) {
                alert(`❌ Failed to add debt: ${result.error}`);
            } else {
                alert('✅ Debt added successfully!');
                addDebtModal.style.display = 'none';
                addDebtForm.reset();
                await loadDebtList();
            }
        });
    }
    
    if (closePayDebtModal) {
        closePayDebtModal.addEventListener('click', () => {
            payDebtModal.style.display = 'none';
        });
    }
    
    if (cancelPayDebtBtn) {
        cancelPayDebtBtn.addEventListener('click', () => {
            payDebtModal.style.display = 'none';
        });
    }
    
    if (payDebtForm) {
        payDebtForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('debt payment');
            }
            
            const debtId = parseInt(document.getElementById('payDebtId').value);
            const paymentAmount = parseFloat(document.getElementById('payDebtAmount').value);
            
            const result = await supabaseService.makeDebtPayment(debtId, paymentAmount);
            
            if (result.error) {
                alert(`❌ Payment failed: ${result.error}`);
            } else {
                alert('✅ Payment processed successfully!');
                payDebtModal.style.display = 'none';
                payDebtForm.reset();
                await loadDebtList();
            }
        });
    }
    
    async function loadDebtList() {
        const list = document.getElementById('debtList');
        if (!list) return;
        
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('debt data');
        }
        
        const debts = await supabaseService.getCompanyDebt();
        
        if (debts.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No company debt</div>';
            return;
        }
        
        list.innerHTML = debts.map(debt => {
            const statusColor = debt.status === 'paid' ? '#10b981' : debt.status === 'defaulted' ? '#ef4444' : '#3b82f6';
            const nextPayment = debt.next_payment_date ? new Date(debt.next_payment_date).toLocaleDateString() : 'N/A';
            
            return `
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                        <div>
                            <div style="font-weight: 600; color: var(--text-primary, #1f2937); font-size: 18px;">${debt.debt_name}</div>
                            <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                                Interest: ${debt.interest_rate}% • Monthly: $${parseFloat(debt.monthly_payment).toFixed(2)}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 14px; color: #6b7280;">Remaining</div>
                            <div style="font-size: 20px; font-weight: bold; color: ${statusColor};">
                                $${parseFloat(debt.remaining_balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Next Payment: ${nextPayment}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="btn-primary" 
                                style="flex: 1; padding: 8px;"
                                data-debt-id="${debt.id}"
                                data-debt-name="${debt.debt_name}"
                                data-debt-balance="${debt.remaining_balance}"
                                onclick="openPayDebtModal(${debt.id}, '${debt.debt_name}', ${debt.remaining_balance})">
                            Make Payment
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    window.openPayDebtModal = function(debtId, debtName, balance) {
        document.getElementById('payDebtId').value = debtId;
        document.getElementById('payDebtName').value = debtName;
        document.getElementById('payDebtBalance').value = `$${parseFloat(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('payDebtAmount').value = '';
        payDebtModal.style.display = 'block';
    };
    
    // Initialize
    updateMoneyDisplay();
    loadTaxConfig();
    await loadEmployees();
    await loadPayrollHistory();
    await loadDebtList();
});


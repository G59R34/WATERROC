// Exceptions and Absence Management
document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;
    
    // Wait for Supabase to be ready
    async function waitForSupabase() {
        while (!supabaseService.isReady()) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    // Check authentication
    async function checkAuth() {
        await waitForSupabase();
        
        const user = await supabaseService.getCurrentUser();
        console.log('Current user:', user);
        
        if (!user) {
            console.log('No user found, redirecting to login');
            window.location.href = 'index.html';
            return false;
        }
        
        currentUser = user;
        
        // Only admins can access this page
        if (!user.is_admin) {
            alert('Access denied. Only administrators can view this page.');
            window.location.href = 'employee.html';
            return false;
        }
        
        return true;
    }
    
    // Check auth first
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        return;
    }
    
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (typeof showUILoadingScreen !== 'undefined') {
                showUILoadingScreen('tab content');
            }
            const tabName = btn.dataset.tab;
            
            // Update active states
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tabName).classList.add('active');
            
            // Load data for the active tab
            if (tabName === 'exception-logs') {
                loadExceptionLogs();
            } else if (tabName === 'summary') {
                loadSummary();
            }
        });
    });
    
    // Load employees for dropdowns
    async function loadEmployees() {
        try {
            const employees = await supabaseService.getEmployees();
            
            if (!employees || employees.length === 0) {
                console.warn('No employees found');
                return;
            }
            
            console.log('Loaded employees:', employees);
            
            const exceptionEmployeeSelect = document.getElementById('exceptionEmployee');
            const filterEmployeeSelect = document.getElementById('filterEmployee');
            
            exceptionEmployeeSelect.innerHTML = '<option value="">Select Employee</option>';
            filterEmployeeSelect.innerHTML = '<option value="">All Employees</option>';
            
            employees.forEach(emp => {
                const empName = emp.name || emp.username || `Employee ${emp.id}`;
                exceptionEmployeeSelect.innerHTML += `<option value="${emp.id}">${empName}</option>`;
                filterEmployeeSelect.innerHTML += `<option value="${emp.id}">${empName}</option>`;
            });
            
            console.log('✅ Employees loaded into dropdowns');
        } catch (error) {
            console.error('Error loading employees:', error);
            alert('Failed to load employees: ' + error.message);
        }
    }
    
    // Ensure DO exceptions are up to date for today
    async function ensureDOExceptionsForToday() {
        try {
            const today = new Date().toISOString().split('T')[0];
            console.log('📅 Checking automatic DO exceptions for date:', today);
            const result = await supabaseService.ensureDOExceptions(today);
            console.log('📊 DO check result:', result);
            if (result && result.length > 0) {
                console.log('✅ Auto-created DO exceptions for employees without shifts:', result);
            } else {
                console.log('ℹ️ No new DO exceptions needed (all employees either have shifts or already have DOs)');
            }
        } catch (error) {
            console.error('❌ Error ensuring DO exceptions:', error);
            console.error('This likely means the SQL function "ensure_do_exceptions_for_date" has not been deployed.');
            console.error('Please run add-auto-do-system.sql in your Supabase SQL Editor.');
        }
    }
    
    // Apply exception form
    const applyExceptionForm = document.getElementById('applyExceptionForm');
    applyExceptionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await applyException();
    });
    
    async function applyException() {
        const employeeId = parseInt(document.getElementById('exceptionEmployee').value);
        const date = document.getElementById('exceptionDate').value;
        const exceptionCode = document.getElementById('exceptionCode').value;
        const startTime = document.getElementById('exceptionStartTime').value || null;
        const endTime = document.getElementById('exceptionEndTime').value || null;
        const reason = document.getElementById('exceptionReason').value || null;
        const isApproved = document.getElementById('exceptionApproved').checked;
        
        if (!employeeId || !date || !exceptionCode) {
            alert('Please fill in all required fields');
            return;
        }
        
        try {
            // Get employee name
            const employees = await supabaseService.getEmployees();
            const employee = employees.find(e => e.id === employeeId);
            
            if (!employee) {
                alert('Employee not found');
                return;
            }
            
            // Create exception log
            const exceptionData = {
                employeeId: employeeId,
                employeeName: employee.name,
                exceptionCode: exceptionCode,
                date: date,
                startTime: startTime,
                endTime: endTime,
                reason: reason,
                approvedBy: isApproved ? currentUser.full_name : null,
                createdBy: currentUser.full_name
            };
            
            await supabaseService.createExceptionLog(exceptionData);
            
            // Also update the shift if there is one for this date
            const shifts = await supabaseService.getEmployeeShifts(employeeId, date, date);
            if (shifts && shifts.length > 0) {
                await supabaseService.applyShiftException(shifts[0].id, exceptionCode, {
                    reason: reason,
                    approvedBy: isApproved ? currentUser.full_name : null,
                    startTime: startTime,
                    endTime: endTime
                });
            }
            
            alert('✅ Exception applied successfully!');
            applyExceptionForm.reset();
            
            // Reload logs if that tab is active
            if (document.getElementById('exception-logs').classList.contains('active')) {
                loadExceptionLogs();
            }
            
        } catch (error) {
            console.error('Error applying exception:', error);
            alert('❌ Failed to apply exception: ' + error.message);
        }
    }
    
    document.getElementById('cancelExceptionBtn').addEventListener('click', () => {
        applyExceptionForm.reset();
    });
    
    // Load exception logs
    async function loadExceptionLogs(filters = {}) {
        const tbody = document.getElementById('exceptionLogsBody');
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;"><div style="color: #94a3b8;">Loading...</div></td></tr>';
        
        try {
            const logs = await supabaseService.getExceptionLogs(filters);
            
            if (logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;"><div style="color: #94a3b8;">No exception logs found</div></td></tr>';
                return;
            }
            
            tbody.innerHTML = logs.map(log => {
                const codeColor = log.exception_code === 'VAUT' ? '#10b981' : 
                                 log.exception_code === 'DO' ? '#3b82f6' : '#ef4444';
                const timeStr = log.start_time && log.end_time 
                    ? `${log.start_time.substring(0,5)} - ${log.end_time.substring(0,5)}`
                    : 'Full Day';
                
                return `
                    <tr>
                        <td>${new Date(log.exception_date).toLocaleDateString()}</td>
                        <td><strong>${log.employee_name}</strong></td>
                        <td><span style="background: ${codeColor}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">${log.exception_code}</span></td>
                        <td>${timeStr}</td>
                        <td>${log.reason || '-'}</td>
                        <td>${log.approved_by || '<span style="color: #ef4444;">Not Approved</span>'}</td>
                        <td>${log.approved_at ? new Date(log.approved_at).toLocaleString() : '-'}</td>
                        <td>
                            <button class="btn-danger btn-sm" onclick="deleteException(${log.id})">Delete</button>
                        </td>
                    </tr>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Error loading exception logs:', error);
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #ef4444;">Error loading logs</td></tr>';
        }
    }
    
    // Filter logs
    document.getElementById('filterLogsBtn').addEventListener('click', () => {
        if (typeof showFilterLoadingScreen !== 'undefined') {
            showFilterLoadingScreen();
        }
        const filters = {
            startDate: document.getElementById('filterStartDate').value || null,
            endDate: document.getElementById('filterEndDate').value || null,
            employeeId: parseInt(document.getElementById('filterEmployee').value) || null,
            exceptionCode: document.getElementById('filterExceptionCode').value || null
        };
        
        loadExceptionLogs(filters);
    });
    
    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('filter reset');
        }
        document.getElementById('filterStartDate').value = '';
        document.getElementById('filterEndDate').value = '';
        document.getElementById('filterEmployee').value = '';
        document.getElementById('filterExceptionCode').value = '';
        loadExceptionLogs();
    });
    
    // Export logs to CSV
    document.getElementById('exportLogsBtn').addEventListener('click', async () => {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('CSV export generation');
        }
        const filters = {
            startDate: document.getElementById('filterStartDate').value || null,
            endDate: document.getElementById('filterEndDate').value || null,
            employeeId: parseInt(document.getElementById('filterEmployee').value) || null,
            exceptionCode: document.getElementById('filterExceptionCode').value || null
        };
        
        const logs = await supabaseService.getExceptionLogs(filters);
        
        if (logs.length === 0) {
            alert('No data to export');
            return;
        }
        
        const csv = [
            ['Date', 'Employee', 'Code', 'Start Time', 'End Time', 'Reason', 'Approved By', 'Approved At'],
            ...logs.map(log => [
                new Date(log.exception_date).toLocaleDateString(),
                log.employee_name,
                log.exception_code,
                log.start_time || '',
                log.end_time || '',
                log.reason || '',
                log.approved_by || '',
                log.approved_at ? new Date(log.approved_at).toLocaleString() : ''
            ])
        ].map(row => row.join(',')).join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exception_logs_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    });
    
    // Load summary
    async function loadSummary() {
        const statsGrid = document.getElementById('summaryStats');
        const tbody = document.getElementById('summaryTableBody');
        
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;"><div style="color: #94a3b8;">Loading...</div></td></tr>';
        
        try {
            const summary = await supabaseService.getExceptionSummary();
            
            // Calculate totals for stats
            const totalExceptions = summary.reduce((sum, s) => sum + (s.total_exceptions || 0), 0);
            const totalVAUT = summary.filter(s => s.exception_code === 'VAUT').reduce((sum, s) => sum + (s.total_exceptions || 0), 0);
            const totalDO = summary.filter(s => s.exception_code === 'DO').reduce((sum, s) => sum + (s.total_exceptions || 0), 0);
            const totalUAEO = summary.filter(s => s.exception_code === 'UAEO').reduce((sum, s) => sum + (s.total_exceptions || 0), 0);
            
            statsGrid.innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">${totalExceptions}</div>
                    <div class="stat-label">Total Exceptions</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: #10b981;">${totalVAUT}</div>
                    <div class="stat-label">VAUT</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: #3b82f6;">${totalDO}</div>
                    <div class="stat-label">Day Off</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: #ef4444;">${totalUAEO}</div>
                    <div class="stat-label">UAEO</div>
                </div>
            `;
            
            if (summary.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;"><div style="color: #94a3b8;">No exception data found</div></td></tr>';
                return;
            }
            
            tbody.innerHTML = summary.map(s => {
                if (!s.exception_code) return '';
                
                const codeColor = s.exception_code === 'VAUT' ? '#10b981' : 
                                 s.exception_code === 'DO' ? '#3b82f6' : '#ef4444';
                
                return `
                    <tr>
                        <td><strong>${s.employee_name}</strong></td>
                        <td><span style="background: ${codeColor}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">${s.exception_code}</span></td>
                        <td><strong>${s.total_exceptions || 0}</strong></td>
                        <td style="color: #10b981;">${s.approved_count || 0}</td>
                        <td style="color: #ef4444;">${s.unapproved_count || 0}</td>
                        <td>${s.first_exception_date ? new Date(s.first_exception_date).toLocaleDateString() : '-'}</td>
                        <td>${s.last_exception_date ? new Date(s.last_exception_date).toLocaleDateString() : '-'}</td>
                    </tr>
                `;
            }).filter(row => row).join('');
            
        } catch (error) {
            console.error('Error loading summary:', error);
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #ef4444;">Error loading summary</td></tr>';
        }
    }
    
    document.getElementById('refreshSummaryBtn').addEventListener('click', () => {
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('exception summary');
        }
        loadSummary();
    });
    
    // Export summary
    document.getElementById('exportSummaryBtn').addEventListener('click', async () => {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('summary export');
        }
        const summary = await supabaseService.getExceptionSummary();
        
        if (summary.length === 0) {
            alert('No data to export');
            return;
        }
        
        const csv = [
            ['Employee', 'Exception Code', 'Total', 'Approved', 'Unapproved', 'First Date', 'Last Date'],
            ...summary.filter(s => s.exception_code).map(s => [
                s.employee_name,
                s.exception_code,
                s.total_exceptions || 0,
                s.approved_count || 0,
                s.unapproved_count || 0,
                s.first_exception_date ? new Date(s.first_exception_date).toLocaleDateString() : '',
                s.last_exception_date ? new Date(s.last_exception_date).toLocaleDateString() : ''
            ])
        ].map(row => row.join(',')).join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exception_summary_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    });
    
    // Global delete function
    window.deleteException = async function(logId) {
        if (!confirm('Are you sure you want to delete this exception log?')) {
            return;
        }
        
        try {
            const { error } = await supabaseService.client
                .from('exception_logs')
                .delete()
                .eq('id', logId);
            
            if (error) throw error;
            
            alert('✅ Exception log deleted');
            loadExceptionLogs();
        } catch (error) {
            console.error('Error deleting exception:', error);
            alert('❌ Failed to delete exception: ' + error.message);
        }
    };
    
    // Back to dashboard
    document.getElementById('backToDashboardBtn').addEventListener('click', () => {
        if (typeof showPageLoadScreen !== 'undefined') {
            showPageLoadScreen();
        }
        window.location.href = 'admin.html';
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await supabaseService.signOut();
        window.location.href = 'index.html';
    });
    
    // Initialize
    await loadEmployees();
    await ensureDOExceptionsForToday();
    await loadExceptionLogs();
});

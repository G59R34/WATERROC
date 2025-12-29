// Shift Scheduling Script
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    let currentWeekStart = getMonday(new Date());
    let employees = [];
    let shifts = [];
    let shiftTemplates = [];
    let timeOffRequests = [];

    // Navigation
    document.getElementById('backToDashboard').addEventListener('click', function() {
        if (typeof showPageLoadScreen !== 'undefined') {
            showPageLoadScreen();
        }
        window.location.href = 'admin.html';
    });

    document.getElementById('logoutBtn').addEventListener('click', async function() {
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

    // Check Supabase connection
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        const session = await supabaseService.getSession();
        if (!session) {
            sessionStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        
        await supabaseService.loadCurrentUser();
        if (!supabaseService.isAdmin()) {
            alert('Access denied. Admin privileges required.');
            window.location.href = 'index.html';
            return;
        }
    } else {
        alert('Shift Scheduling requires Supabase connection');
        window.location.href = 'admin.html';
        return;
    }

    // Week navigation
    document.getElementById('prevWeekBtn').addEventListener('click', () => {
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('previous week schedule');
        }
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        loadShifts();
    });

    document.getElementById('nextWeekBtn').addEventListener('click', () => {
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('next week schedule');
        }
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        loadShifts();
    });

    // Shift Modal
    const shiftModal = document.getElementById('shiftModal');
    const shiftForm = document.getElementById('shiftForm');
    const closeModal = shiftModal.querySelector('.close');
    const cancelBtn = document.getElementById('cancelShiftBtn');
    const addShiftBtn = document.getElementById('addShiftBtn');

    addShiftBtn.addEventListener('click', () => {
        openShiftModal();
    });

    closeModal.addEventListener('click', () => {
        shiftModal.style.display = 'none';
    });

    cancelBtn.addEventListener('click', () => {
        shiftModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === shiftModal) {
            shiftModal.style.display = 'none';
        }
    });

    // Template change handler
    document.getElementById('shiftTemplate').addEventListener('change', function() {
        if (typeof showUILoadingScreen !== 'undefined') {
            showUILoadingScreen('template application');
        }
        const templateId = parseInt(this.value);
        if (templateId) {
            const template = shiftTemplates.find(t => t.id === templateId);
            if (template) {
                document.getElementById('shiftStartTime').value = template.start_time.substring(0, 5);
                document.getElementById('shiftEndTime').value = template.end_time.substring(0, 5);
            }
        }
    });

    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    function formatDate(date) {
        // Use local date to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatDateDisplay(date) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    let exceptions = [];

    async function loadShifts() {
        const calendar = document.getElementById('shiftCalendar');
        calendar.innerHTML = '<div class="loading-message">Loading shifts...</div>';

        try {
            // Load data with error handling for each operation
            try {
                employees = await supabaseService.getEmployees();
                console.log('Employees loaded:', employees);
            } catch (error) {
                console.error('Error loading employees:', error);
                employees = [];
            }

            try {
                shiftTemplates = await supabaseService.getShiftTemplates();
                console.log('Shift templates loaded:', shiftTemplates);
            } catch (error) {
                console.error('Error loading shift templates:', error);
                shiftTemplates = [];
            }
            
            if (!employees || employees.length === 0) {
                calendar.innerHTML = '<div class="loading-message">No employees found. Please add employees first.</div>';
                return;
            }

            if (!shiftTemplates || shiftTemplates.length === 0) {
                console.warn('No shift templates found');
            }
            
            const weekEnd = new Date(currentWeekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            
            try {
                shifts = await supabaseService.getEmployeeShifts(
                    formatDate(currentWeekStart),
                    formatDate(weekEnd)
                );
                console.log('Shifts loaded:', shifts);
            } catch (error) {
                console.error('Error loading shifts:', error);
                shifts = [];
            }

            // Ensure DO exceptions for each day in the week (with timeout protection)
            for (let i = 0; i < 7; i++) {
                const checkDate = new Date(currentWeekStart);
                checkDate.setDate(checkDate.getDate() + i);
                try {
                    // Add timeout to prevent hanging
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), 5000)
                    );
                    await Promise.race([
                        supabaseService.ensureDOExceptions(formatDate(checkDate)),
                        timeoutPromise
                    ]);
                } catch (error) {
                    console.error('Error ensuring DO for', formatDate(checkDate), error);
                    // Continue even if this fails
                }
            }

            // Load exceptions for the week
            exceptions = await supabaseService.getExceptionLogs({
                startDate: formatDate(currentWeekStart),
                endDate: formatDate(weekEnd)
            });
            
            console.log('Exceptions loaded:', exceptions);

            // Update week display
            document.getElementById('weekDisplay').textContent = 
                `${formatDateDisplay(currentWeekStart)} - ${formatDateDisplay(weekEnd)}`;

            // Render calendar
            renderCalendar();

            // Load time off requests
            await loadTimeOffRequests();

        } catch (error) {
            console.error('Error loading shifts:', error);
            calendar.innerHTML = '<div class="loading-message">Error loading shifts: ' + error.message + '</div>';
        }
    }

    function renderCalendar() {
        const calendar = document.getElementById('shiftCalendar');
        
        if (!employees || employees.length === 0) {
            calendar.innerHTML = '<div class="loading-message">No employees found. Add employees first.</div>';
            return;
        }

        // Generate week days
        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(currentWeekStart);
            day.setDate(day.getDate() + i);
            weekDays.push(day);
        }

        // Create shift map for quick lookup
        const shiftMap = {};
        if (shifts) {
            console.log(`Building shift map from ${shifts.length} shifts`);
            shifts.forEach(shift => {
                // Normalize shift_date to YYYY-MM-DD format (handle both string and Date objects)
                let shiftDate = shift.shift_date;
                if (shiftDate instanceof Date) {
                    shiftDate = formatDate(shiftDate);
                } else if (typeof shiftDate === 'string') {
                    // Remove time portion if present (handles both YYYY-MM-DD and YYYY-MM-DDTHH:mm:ss formats)
                    shiftDate = shiftDate.split('T')[0];
                }
                const key = `${shift.employee_id}-${shiftDate}`;
                if (!shiftMap[key]) {
                    shiftMap[key] = [];
                }
                shiftMap[key].push(shift);
                console.log(`Added shift to map: ${key} - ${shift.start_time} to ${shift.end_time}`);
            });
            console.log(`Shift map created with ${Object.keys(shiftMap).length} keys`);
        } else {
            console.warn('No shifts array to build map from');
        }

        // Create exception map for quick lookup
        const exceptionMap = {};
        if (exceptions) {
            exceptions.forEach(exc => {
                // Normalize exception_date to YYYY-MM-DD format (handle both string and Date objects)
                let excDate = exc.exception_date;
                if (excDate instanceof Date) {
                    excDate = formatDate(excDate);
                } else if (typeof excDate === 'string') {
                    // Remove time portion if present (handles both YYYY-MM-DD and YYYY-MM-DDTHH:mm:ss formats)
                    excDate = excDate.split('T')[0];
                }
                const key = `${exc.employee_id}-${excDate}`;
                if (!exceptionMap[key]) {
                    exceptionMap[key] = [];
                }
                exceptionMap[key].push(exc);
            });
        }

        // Exception colors
        const exceptionColors = {
            'VAUT': '#10b981',
            'DO': '#3b82f6',
            'UAEO': '#ef4444',
            'NSFT': '#f59e0b',
            'VATO': '#10b981',
            'EMWM': '#8b5cf6'
        };

        const exceptionLabels = {
            'VAUT': 'Verified Authorized Unavailable Time',
            'DO': 'Day Off',
            'UAEO': 'Unauthorized Absence',
            'NSFT': 'No Show For Task',
            'VATO': 'Verified Authorized Time Off',
            'EMWM': 'Employee Meeting With Management'
        };

        // Build calendar HTML
        let html = '<div class="calendar-grid">';
        
        // Headers
        html += '<div class="calendar-header employee-column">Employee</div>';
        weekDays.forEach(day => {
            const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
            const dateStr = formatDateDisplay(day);
            html += `<div class="calendar-header">${dayName}<br>${dateStr}</div>`;
        });

        // Employee rows
        employees.forEach(emp => {
            html += '<div class="calendar-row">';
            html += `<div class="employee-name-cell">${escapeHtml(emp.name)}</div>`;
            
            weekDays.forEach(day => {
                const dateStr = formatDate(day);
                const key = `${emp.id}-${dateStr}`;
                const dayShifts = shiftMap[key] || [];
                const dayExceptions = exceptionMap[key] || [];
                
                html += `<div class="shift-cell" data-employee-id="${emp.id}" data-date="${dateStr}">`;
                dayShifts.forEach(shift => {
                    const statusClass = shift.status !== 'scheduled' ? `status-${shift.status}` : '';
                    const templateName = shift.shift_templates?.name || 'Custom';
                    html += `
                        <div class="shift-block ${statusClass}" data-shift-id="${shift.id}">
                            <div class="shift-time">${shift.start_time.substring(0, 5)} - ${shift.end_time.substring(0, 5)}</div>
                            <div class="shift-template-name">${escapeHtml(templateName)}</div>
                        </div>
                    `;
                });
                
                // Add exception badges
                dayExceptions.forEach(exc => {
                    html += `
                        <div class="exception-badge" style="background: ${exceptionColors[exc.exception_code] || '#64748b'}; color: white; padding: 6px 8px; border-radius: 4px; margin-top: 4px; font-size: 11px; font-weight: 600; text-align: center;" title="${exceptionLabels[exc.exception_code] || exc.exception_code}${exc.reason ? '\n' + exc.reason : ''}">
                            ${exc.exception_code}
                            ${exc.start_time && exc.end_time ? `<div style="font-size: 10px; opacity: 0.9; margin-top: 2px;">${exc.start_time.substring(0, 5)}-${exc.end_time.substring(0, 5)}</div>` : ''}
                        </div>
                    `;
                });
                
                html += '</div>';
            });
            
            html += '</div>';
        });

        html += '</div>';
        calendar.innerHTML = html;

        // Add click handlers to cells
        document.querySelectorAll('.shift-cell').forEach(cell => {
            cell.addEventListener('click', (e) => {
                if (!e.target.closest('.shift-block')) {
                    const employeeId = parseInt(cell.dataset.employeeId);
                    const date = cell.dataset.date;
                    openShiftModal(employeeId, date);
                }
            });
        });

        // Add click handlers to shift blocks for editing/deletion
        document.querySelectorAll('.shift-block').forEach(block => {
            block.addEventListener('click', async (e) => {
                e.stopPropagation();
                const shiftId = parseInt(block.dataset.shiftId);
                const shift = shifts.find(s => s.id === shiftId);
                if (shift && confirm('Delete this shift?')) {
                    const result = await supabaseService.deleteEmployeeShift(shiftId);
                    if (result) {
                        await loadShifts();
                    } else {
                        alert('Failed to delete shift');
                    }
                }
            });
        });
    }

    function openShiftModal(employeeId = null, date = null) {
        // Populate employee dropdown
        const employeeSelect = document.getElementById('shiftEmployee');
        employeeSelect.innerHTML = '<option value="">Select Employee...</option>' +
            employees.map(emp => `<option value="${emp.id}">${escapeHtml(emp.name)}</option>`).join('');

        // Populate template dropdown
        const templateSelect = document.getElementById('shiftTemplate');
        templateSelect.innerHTML = '<option value="">Custom Shift...</option>' +
            shiftTemplates.map(tmpl => 
                `<option value="${tmpl.id}">${escapeHtml(tmpl.name)} (${tmpl.start_time.substring(0,5)} - ${tmpl.end_time.substring(0,5)})</option>`
            ).join('');

        // Pre-fill if provided
        if (employeeId) {
            employeeSelect.value = employeeId;
        }
        if (date) {
            document.getElementById('shiftDate').value = date;
        }

        // Reset other fields
        document.getElementById('shiftTemplate').value = '';
        document.getElementById('shiftStartTime').value = '';
        document.getElementById('shiftEndTime').value = '';
        document.getElementById('shiftNotes').value = '';

        shiftModal.style.display = 'block';
    }

    // Save shift
    shiftForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (typeof showFormLoadingScreen !== 'undefined') {
            showFormLoadingScreen('shift data');
        }

        const shiftData = {
            employee_id: parseInt(document.getElementById('shiftEmployee').value),
            shift_date: document.getElementById('shiftDate').value,
            shift_template_id: document.getElementById('shiftTemplate').value 
                ? parseInt(document.getElementById('shiftTemplate').value) 
                : null,
            start_time: document.getElementById('shiftStartTime').value + ':00', // Add seconds
            end_time: document.getElementById('shiftEndTime').value + ':00', // Add seconds
            notes: document.getElementById('shiftNotes').value.trim() || null,
            status: 'scheduled'
        };

        if (!shiftData.employee_id || !shiftData.shift_date || !shiftData.start_time || !shiftData.end_time) {
            alert('Please fill in all required fields');
            return;
        }

        // Check for time off conflicts
        if (supabaseService && supabaseService.isReady()) {
            const hasTimeOff = await supabaseService.hasTimeOffOnDate(shiftData.employee_id, shiftData.shift_date);
            if (hasTimeOff) {
                alert('⚠️ Cannot assign shift: This employee has approved time off on this date.\n\nPlease select a different date or contact the employee.');
                return;
            }
        }

        try {
            const result = await supabaseService.createEmployeeShift(shiftData);
            
            if (result) {
                // Auto-generate tasks from templates
                await autoGenerateTasksForShift(shiftData);
                
                alert('✅ Shift assigned successfully!');
                shiftModal.style.display = 'none';
                await loadShifts();
            } else {
                alert('❌ Failed to assign shift. Please try again.');
            }
        } catch (error) {
            console.error('Error saving shift:', error);
            alert('❌ Error saving shift. Please try again.');
        }
    });

    // Auto-generate tasks from templates when a shift is created
    async function autoGenerateTasksForShift(shiftData) {
        if (!supabaseService.isReady()) return;

        try {
            // Get all task templates with auto_assign enabled
            const { data: templates, error } = await supabaseService.client
                .from('task_templates')
                .select('*')
                .eq('auto_assign', true)
                .order('created_at', { ascending: true });

            if (error) throw error;
            if (!templates || templates.length === 0) return;

            // Get employee details
            const employee = employees.find(e => e.id === shiftData.employee_id);
            if (!employee) return;

            // Calculate shift start datetime
            const shiftDate = new Date(shiftData.shift_date + 'T' + shiftData.start_time);
            const shiftEndTime = new Date(shiftData.shift_date + 'T' + shiftData.end_time);
            
            let currentTaskStart = shiftDate;

            // Generate tasks for each template
            for (const template of templates) {
                const durationMs = template.duration_hours * 60 * 60 * 1000;
                const taskEnd = new Date(currentTaskStart.getTime() + durationMs);

                // Only create task if it fits within the shift
                if (taskEnd <= shiftEndTime) {
                    // Create task in Gantt system (localStorage)
                    const ganttData = JSON.parse(localStorage.getItem('ganttData') || '{"employees":[],"tasks":[]}');
                    
                    const newTask = {
                        id: Date.now() + Math.random(),
                        employeeId: employee.id,
                        name: template.title,
                        description: template.description || '',
                        startDate: currentTaskStart.toISOString().split('T')[0],
                        endDate: taskEnd.toISOString().split('T')[0],
                        status: 'not_started',
                        priority: template.priority,
                        acknowledged: false
                    };

                    ganttData.tasks.push(newTask);
                    localStorage.setItem('ganttData', JSON.stringify(ganttData));

                    // Move to next task start time
                    currentTaskStart = taskEnd;
                } else {
                    break; // Stop if task doesn't fit
                }
            }

            console.log(`Auto-generated ${templates.length} tasks for shift`);
        } catch (error) {
            console.error('Error auto-generating tasks:', error);
        }
    }

    async function loadTimeOffRequests() {
        const list = document.getElementById('timeOffList');
        list.innerHTML = '<div class="loading-message">Loading time off requests...</div>';

        try {
            timeOffRequests = await supabaseService.getTimeOffRequests();
            
            console.log('Time off requests loaded:', timeOffRequests);

            if (!timeOffRequests || timeOffRequests.length === 0) {
                list.innerHTML = '<div class="loading-message">No time off requests</div>';
                return;
            }

            list.innerHTML = timeOffRequests.map(req => {
                // Handle both object and direct reference for employees
                const employeeName = req.employees?.name || req.employee_name || 'Unknown Employee';
                
                return `
                    <div class="time-off-item status-${req.status}">
                        <div class="time-off-info">
                            <div class="time-off-employee">${escapeHtml(employeeName)}</div>
                            <div class="time-off-dates">
                                ${new Date(req.start_date).toLocaleDateString()} - ${new Date(req.end_date).toLocaleDateString()}
                            </div>
                            ${req.reason ? `<div class="time-off-reason">${escapeHtml(req.reason)}</div>` : ''}
                        </div>
                        <div class="time-off-actions">
                            ${req.status === 'pending' ? `
                                <button class="btn-approve" data-request-id="${req.id}">✓ Approve</button>
                                <button class="btn-deny" data-request-id="${req.id}">✗ Deny</button>
                            ` : req.status === 'approved' ? `
                                <span class="time-off-status ${req.status}">${req.status}</span>
                                <button class="btn-remove" data-request-id="${req.id}" title="Remove this approved time off">🗑️ Remove</button>
                            ` : `
                                <span class="time-off-status ${req.status}">${req.status}</span>
                            `}
                        </div>
                    </div>
                `;
            }).join('');

            // Add click handlers
            document.querySelectorAll('.btn-approve').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const requestId = parseInt(btn.dataset.requestId);
                    const request = timeOffRequests.find(r => r.id === requestId);
                    
                    if (!request) {
                        alert('Request not found.');
                        return;
                    }
                    
                    const result = await supabaseService.updateTimeOffRequest(requestId, { status: 'approved' });
                    if (result) {
                        // Tasks and shifts are automatically deleted in updateTimeOffRequest
                        alert('Time off request approved!\n\nAll tasks and shifts within this period have been deleted.\nException logs have been created to block scheduling during this period.');
                        await loadTimeOffRequests();
                        await loadShifts(); // Refresh shifts to show deletions
                        // Refresh the calendar view if it exists
                        if (typeof renderCalendar === 'function') {
                            await renderCalendar();
                        }
                    } else {
                        alert('Failed to approve request');
                    }
                });
            });

            document.querySelectorAll('.btn-deny').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const requestId = parseInt(btn.dataset.requestId);
                    const result = await supabaseService.updateTimeOffRequest(requestId, { status: 'denied' });
                    if (result) {
                        await loadTimeOffRequests();
                    } else {
                        alert('Failed to deny request');
                    }
                });
            });

            // Add click handlers for remove button
            document.querySelectorAll('.btn-remove').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const requestId = parseInt(btn.dataset.requestId);
                    const request = timeOffRequests.find(r => r.id === requestId);
                    
                    if (!request) {
                        alert('Request not found.');
                        return;
                    }

                    const employeeName = request.employees?.name || request.employee_name || 'Employee';
                    const startDate = new Date(request.start_date).toLocaleDateString();
                    const endDate = new Date(request.end_date).toLocaleDateString();

                    if (confirm(`Are you sure you want to remove this approved time off?\n\n${employeeName}\n${startDate} - ${endDate}\n\nThis will also remove the associated exception logs and allow scheduling during this period.`)) {
                        const result = await supabaseService.deleteTimeOffRequest(requestId);
                        if (result) {
                            alert('✅ Time off request removed successfully. Exception logs have been deleted and scheduling is now allowed during this period.');
                            await loadTimeOffRequests();
                            // Refresh the calendar view if it exists
                            if (typeof renderCalendar === 'function') {
                                await renderCalendar();
                            }
                            // Refresh shifts to update availability
                            await loadShifts();
                        } else {
                            alert('❌ Failed to remove time off request. Please try again.');
                        }
                    }
                });
            });

        } catch (error) {
            console.error('Error loading time off requests:', error);
            list.innerHTML = '<div class="loading-message">Error loading time off requests: ' + error.message + '</div>';
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==========================================
    // ADMIN: Assign Time Off Directly
    // ==========================================
    const assignTimeOffModal = document.getElementById('assignTimeOffModal');
    const assignTimeOffBtn = document.getElementById('assignTimeOffBtn');
    const assignTimeOffForm = document.getElementById('assignTimeOffForm');
    const closeAssignTimeOffModal = document.getElementById('closeAssignTimeOffModal');
    const cancelAssignTimeOffBtn = document.getElementById('cancelAssignTimeOffBtn');

    // Open modal
    assignTimeOffBtn.addEventListener('click', async () => {
        // Populate employee dropdown
        const employeeSelect = document.getElementById('assignTimeOffEmployee');
        employeeSelect.innerHTML = '<option value="">Select Employee...</option>';
        
        employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.id;
            option.textContent = emp.name;
            employeeSelect.appendChild(option);
        });

        // Set default dates (today and tomorrow)
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        document.getElementById('assignTimeOffStartDate').value = today.toISOString().split('T')[0];
        document.getElementById('assignTimeOffEndDate').value = tomorrow.toISOString().split('T')[0];
        document.getElementById('assignTimeOffReason').value = '';

        assignTimeOffModal.style.display = 'block';
    });

    // Close modal
    closeAssignTimeOffModal.addEventListener('click', () => {
        assignTimeOffModal.style.display = 'none';
    });

    cancelAssignTimeOffBtn.addEventListener('click', () => {
        assignTimeOffModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === assignTimeOffModal) {
            assignTimeOffModal.style.display = 'none';
        }
    });

    // Submit form
    assignTimeOffForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const employeeId = parseInt(document.getElementById('assignTimeOffEmployee').value);
        const startDate = document.getElementById('assignTimeOffStartDate').value;
        const endDate = document.getElementById('assignTimeOffEndDate').value;
        const reason = document.getElementById('assignTimeOffReason').value.trim() || 'Admin assigned time off';

        // Validate dates
        if (new Date(startDate) > new Date(endDate)) {
            alert('Start date must be before end date!');
            return;
        }

        if (!employeeId) {
            alert('Please select an employee');
            return;
        }

        const employee = employees.find(e => e.id === employeeId);
        if (!employee) {
            alert('Selected employee not found');
            return;
        }

        if (confirm(`Assign time off to ${employee.name} from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}?\n\nThis will:\n- Delete all tasks and shifts during this period\n- Create VATO exception logs\n- Prevent future scheduling during this time`)) {
            const submitBtn = assignTimeOffForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = '⏳ Assigning...';
            submitBtn.disabled = true;

            try {
                const result = await supabaseService.assignTimeOffToEmployee(employeeId, startDate, endDate, reason);
                
                if (result) {
                    alert(`✅ Time off assigned successfully to ${employee.name}!\n\nAll tasks and shifts during this period have been deleted.\nVATO exception logs have been created.`);
                    assignTimeOffModal.style.display = 'none';
                    assignTimeOffForm.reset();
                    await loadTimeOffRequests();
                    await loadShifts(); // Refresh shifts to show deletions
                    if (typeof renderCalendar === 'function') {
                        await renderCalendar();
                    }
                } else {
                    alert('❌ Failed to assign time off. Please try again.');
                }
            } catch (error) {
                console.error('Error assigning time off:', error);
                alert('❌ Error assigning time off: ' + error.message);
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        }
    });

    // ==========================================
    // AUTOMATIC SHIFT ASSIGNMENT
    // ==========================================

    /**
     * Calculate hours in a shift
     */
    function calculateShiftHours(startTime, endTime) {
        const start = new Date(`2000-01-01T${startTime}`);
        let end = new Date(`2000-01-01T${endTime}`);
        
        // Handle overnight shifts (end time is next day)
        if (end <= start) {
            end.setDate(end.getDate() + 1);
        }
        
        const diffMs = end - start;
        return diffMs / (1000 * 60 * 60); // Convert to hours
    }

    /**
     * Get available days for an employee in a week (excluding time off and existing shifts)
     * Note: DO exceptions are NOT filtered out because they are automatically removed when shifts are assigned
     */
    async function getAvailableDays(employeeId, weekStart) {
        const availableDays = [];
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        // Get existing shifts for the week
        const existingShifts = await supabaseService.getEmployeeShifts(
            formatDate(weekStart),
            formatDate(weekEnd)
        );
        const employeeShifts = (existingShifts || []).filter(s => s.employee_id === employeeId);
        const shiftDates = new Set(employeeShifts.map(s => {
            const date = s.shift_date instanceof Date ? formatDate(s.shift_date) : s.shift_date.split('T')[0];
            return date;
        }));

        // Get time off requests for the week
        const timeOffRequests = await supabaseService.getTimeOffRequests();
        const employeeTimeOff = (timeOffRequests || []).filter(req => 
            req.employee_id === employeeId && 
            req.status === 'approved'
        );

        // Get exception logs for time off (VATO, VAUT) for the week
        const exceptions = await supabaseService.getExceptionLogs({
            employeeId: employeeId,
            startDate: formatDate(weekStart),
            endDate: formatDate(weekEnd)
        });
        const timeOffExceptions = (exceptions || []).filter(exc => 
            ['VATO', 'VAUT'].includes(exc.exception_code)
        );
        const timeOffExceptionDates = new Set(timeOffExceptions.map(exc => {
            const date = exc.exception_date instanceof Date 
                ? formatDate(exc.exception_date) 
                : exc.exception_date.split('T')[0];
            return date;
        }));

        // Check each day of the week
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(day.getDate() + i);
            const dateStr = formatDate(day);

            // Skip if already has a shift
            if (shiftDates.has(dateStr)) {
                continue;
            }

            // Skip if has VATO/VAUT exception (time off)
            if (timeOffExceptionDates.has(dateStr)) {
                console.log(`Skipping ${dateStr} for employee ${employeeId} - has time off exception`);
                continue;
            }

            // Skip if has approved time off request (check date range)
            const hasTimeOff = employeeTimeOff.some(req => {
                // Handle both string and Date formats
                let startDateStr = req.start_date;
                let endDateStr = req.end_date;
                
                if (startDateStr instanceof Date) {
                    startDateStr = formatDate(startDateStr);
                } else if (typeof startDateStr === 'string') {
                    startDateStr = startDateStr.split('T')[0]; // Remove time portion
                }
                
                if (endDateStr instanceof Date) {
                    endDateStr = formatDate(endDateStr);
                } else if (typeof endDateStr === 'string') {
                    endDateStr = endDateStr.split('T')[0]; // Remove time portion
                }
                
                // Compare as date strings (YYYY-MM-DD format)
                return dateStr >= startDateStr && dateStr <= endDateStr;
            });

            if (hasTimeOff) {
                console.log(`Skipping ${dateStr} for employee ${employeeId} - has approved time off request`);
                continue;
            }

            // DO NOT filter out DO exceptions - they will be automatically removed when shifts are assigned
            // DO exceptions are just placeholders for days without shifts

            availableDays.push(dateStr);
        }

        return availableDays;
    }

    /**
     * Automatically assign shifts for all employees based on their employment type
     */
    async function autoAssignShifts() {
        if (!supabaseService || !supabaseService.isReady()) {
            alert('Supabase not connected');
            return;
        }

        if (!confirm('This will automatically assign shifts for all active employees based on their employment type (Part-time: 25 hours/week, Full-time: 40 hours/week).\n\nExisting shifts for this week will be skipped.\n\nContinue?')) {
            return;
        }

        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'loading-message';
        loadingMsg.textContent = 'Assigning shifts...';
        loadingMsg.style.position = 'fixed';
        loadingMsg.style.top = '50%';
        loadingMsg.style.left = '50%';
        loadingMsg.style.transform = 'translate(-50%, -50%)';
        loadingMsg.style.zIndex = '10000';
        loadingMsg.style.background = 'rgba(0,0,0,0.8)';
        loadingMsg.style.color = 'white';
        loadingMsg.style.padding = '20px';
        loadingMsg.style.borderRadius = '8px';
        document.body.appendChild(loadingMsg);

        try {
            // Get employees and profiles separately to avoid relationship ambiguity
            const [employeesResult, profilesResult] = await Promise.all([
                supabaseService.client
                    .from('employees')
                    .select('*'),
                supabaseService.client
                    .from('employee_profiles')
                    .select('id, employee_id, employment_type, employment_status')
                    .eq('employment_status', 'active')
            ]);

            if (employeesResult.error) {
                throw employeesResult.error;
            }
            if (profilesResult.error) {
                throw profilesResult.error;
            }

            const employees = employeesResult.data || [];
            const profiles = profilesResult.data || [];

            // Create a map of employee_id to profile
            const profileMap = new Map();
            profiles.forEach(profile => {
                profileMap.set(profile.employee_id, profile);
            });

            // Combine employees with their profiles, only including active employees
            const activeEmployees = employees
                .filter(emp => {
                    const profile = profileMap.get(emp.id);
                    return profile && profile.employment_status === 'active';
                })
                .map(emp => ({
                    ...emp,
                    employee_profiles: profileMap.get(emp.id)
                }));

            if (activeEmployees.length === 0) {
                alert('No active employees found with profiles. Please ensure employees have profiles with employment_status = "active".');
                loadingMsg.remove();
                return;
            }

            console.log(`Found ${activeEmployees.length} active employees:`, activeEmployees.map(e => ({
                name: e.name,
                id: e.id,
                employment_type: e.employee_profiles?.employment_type || 'full-time'
            })));

            // Get shift templates
            const templates = await supabaseService.getShiftTemplates();
            if (!templates || templates.length === 0) {
                alert('No shift templates found. Please create shift templates first.');
                loadingMsg.remove();
                return;
            }

            console.log(`Found ${templates.length} shift templates:`, templates.map(t => ({
                name: t.name,
                hours: calculateShiftHours(t.start_time, t.end_time)
            })));

            // Calculate template durations
            const templatesWithHours = templates.map(t => ({
                ...t,
                hours: calculateShiftHours(t.start_time, t.end_time)
            }));

            let totalAssigned = 0;
            let totalSkipped = 0;

            // Process each employee
            for (const employee of activeEmployees) {
                const profile = Array.isArray(employee.employee_profiles) 
                    ? employee.employee_profiles[0] 
                    : employee.employee_profiles;
                
                const employmentType = profile?.employment_type || 'full-time';
                const hoursPerWeek = employmentType === 'part-time' ? 25 : 40;

                loadingMsg.textContent = `Assigning shifts for ${employee.name} (${employmentType})...`;

                // Get available days for this week
                const availableDays = await getAvailableDays(employee.id, currentWeekStart);
                
                console.log(`${employee.name}: Found ${availableDays.length} available days:`, availableDays);
                
                if (availableDays.length === 0) {
                    console.log(`No available days for ${employee.name} - may have time off or all days already have shifts`);
                    totalSkipped++;
                    continue;
                }

                // Shuffle available days for randomization
                const shuffledDays = [...availableDays].sort(() => Math.random() - 0.5);

                // Assign shifts until we reach the target hours
                let assignedHours = 0;
                const assignedShifts = [];

                for (const day of shuffledDays) {
                    if (assignedHours >= hoursPerWeek) break;

                    // Randomly select a template
                    const availableTemplates = templatesWithHours.filter(t => 
                        assignedHours + t.hours <= hoursPerWeek + 2 // Allow slight overage
                    );

                    if (availableTemplates.length === 0) break;

                    const template = availableTemplates[Math.floor(Math.random() * availableTemplates.length)];
                    const remainingHours = hoursPerWeek - assignedHours;

                    // If this template fits or is close enough, use it
                    if (template.hours <= remainingHours + 2) {
                        const shiftData = {
                            employee_id: employee.id,
                            shift_date: day,
                            shift_template_id: template.id,
                            start_time: template.start_time,
                            end_time: template.end_time,
                            status: 'scheduled'
                        };

                        try {
                            console.log(`Creating shift for ${employee.name} on ${day}:`, shiftData);
                            const result = await supabaseService.createEmployeeShift(shiftData);
                            if (result) {
                                console.log(`✅ Successfully created shift:`, result);
                                assignedShifts.push(result);
                                assignedHours += template.hours;
                                totalAssigned++;
                            } else {
                                console.warn(`⚠️ Failed to create shift for ${employee.name} on ${day} - createEmployeeShift returned null`);
                            }
                        } catch (error) {
                            console.error(`❌ Error creating shift for ${employee.name} on ${day}:`, error);
                        }
                    }
                }

                console.log(`Assigned ${assignedHours.toFixed(1)} hours to ${employee.name} (target: ${hoursPerWeek} hours)`);
            }

            loadingMsg.remove();
            
            console.log(`Auto-assign summary: ${totalAssigned} shifts assigned, ${totalSkipped} employees skipped`);
            
            if (totalAssigned === 0) {
                alert(`⚠️ No shifts were assigned.\n\nPossible reasons:\n- All employees have time off for this week\n- All available days already have shifts\n- No shift templates available\n\nCheck the console for detailed logs.`);
            } else {
                // Verify shifts were actually created by querying them
                const weekEnd = new Date(currentWeekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                const verifyShifts = await supabaseService.getEmployeeShifts(
                    formatDate(currentWeekStart),
                    formatDate(weekEnd)
                );
                console.log(`Verification: Found ${verifyShifts?.length || 0} shifts in database for this week`);
                
                alert(`✅ Automatic shift assignment complete!\n\n- Shifts assigned: ${totalAssigned}\n- Employees skipped: ${totalSkipped}\n- Shifts in database: ${verifyShifts?.length || 0}\n\nRefreshing schedule...`);
            }
            
            // Refresh the calendar to show new shifts
            console.log('Refreshing calendar...');
            await loadShifts();
            console.log('Calendar refreshed');
        } catch (error) {
            console.error('Error in auto-assign shifts:', error);
            loadingMsg.remove();
            alert('❌ Error assigning shifts: ' + error.message);
        }
    }

    // Add button for automatic shift assignment
    function addAutoAssignButton() {
        try {
            // Check if button already exists
            if (document.getElementById('autoAssignShiftsBtn')) {
                return;
            }

            const autoAssignBtn = document.createElement('button');
            autoAssignBtn.id = 'autoAssignShiftsBtn';
            autoAssignBtn.className = 'btn-primary';
            autoAssignBtn.textContent = '🤖 Auto-Assign Shifts';
            autoAssignBtn.title = 'Automatically assign shifts based on employment type (Part-time: 25h/week, Full-time: 40h/week)';
            autoAssignBtn.style.marginLeft = '10px';
            
            autoAssignBtn.addEventListener('click', async () => {
                await autoAssignShifts();
            });

            // Insert button next to "Add Shift" button (addShiftBtn is already declared above)
            if (addShiftBtn && addShiftBtn.parentNode) {
                addShiftBtn.parentNode.insertBefore(autoAssignBtn, addShiftBtn.nextSibling);
            }
        } catch (error) {
            console.error('Error adding auto-assign button:', error);
        }
    }

    // Initial load
    try {
        await loadShifts();
        await loadTimeOffRequests();
        
        // Add button after initial load completes
        addAutoAssignButton();
    } catch (error) {
        console.error('Error during initial load:', error);
        const calendar = document.getElementById('shiftCalendar');
        if (calendar) {
            calendar.innerHTML = '<div class="loading-message">Error loading shifts: ' + error.message + '</div>';
        }
    }

    // Check for expired time off and restore employees to active
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        try {
            await supabaseService.checkExpiredTimeOff();
        } catch (error) {
            console.error('Error checking expired time off on shifts page load:', error);
        }
    }
});

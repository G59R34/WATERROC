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
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        loadShifts();
    });

    document.getElementById('nextWeekBtn').addEventListener('click', () => {
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
        return date.toISOString().split('T')[0];
    }

    function formatDateDisplay(date) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    async function loadShifts() {
        const calendar = document.getElementById('shiftCalendar');
        calendar.innerHTML = '<div class="loading-message">Loading shifts...</div>';

        try {
            // Load data
            employees = await supabaseService.getEmployees();
            shiftTemplates = await supabaseService.getShiftTemplates();
            
            console.log('Employees loaded:', employees);
            console.log('Shift templates loaded:', shiftTemplates);
            
            const weekEnd = new Date(currentWeekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            
            shifts = await supabaseService.getEmployeeShifts(
                formatDate(currentWeekStart),
                formatDate(weekEnd)
            );
            
            console.log('Shifts loaded:', shifts);

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
            shifts.forEach(shift => {
                const key = `${shift.employee_id}-${shift.shift_date}`;
                if (!shiftMap[key]) {
                    shiftMap[key] = [];
                }
                shiftMap[key].push(shift);
            });
        }

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
                    const result = await supabaseService.updateTimeOffRequest(requestId, { status: 'approved' });
                    if (result) {
                        await loadTimeOffRequests();
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

    // Initial load
    await loadShifts();
});

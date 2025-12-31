// Employee Monitor - Real-time status monitoring for admins
document.addEventListener('DOMContentLoaded', async function() {
    'use strict';

    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    let refreshInterval = null;
    let allEmployees = [];
    let currentFilters = {
        status: '',
        search: ''
    };

    // Initialize
    async function init() {
        console.log('Initializing Employee Monitor...');
        
        // Wait for Supabase
        if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
            setTimeout(init, 100);
            return;
        }

        // Setup event listeners
        setupEventListeners();
        
        // Load initial data
        await loadEmployeeData();
        
        // Start auto-refresh if enabled
        if (document.getElementById('autoRefresh').checked) {
            startAutoRefresh();
        }
    }

    function setupEventListeners() {
        // Auto-refresh toggle
        document.getElementById('autoRefresh').addEventListener('change', function(e) {
            if (e.target.checked) {
                startAutoRefresh();
            } else {
                stopAutoRefresh();
            }
        });

        // Manual refresh
        document.getElementById('manualRefreshBtn').addEventListener('click', async () => {
            await loadEmployeeData();
        });

        // Back to admin
        document.getElementById('backToAdminBtn').addEventListener('click', () => {
            window.location.href = 'admin.html';
        });

        // Filters
        document.getElementById('statusFilter').addEventListener('change', function(e) {
            currentFilters.status = e.target.value;
            renderEmployees();
        });

        document.getElementById('searchFilter').addEventListener('input', function(e) {
            currentFilters.search = e.target.value.toLowerCase();
            renderEmployees();
        });
    }

    async function loadEmployeeData(showLoading = true) {
        try {
            const grid = document.getElementById('employeesGrid');
            
            // Only show loading on initial load
            if (showLoading && (!allEmployees || allEmployees.length === 0)) {
                grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading employee data...</p></div>';
            }

            // Get all employees with profiles
            const employees = await supabaseService.getEmployeesWithProfiles();
            if (!employees || employees.length === 0) {
                if (showLoading) {
                    grid.innerHTML = '<div class="empty-state"><p>No employees found</p></div>';
                }
                return;
            }

            // Get today's date in local timezone (not UTC) to avoid timezone issues
            const now = new Date();
            // Format date as YYYY-MM-DD in local timezone (not UTC)
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const today = `${year}-${month}-${day}`;
            
            console.log(`[Employee Monitor] Using date: ${today} (local timezone, current time: ${now.toLocaleString()})`);

            // Fetch all shifts for today ONCE (not per employee)
            let allShiftsToday = [];
            try {
                const shiftsData = await supabaseService.getEmployeeShifts(today, today);
                allShiftsToday = Array.isArray(shiftsData) ? shiftsData : [];
            } catch (error) {
                console.error('Error fetching shifts:', error);
                allShiftsToday = [];
            }

            // Load additional data for each employee
            const newEmployeeData = await Promise.all(employees.map(async (emp) => {
                try {
                    // Find today's shift for this employee from the pre-fetched shifts
                    let todayShift = null;
                    if (allShiftsToday.length > 0) {
                        // Ensure we compare the same type (both as numbers)
                        const empId = typeof emp.id === 'number' ? emp.id : parseInt(emp.id, 10);
                        todayShift = allShiftsToday.find(s => {
                            if (!s || !s.employee_id) return false;
                            const shiftEmpId = typeof s.employee_id === 'number' ? s.employee_id : parseInt(s.employee_id, 10);
                            return shiftEmpId === empId;
                        }) || null;
                    }

                    // Get today's tasks
                    // Ensure employee ID is the correct type
                    const empIdForQuery = typeof emp.id === 'number' ? emp.id : parseInt(emp.id, 10);
                    
                    console.log(`[Employee Monitor] Fetching tasks for employee ${empIdForQuery} (${emp.name}) on date ${today}`);
                    let tasks = await supabaseService.getHourlyTasks(today, today, empIdForQuery);
                    
                    // If no tasks found with employee filter, try fetching all tasks for the date and filter client-side
                    if ((!tasks || tasks.length === 0) && empIdForQuery) {
                        console.log(`[Employee Monitor] No tasks with employee filter, trying to fetch all tasks for ${today} and filter client-side...`);
                        const allTasks = await supabaseService.getHourlyTasks(today, today, null);
                        if (allTasks && Array.isArray(allTasks)) {
                            // Filter by employee ID client-side
                            tasks = allTasks.filter(task => {
                                const taskEmpId = typeof task.employee_id === 'number' ? task.employee_id : parseInt(task.employee_id, 10);
                                return taskEmpId === empIdForQuery;
                            });
                            console.log(`[Employee Monitor] Found ${tasks.length} tasks after client-side filtering for ${emp.name}`);
                        }
                    }
                    
                    if (!tasks || !Array.isArray(tasks)) {
                        tasks = [];
                    }
                    // Ensure tasks is always an array
                    tasks = Array.isArray(tasks) ? tasks : [];
                    
                    // Debug logging
                    if (tasks.length > 0) {
                        console.log(`✅ [Employee Monitor] Loaded ${tasks.length} tasks for employee ${empIdForQuery} (${emp.name})`);
                        tasks.forEach((task, idx) => {
                            console.log(`  Task ${idx + 1}: ${task.name} (${task.start_time}-${task.end_time}) - employee_id: ${task.employee_id} (type: ${typeof task.employee_id}), task_date: ${task.task_date}`);
                        });
                    } else {
                        console.log(`⚠️ [Employee Monitor] No tasks found for employee ${empIdForQuery} (${emp.name}) on ${today}`);
                        // Additional debugging - check if tasks exist for this employee on any date
                        const allEmployeeTasks = await supabaseService.getHourlyTasks('2000-01-01', '2099-12-31', empIdForQuery);
                        if (allEmployeeTasks && allEmployeeTasks.length > 0) {
                            console.log(`  ℹ️ Found ${allEmployeeTasks.length} total tasks for this employee (but none for ${today})`);
                            const uniqueDates = [...new Set(allEmployeeTasks.map(t => t.task_date))];
                            console.log(`  ℹ️ Tasks exist on dates: ${uniqueDates.join(', ')}`);
                        }
                    }

                    // Get current exception status
                    const exceptions = await supabaseService.getExceptionLogs({
                        employeeId: emp.id,
                        date: today
                    }) || [];

                    // Get screen share data
                    let screenShareData = null;
                    try {
                        const { data: screenShare, error } = await supabaseService.client
                            .from('employee_screen_shares')
                            .select('frame_data, updated_at')
                            .eq('employee_id', emp.id)
                            .maybeSingle(); // Use maybeSingle instead of single to avoid errors if not found
                        
                        if (!error && screenShare) {
                            // Check if screen share is recent (within last minute)
                            const shareTime = new Date(screenShare.updated_at);
                            const timeDiff = now - shareTime;
                            if (timeDiff < 60000) { // 1 minute
                                screenShareData = screenShare;
                            }
                        }
                    } catch (error) {
                        // Screen share not found or error - that's okay, table might not exist yet
                        console.debug('Screen share check for employee', emp.id, ':', error.message);
                    }

                    // Calculate status (pass screenShare to consider it in status)
                    const status = calculateEmployeeStatus(emp, todayShift, tasks, exceptions, now, screenShareData);

                    // Preserve existing screen share if new one is null but old one exists and is recent
                    let finalScreenShare = screenShareData;
                    if (!finalScreenShare && allEmployees && allEmployees.length > 0) {
                        const existingEmp = allEmployees.find(e => e.id === emp.id);
                        if (existingEmp && existingEmp.screenShare) {
                            const shareTime = new Date(existingEmp.screenShare.updated_at);
                            const timeDiff = now - shareTime;
                            if (timeDiff < 60000) { // Still recent
                                finalScreenShare = existingEmp.screenShare;
                            }
                        }
                    }

                    return {
                        ...emp,
                        shift: todayShift,
                        tasks: tasks,
                        exceptions: exceptions,
                        screenShare: finalScreenShare,
                        status: status
                    };
                } catch (error) {
                    console.error(`Error loading data for employee ${emp.id} (${emp.name}):`, error);
                    // Return employee with minimal data so they still show up
                    return {
                        ...emp,
                        shift: null,
                        tasks: [],
                        exceptions: [],
                        screenShare: null,
                        status: { type: 'unknown', label: 'Unknown', color: '#64748b' }
                    };
                }
            }));

            // Check if this is initial load or update
            const isInitialLoad = !allEmployees || allEmployees.length === 0;
            
            allEmployees = newEmployeeData;

            if (isInitialLoad) {
                // Initial load - render everything
                renderEmployees();
            } else {
                // Update existing cards without full re-render
                updateEmployeeCards();
            }
            
            updateLiveIndicator();
        } catch (error) {
            console.error('Error loading employee data:', error);
            if (showLoading) {
                document.getElementById('employeesGrid').innerHTML = 
                    '<div class="error-state"><p>Error loading employee data. Please try again.</p></div>';
            }
        }
    }

    function calculateEmployeeStatus(employee, shift, tasks, exceptions, now, screenShare = null) {
        // Check employment status
        if (employee.employment_status === 'terminated' || employee.employment_status === 'administrative_leave') {
            return {
                type: 'inactive',
                label: employee.employment_status === 'terminated' ? 'Terminated' : 'Admin Leave',
                color: '#ef4444'
            };
        }

        // PRIORITY: If actively screen sharing, they are definitely active/on-duty
        if (screenShare && screenShare.frame_data) {
            const shareTime = new Date(screenShare.updated_at);
            const timeDiff = now - shareTime;
            if (timeDiff < 60000) { // Within last minute
                return {
                    type: 'active',
                    label: 'Active',
                    color: '#10b981'
                };
            }
        }

        // Check if on shift
        if (shift) {
            const shiftStart = parseTime(shift.start_time);
            const shiftEnd = parseTime(shift.end_time);
            const currentTime = now.getHours() * 60 + now.getMinutes();

            if (currentTime >= shiftStart && currentTime < shiftEnd) {
                // Check for exceptions
                if (exceptions.length > 0) {
                    const exception = exceptions[0];
                    if (exception.exception_code === 'VAUT' || exception.exception_code === 'UAEO') {
                        return {
                            type: 'exception',
                            label: exception.exception_code,
                            color: exception.exception_code === 'VAUT' ? '#10b981' : '#ef4444'
                        };
                    }
                }
                return {
                    type: 'on_shift',
                    label: 'On Shift',
                    color: '#3b82f6'
                };
            } else if (currentTime < shiftStart) {
                return {
                    type: 'scheduled',
                    label: 'Scheduled',
                    color: '#8b5cf6'
                };
            }
        }

        // Check active tasks
        const activeTasks = tasks.filter(task => {
            if (task.status === 'completed' || task.status === 'overdue') return false;
            const taskStart = parseTime(task.start_time);
            const taskEnd = parseTime(task.end_time);
            const currentTime = now.getHours() * 60 + now.getMinutes();
            return currentTime >= taskStart && currentTime < taskEnd;
        });

        if (activeTasks.length > 0) {
            return {
                type: 'on_task',
                label: 'On Task',
                color: '#10b981'
            };
        }

        // Default to off duty
        return {
            type: 'off_duty',
            label: 'Off Duty',
            color: '#64748b'
        };
    }

    function parseTime(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.includes(':') 
            ? timeStr.split(':')
            : [timeStr.substring(0, 2), timeStr.substring(2, 4)];
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    function renderEmployees() {
        const grid = document.getElementById('employeesGrid');
        
        // Filter employees
        let filtered = allEmployees;
        
        if (currentFilters.status) {
            filtered = filtered.filter(emp => emp.status.type === currentFilters.status);
        }
        
        if (currentFilters.search) {
            filtered = filtered.filter(emp => 
                emp.name.toLowerCase().includes(currentFilters.search) ||
                (emp.email && emp.email.toLowerCase().includes(currentFilters.search))
            );
        }

        if (filtered.length === 0) {
            grid.innerHTML = '<div class="empty-state"><p>No employees match the filters</p></div>';
            return;
        }

        grid.innerHTML = filtered.map(emp => {
            // Format shift time correctly (handle both TIME and VARCHAR formats)
            const formatShiftTime = (timeStr) => {
                if (!timeStr) return 'N/A';
                if (timeStr.includes(':')) {
                    return timeStr.substring(0, 5); // HH:MM
                } else if (timeStr.length === 4) {
                    // HHMM format
                    return timeStr.substring(0, 2) + ':' + timeStr.substring(2, 4);
                }
                return timeStr;
            };
            
            const shiftInfo = emp.shift 
                ? `${formatShiftTime(emp.shift.start_time)} - ${formatShiftTime(emp.shift.end_time)}`
                : 'No shift';
            
            const taskCount = emp.tasks ? emp.tasks.length : 0;
            const completedTasks = emp.tasks ? emp.tasks.filter(t => t.status === 'completed').length : 0;
            const pendingTasks = emp.tasks ? emp.tasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length : 0;
            const overdueTasks = emp.tasks ? emp.tasks.filter(t => t.status === 'overdue').length : 0;

            return `
                <div class="employee-card" data-employee-id="${emp.id}">
                    <div class="employee-header">
                        <div class="employee-name-section">
                            <h3>${escapeHtml(emp.name)}</h3>
                            <span class="status-badge" style="background: ${emp.status.color}">
                                ${emp.status.label}
                            </span>
                        </div>
                        <div class="employee-status-indicator" style="background: ${emp.status.color}"></div>
                    </div>
                    
                    <div class="employee-details">
                        <div class="detail-row">
                            <span class="detail-label">📅 Today's Shift:</span>
                            <span class="detail-value">${shiftInfo}</span>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">📋 Hourly Tasks:</span>
                            <span class="detail-value">
                                ${taskCount} total
                                ${completedTasks > 0 ? `<span style="color: #10b981;">✓${completedTasks}</span>` : ''}
                                ${pendingTasks > 0 ? `<span style="color: #3b82f6;">⏳${pendingTasks}</span>` : ''}
                                ${overdueTasks > 0 ? `<span style="color: #ef4444;">⚠${overdueTasks}</span>` : ''}
                            </span>
                        </div>

                        ${emp.exceptions && emp.exceptions.length > 0 ? `
                            <div class="detail-row">
                                <span class="detail-label">⚠️ Exceptions:</span>
                                <span class="detail-value">
                                    ${emp.exceptions.map(ex => `<span style="background: ${ex.exception_code === 'VAUT' ? '#10b981' : ex.exception_code === 'DO' ? '#3b82f6' : '#ef4444'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-right: 4px;">${ex.exception_code}</span>`).join('')}
                                </span>
                            </div>
                        ` : ''}

                        <div class="detail-row">
                            <span class="detail-label">💼 Employment:</span>
                            <span class="detail-value">${emp.employment_type || 'N/A'} - ${emp.employment_status || 'active'}</span>
                        </div>
                    </div>

                    <div class="employee-tasks-preview">
                        <div class="tasks-section-header">Hourly Tasks:</div>
                        ${(emp.tasks && Array.isArray(emp.tasks) && emp.tasks.length > 0) ? `
                            <div class="tasks-list">
                                ${emp.tasks.slice(0, 5).map(task => {
                                    const formatTaskTime = (timeStr) => {
                                        if (!timeStr) return 'N/A';
                                        if (timeStr.includes(':')) {
                                            return timeStr.substring(0, 5); // HH:MM
                                        } else if (timeStr.length === 4) {
                                            return timeStr.substring(0, 2) + ':' + timeStr.substring(2, 4);
                                        }
                                        return timeStr;
                                    };
                                    
                                    const taskStatusColor = task.status === 'completed' ? '#10b981' : 
                                                          task.status === 'overdue' ? '#ef4444' : 
                                                          task.status === 'in-progress' ? '#3b82f6' : '#64748b';
                                    return `
                                        <div class="task-item-mini">
                                            <span class="task-time">${formatTaskTime(task.start_time)}-${formatTaskTime(task.end_time)}</span>
                                            <span class="task-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span>
                                            <span class="task-status" style="background: ${taskStatusColor}">${task.status}</span>
                                        </div>
                                    `;
                                }).join('')}
                                ${emp.tasks.length > 5 ? `<div class="more-tasks">+${emp.tasks.length - 5} more hourly tasks</div>` : ''}
                            </div>
                        ` : '<div class="no-tasks">No hourly tasks scheduled</div>'}
                    </div>

                    ${emp.screenShare && emp.screenShare.frame_data ? `
                        <div class="employee-screen-preview">
                            <div class="screen-preview-header">
                                <span class="screen-label">🖥️ Screen Share</span>
                                <div class="screen-preview-actions">
                                    <span class="screen-status live">● Live</span>
                                    <button class="fullscreen-btn" 
                                            data-employee-id="${emp.id}" 
                                            title="Fullscreen"
                                            onclick="openScreenShareFullscreen(${emp.id}, '${escapeHtml(emp.name)}')">
                                        ⛶
                                    </button>
                                </div>
                            </div>
                            <div class="screen-preview-container">
                                <img src="${emp.screenShare.frame_data}" 
                                     alt="Screen share for ${escapeHtml(emp.name)}" 
                                     class="screen-preview-image"
                                     data-employee-id="${emp.id}"
                                     onerror="this.parentElement.parentElement.style.display='none'">
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="employee-actions">
                        <button class="lockdown-btn" 
                                data-employee-id="${emp.id}" 
                                data-employee-name="${escapeHtml(emp.name)}"
                                title="Force browser into lockdown mode (fullscreen, always on top, no escape)"
                                onclick="lockdownEmployee(${emp.id}, '${escapeHtml(emp.name)}')">
                            🔒 Lockdown
                        </button>
                        <button class="punish-btn" 
                                data-employee-id="${emp.id}" 
                                data-employee-name="${escapeHtml(emp.name)}"
                                title="Force logout with womp womp screen"
                                onclick="punishEmployee(${emp.id}, '${escapeHtml(emp.name)}')">
                            ⚠️ Punish
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        
        // Update data in background without re-rendering (silent refresh)
        refreshInterval = setInterval(async () => {
            await loadEmployeeData(false); // false = don't show loading state
        }, 5000); // Refresh every 5 seconds
        
        // Update screen shares separately every 2 seconds for smoother video
        // Update screen shares every 1 second for seamless updates
        setInterval(updateScreenShares, 1000);
    }
    
    function updateEmployeeCards() {
        // Check if we need to add new employee cards
        const grid = document.getElementById('employeesGrid');
        const existingCardIds = new Set(
            Array.from(grid.querySelectorAll('.employee-card'))
                .map(card => parseInt(card.getAttribute('data-employee-id')))
        );
        
        const newEmployeeIds = new Set(allEmployees.map(emp => emp.id));
        const hasNewEmployees = Array.from(newEmployeeIds).some(id => !existingCardIds.has(id));
        
        // If new employees were added, do a full re-render
        if (hasNewEmployees) {
            renderEmployees();
            return;
        }

        // Update individual employee cards without full re-render
        allEmployees.forEach(emp => {
            const card = document.querySelector(`.employee-card[data-employee-id="${emp.id}"]`);
            if (!card) {
                // Card doesn't exist, need to render it
                renderEmployees();
                return;
            }

            // Update status badge
            const statusBadge = card.querySelector('.status-badge');
            if (statusBadge) {
                statusBadge.textContent = emp.status.label;
                statusBadge.style.background = emp.status.color;
            }

            // Update status indicator
            const statusIndicator = card.querySelector('.employee-status-indicator');
            if (statusIndicator) {
                statusIndicator.style.background = emp.status.color;
            }

            // Update shift info
            const shiftValue = card.querySelector('.detail-row:nth-child(1) .detail-value');
            if (shiftValue) {
                const formatShiftTime = (timeStr) => {
                    if (!timeStr) return 'N/A';
                    if (timeStr.includes(':')) {
                        return timeStr.substring(0, 5); // HH:MM
                    } else if (timeStr.length === 4) {
                        return timeStr.substring(0, 2) + ':' + timeStr.substring(2, 4);
                    }
                    return timeStr;
                };
                
                const shiftInfo = emp.shift 
                    ? `${formatShiftTime(emp.shift.start_time)} - ${formatShiftTime(emp.shift.end_time)}`
                    : 'No shift';
                shiftValue.textContent = shiftInfo;
            }

            // Update tasks count
            const tasksValue = card.querySelector('.detail-row:nth-child(2) .detail-value');
            if (tasksValue) {
                const taskCount = emp.tasks ? emp.tasks.length : 0;
                const completedTasks = emp.tasks ? emp.tasks.filter(t => t.status === 'completed').length : 0;
                const pendingTasks = emp.tasks ? emp.tasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length : 0;
                const overdueTasks = emp.tasks ? emp.tasks.filter(t => t.status === 'overdue').length : 0;
                
                tasksValue.innerHTML = `
                    ${taskCount} total
                    ${completedTasks > 0 ? `<span style="color: #10b981;">✓${completedTasks}</span>` : ''}
                    ${pendingTasks > 0 ? `<span style="color: #3b82f6;">⏳${pendingTasks}</span>` : ''}
                    ${overdueTasks > 0 ? `<span style="color: #ef4444;">⚠${overdueTasks}</span>` : ''}
                `;
            }

            // Update exceptions if they exist
            const exceptionsRow = card.querySelector('.detail-row:nth-child(3)');
            if (emp.exceptions && emp.exceptions.length > 0) {
                if (!exceptionsRow || !exceptionsRow.querySelector('.detail-label')?.textContent.includes('Exceptions')) {
                    // Need to add exceptions row
                    const detailsDiv = card.querySelector('.employee-details');
                    if (detailsDiv) {
                        const exceptionsHtml = `
                            <div class="detail-row">
                                <span class="detail-label">⚠️ Exceptions:</span>
                                <span class="detail-value">
                                    ${emp.exceptions.map(ex => `<span style="background: ${ex.exception_code === 'VAUT' ? '#10b981' : ex.exception_code === 'DO' ? '#3b82f6' : '#ef4444'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-right: 4px;">${ex.exception_code}</span>`).join('')}
                                </span>
                            </div>
                        `;
                        detailsDiv.insertAdjacentHTML('beforeend', exceptionsHtml);
                    }
                } else {
                    // Update existing exceptions
                    const exceptionsValue = exceptionsRow.querySelector('.detail-value');
                    if (exceptionsValue) {
                        exceptionsValue.innerHTML = emp.exceptions.map(ex => 
                            `<span style="background: ${ex.exception_code === 'VAUT' ? '#10b981' : ex.exception_code === 'DO' ? '#3b82f6' : '#ef4444'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-right: 4px;">${ex.exception_code}</span>`
                        ).join('');
                    }
                }
            } else if (exceptionsRow && exceptionsRow.querySelector('.detail-label')?.textContent.includes('Exceptions')) {
                // Remove exceptions row if no longer exists
                exceptionsRow.remove();
            }

            // Update employment info
            const employmentValue = card.querySelector('.detail-row:last-child .detail-value');
            if (employmentValue) {
                employmentValue.textContent = `${emp.employment_type || 'N/A'} - ${emp.employment_status || 'active'}`;
            }

            // Update tasks preview - always check and update if needed
            const tasksPreview = card.querySelector('.employee-tasks-preview');
            if (tasksPreview) {
                const formatTaskTime = (timeStr) => {
                    if (!timeStr) return 'N/A';
                    if (timeStr.includes(':')) {
                        return timeStr.substring(0, 5); // HH:MM
                    } else if (timeStr.length === 4) {
                        return timeStr.substring(0, 2) + ':' + timeStr.substring(2, 4);
                    }
                    return timeStr;
                };

                // Check current state
                const taskItems = tasksPreview.querySelectorAll('.task-item-mini');
                const noTasksMsg = tasksPreview.querySelector('.no-tasks');
                const hasTasksInData = emp.tasks && Array.isArray(emp.tasks) && emp.tasks.length > 0;
                const hasTasksInDOM = taskItems.length > 0;

                // Always update if there's a mismatch between data and DOM
                if (hasTasksInData) {
                    const expectedTaskCount = Math.min(emp.tasks.length, 5);
                    const currentTaskCount = taskItems.length;
                    
                    // Update if: showing "no tasks" message, or task count doesn't match
                    if (noTasksMsg || currentTaskCount !== expectedTaskCount) {
                        tasksPreview.innerHTML = `
                            <div class="tasks-section-header">Hourly Tasks:</div>
                            <div class="tasks-list">
                                ${emp.tasks.slice(0, 5).map(task => {
                                    const taskStatusColor = task.status === 'completed' ? '#10b981' : 
                                                          task.status === 'overdue' ? '#ef4444' : 
                                                          task.status === 'in-progress' ? '#3b82f6' : '#64748b';
                                    return `
                                        <div class="task-item-mini">
                                            <span class="task-time">${formatTaskTime(task.start_time)}-${formatTaskTime(task.end_time)}</span>
                                            <span class="task-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span>
                                            <span class="task-status" style="background: ${taskStatusColor}">${task.status}</span>
                                        </div>
                                    `;
                                }).join('')}
                                ${emp.tasks.length > 5 ? `<div class="more-tasks">+${emp.tasks.length - 5} more hourly tasks</div>` : ''}
                            </div>
                        `;
                    }
                } else if (!hasTasksInData && hasTasksInDOM) {
                    // Had tasks in DOM but no tasks in data - update to show "no tasks"
                    tasksPreview.innerHTML = `
                        <div class="tasks-section-header">Hourly Tasks:</div>
                        <div class="no-tasks">No hourly tasks scheduled</div>
                    `;
                } else if (!hasTasksInData && !hasTasksInDOM && !noTasksMsg) {
                    // No tasks in data or DOM, and no message shown - show message
                    tasksPreview.innerHTML = `
                        <div class="tasks-section-header">Hourly Tasks:</div>
                        <div class="no-tasks">No hourly tasks scheduled</div>
                    `;
                }
            } else {
                // Tasks preview doesn't exist - this shouldn't happen, but create it if needed
                const tasksPreviewContainer = card.querySelector('.employee-tasks-preview');
                if (!tasksPreviewContainer) {
                    // This will be handled in the initial render
                }
            }

            // Update screen share (handled separately by updateScreenShares)
        });
    }

    // Store active video streams and peer connections
    const activeStreams = new Map();
    const peerConnections = new Map();
    const videoChunks = new Map(); // Store video chunks for playback

    // Track last seen screen share times to prevent premature hiding
    const lastSeenScreenShares = new Map();

    async function updateScreenShares() {
        if (!allEmployees || allEmployees.length === 0) return;

        try {
            // Get all active screen shares (check last 2 minutes for recent updates)
            // Only fetch what we need for seamless image updates
            const { data: screenShares, error } = await supabaseService.client
                .from('employee_screen_shares')
                .select('employee_id, frame_data, updated_at')
                .gte('updated_at', new Date(Date.now() - 120000).toISOString()); // Last 2 minutes

            if (error) {
                // Table might not exist yet - that's okay
                if (error.code !== 'PGRST116' && error.code !== '42P01') {
                    console.debug('Error fetching screen shares:', error.message);
                }
                // Don't return early - preserve existing previews
            }

            const now = Date.now();
            const activeShareIds = new Set();

            if (screenShares && screenShares.length > 0) {
                // Update last seen times for active shares
                screenShares.forEach(share => {
                    const shareEmpId = typeof share.employee_id === 'number' ? share.employee_id : parseInt(share.employee_id, 10);
                    lastSeenScreenShares.set(shareEmpId, now);
                    activeShareIds.add(shareEmpId);
                });

                // Set up Realtime subscriptions for live video
                screenShares.forEach(share => {
                    const shareEmpId = typeof share.employee_id === 'number' ? share.employee_id : parseInt(share.employee_id, 10);
                    setupLiveStreamSubscription(shareEmpId);
                });

                // Update screen preview and status
                screenShares.forEach(share => {
                const shareEmpId = typeof share.employee_id === 'number' ? share.employee_id : parseInt(share.employee_id, 10);
                
                const employee = allEmployees.find(emp => {
                    const empId = typeof emp.id === 'number' ? emp.id : parseInt(emp.id, 10);
                    return empId === shareEmpId;
                });
                
                if (employee) {
                    employee.screenShare = share;
                    
                    // Recalculate status
                    const now = new Date();
                    const newStatus = calculateEmployeeStatus(
                        employee, 
                        employee.shift, 
                        employee.tasks, 
                        employee.exceptions, 
                        now, 
                        share
                    );
                    
                    if (employee.status.type !== newStatus.type) {
                        employee.status = newStatus;
                        const card = document.querySelector(`.employee-card[data-employee-id="${shareEmpId}"]`);
                        if (card) {
                            const statusBadge = card.querySelector('.status-badge');
                            const statusIndicator = card.querySelector('.employee-status-indicator');
                            if (statusBadge) {
                                statusBadge.textContent = newStatus.label;
                                statusBadge.style.background = newStatus.color;
                            }
                            if (statusIndicator) {
                                statusIndicator.style.background = newStatus.color;
                            }
                        }
                    }
                }
                
                // Create or update video preview
                updateVideoPreview(shareEmpId, share, employee);
                });
            }
            
            // Only hide previews if employee hasn't been seen for more than 2 minutes
            allEmployees.forEach(emp => {
                const empId = typeof emp.id === 'number' ? emp.id : parseInt(emp.id, 10);
                const lastSeen = lastSeenScreenShares.get(empId);
                
                if (!activeShareIds.has(empId)) {
                    // Only hide if we haven't seen them in over 2 minutes
                    if (!lastSeen || (now - lastSeen) > 120000) {
                        hideVideoPreview(empId);
                        lastSeenScreenShares.delete(empId);
                    } else {
                        // Keep showing existing preview even if query didn't return new data
                        // This prevents flickering/disappearing
                        const card = document.querySelector(`.employee-card[data-employee-id="${empId}"]`);
                        if (card) {
                            const screenPreview = card.querySelector('.employee-screen-preview');
                            if (screenPreview) {
                                screenPreview.style.display = 'block';
                            }
                        }
        }
    }

});
        } catch (error) {
            console.debug('Error updating screen shares:', error.message);
        }
    }

    function updateVideoPreview(employeeId, share, employee) {
        const card = document.querySelector(`.employee-card[data-employee-id="${employeeId}"]`);
        if (!card) return;

        let screenPreview = card.querySelector('.employee-screen-preview');
        if (!screenPreview) {
            const tasksPreview = card.querySelector('.employee-tasks-preview');
            if (tasksPreview) {
                screenPreview = document.createElement('div');
                screenPreview.className = 'employee-screen-preview';
                screenPreview.innerHTML = `
                    <div class="screen-preview-header">
                        <span class="screen-label">🖥️ Screen Share</span>
                        <div class="screen-preview-actions">
                            <span class="screen-status live">● Live</span>
                            <button class="fullscreen-btn" 
                                    data-employee-id="${employeeId}" 
                                    title="Fullscreen"
                                    onclick="openScreenShareFullscreen(${employeeId}, '${escapeHtml(employee?.name || 'Employee')}')">
                                ⛶
                            </button>
                        </div>
                    </div>
                    <div class="screen-preview-container">
                        <video autoplay playsinline muted 
                               class="screen-preview-video"
                               data-employee-id="${employeeId}"
                               style="width: 100%; height: auto; max-height: 300px; background: #000;">
                        </video>
                        <img src="" 
                             alt="Screen share fallback" 
                             class="screen-preview-image"
                             data-employee-id="${employeeId}"
                             style="display: none; width: 100%; height: auto; max-height: 300px;">
                    </div>
                `;
                tasksPreview.insertAdjacentElement('afterend', screenPreview);
            }
        }

        if (screenPreview) {
            const video = screenPreview.querySelector(`.screen-preview-video[data-employee-id="${employeeId}"]`);
            const img = screenPreview.querySelector(`.screen-preview-image[data-employee-id="${employeeId}"]`);
            
            // Try to use live video stream first
            if (activeStreams.has(employeeId)) {
                const stream = activeStreams.get(employeeId);
                if (video && video.srcObject !== stream) {
                    video.srcObject = stream;
                    video.style.display = 'block';
                    if (img) img.style.display = 'none';
                    
                    // Also update fullscreen if open
                    const fullscreenOverlay = document.querySelector('.screen-share-fullscreen');
                    if (fullscreenOverlay) {
                        const fullscreenVideo = fullscreenOverlay.querySelector(`.fullscreen-video[data-employee-id="${employeeId}"]`);
                        if (fullscreenVideo) {
                            fullscreenVideo.srcObject = stream;
                            fullscreenVideo.play();
                        }
                    }
                }
            } else if (share && share.frame_data) {
                // Fallback to static image - seamless update with preloading
                if (img) {
                    const newSrc = share.frame_data;
                    
                    // Only update if the frame data actually changed (compare base64 content)
                    const currentSrcBase = img.src.split('?t=')[0];
                    if (currentSrcBase !== newSrc) {
                        // Preload new image before swapping to prevent flickering
                        const newImg = new Image();
                        newImg.onload = () => {
                            // Swap images seamlessly when new one is ready
                            if (img && img.parentElement) {
                                // Direct swap - no fade needed since it's the same image element
                                img.src = newImg.src;
                                
                                // Also update fullscreen if open
                                const fullscreenOverlay = document.querySelector('.screen-share-fullscreen');
                                if (fullscreenOverlay) {
                                    const fullscreenImage = fullscreenOverlay.querySelector(`.fullscreen-image[data-employee-id="${employeeId}"]`);
                                    if (fullscreenImage) {
                                        fullscreenImage.src = newImg.src;
                                    }
                                }
                            }
                        };
                        newImg.onerror = () => {
                            // If new image fails, keep old one visible
                            console.debug('Failed to preload screen share frame');
                        };
                        
                        // Start loading the new image
                        newImg.src = newSrc;
                    }
                    
                    img.style.display = 'block';
                    if (video) video.style.display = 'none';
                }
            } else {
                // No new data, but keep existing image visible if it exists
                if (img && img.src && img.src.startsWith('data:')) {
                    img.style.display = 'block';
                    if (video) video.style.display = 'none';
                }
            }
            
            // Always show preview if we have any data
            if (screenPreview && (share?.frame_data || activeStreams.has(employeeId))) {
                screenPreview.style.display = 'block';
            }
        }
    }

    function hideVideoPreview(employeeId) {
        const card = document.querySelector(`.employee-card[data-employee-id="${employeeId}"]`);
        if (card) {
            const screenPreview = card.querySelector('.employee-screen-preview');
            if (screenPreview) {
                screenPreview.style.display = 'none';
            }
        }
        
        // Clean up stream
        if (activeStreams.has(employeeId)) {
            const stream = activeStreams.get(employeeId);
            stream.getTracks().forEach(track => track.stop());
            activeStreams.delete(employeeId);
        }
        
        // Clean up peer connection
        if (peerConnections.has(employeeId)) {
            const pc = peerConnections.get(employeeId);
            pc.close();
            peerConnections.delete(employeeId);
        }
    }

    function cleanupInactiveStreams() {
        const activeIds = new Set(
            Array.from(document.querySelectorAll('.employee-card[data-employee-id]'))
                .map(card => parseInt(card.getAttribute('data-employee-id'), 10))
        );

        activeStreams.forEach((stream, empId) => {
            if (!activeIds.has(empId)) {
                stream.getTracks().forEach(track => track.stop());
                activeStreams.delete(empId);
            }
        });

        peerConnections.forEach((pc, empId) => {
            if (!activeIds.has(empId)) {
                pc.close();
                peerConnections.delete(empId);
            }
        });
    }

    function setupLiveStreamSubscription(employeeId) {
        if (!supabaseService || !supabaseService.isReady()) return;

        const channelName = `screen-share-${employeeId}`;
        
        // Check if already subscribed
        if (document.querySelector(`[data-channel="${channelName}"]`)) {
            return;
        }

        const channel = supabaseService.client.channel(channelName);

        // Note: Video chunks via Realtime are disabled - using WebRTC and fallback frames instead

        // Listen for WebRTC signals
        channel.on('broadcast', { event: 'signal' }, async (payload) => {
            const signal = payload.payload;
            if (signal.employee_id === employeeId) {
                await handleWebRTCSignal(employeeId, signal);
            }
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`Subscribed to live stream for employee ${employeeId}`);
            }
        });

        // Mark channel as subscribed
        const card = document.querySelector(`.employee-card[data-employee-id="${employeeId}"]`);
        if (card) {
            card.setAttribute('data-channel', channelName);
        }
    }


    async function handleWebRTCSignal(employeeId, signal) {
        try {
            if (signal.type === 'offer') {
                // Create answer
                const pc = new RTCPeerConnection({
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                });

                peerConnections.set(employeeId, pc);

                pc.ontrack = (event) => {
                    const stream = event.streams[0];
                    activeStreams.set(employeeId, stream);
                    updateVideoPreview(employeeId, { frame_data: null }, null);
                };

                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        // Send answer back via channel
                        const channel = supabaseService.client.channel(`screen-share-${employeeId}`);
                        channel.send({
                            type: 'broadcast',
                            event: 'signal',
                            payload: {
                                type: 'ice-candidate',
                                candidate: event.candidate,
                                employee_id: employeeId
                            }
                        });
                    }
                };

                await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                // Send answer
                const channel = supabaseService.client.channel(`screen-share-${employeeId}`);
                channel.send({
                    type: 'broadcast',
                    event: 'signal',
                    payload: {
                        type: 'answer',
                        answer: answer,
                        employee_id: employeeId
                    }
                });
            } else if (signal.type === 'ice-candidate' && signal.candidate) {
                const pc = peerConnections.get(employeeId);
                if (pc) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                }
            }
        } catch (error) {
            console.debug('Error handling WebRTC signal:', error);
        }
    }

    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    function updateLiveIndicator() {
        const indicator = document.getElementById('liveIndicator');
        indicator.classList.add('pulse');
        setTimeout(() => {
            indicator.classList.remove('pulse');
        }, 500);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Fullscreen screen share functionality
    window.openScreenShareFullscreen = function(employeeId, employeeName) {
        const card = document.querySelector(`.employee-card[data-employee-id="${employeeId}"]`);
        if (!card) return;

        const video = card.querySelector(`.screen-preview-video[data-employee-id="${employeeId}"]`);
        const img = card.querySelector(`.screen-preview-image[data-employee-id="${employeeId}"]`);
        
        // Check if we have a video stream or image
        const hasVideo = video && video.srcObject;
        const hasImage = img && img.src && img.style.display !== 'none';

        if (!hasVideo && !hasImage) {
            console.log('No screen share available for fullscreen');
            return;
        }

        // Create fullscreen overlay
        const fullscreenOverlay = document.createElement('div');
        fullscreenOverlay.className = 'screen-share-fullscreen';
        fullscreenOverlay.innerHTML = `
            <div class="fullscreen-header">
                <div class="fullscreen-title">
                    <span class="fullscreen-label">🖥️ ${escapeHtml(employeeName)} - Screen Share</span>
                    <span class="fullscreen-status live">● Live</span>
                </div>
                <button class="fullscreen-close-btn" onclick="closeScreenShareFullscreen()" title="Close (ESC)">
                    ✕
                </button>
            </div>
            <div class="fullscreen-content">
                ${hasVideo ? `
                    <video autoplay playsinline muted 
                           class="fullscreen-video"
                           data-employee-id="${employeeId}">
                    </video>
                ` : `
                    <img src="" 
                         alt="Screen share for ${escapeHtml(employeeName)}" 
                         class="fullscreen-image"
                         data-employee-id="${employeeId}">
                `}
            </div>
        `;

        document.body.appendChild(fullscreenOverlay);

        // Set up the content
        if (hasVideo) {
            const fullscreenVideo = fullscreenOverlay.querySelector('.fullscreen-video');
            fullscreenVideo.srcObject = video.srcObject;
            fullscreenVideo.play();
        } else if (hasImage) {
            const fullscreenImage = fullscreenOverlay.querySelector('.fullscreen-image');
            fullscreenImage.src = img.src;
        }

        // Update fullscreen content when screen share updates
        const updateFullscreenContent = () => {
            if (!document.body.contains(fullscreenOverlay)) return;

            const card = document.querySelector(`.employee-card[data-employee-id="${employeeId}"]`);
            if (!card) {
                closeScreenShareFullscreen();
                return;
            }

            const video = card.querySelector(`.screen-preview-video[data-employee-id="${employeeId}"]`);
            const img = card.querySelector(`.screen-preview-image[data-employee-id="${employeeId}"]`);
            
            if (hasVideo && video && video.srcObject) {
                const fullscreenVideo = fullscreenOverlay.querySelector('.fullscreen-video');
                if (fullscreenVideo && fullscreenVideo.srcObject !== video.srcObject) {
                    fullscreenVideo.srcObject = video.srcObject;
                }
            } else if (hasImage && img && img.src) {
                const fullscreenImage = fullscreenOverlay.querySelector('.fullscreen-image');
                if (fullscreenImage && fullscreenImage.src !== img.src) {
                    fullscreenImage.src = img.src;
                }
            }
        };

        // Update fullscreen content periodically
        const fullscreenUpdateInterval = setInterval(updateFullscreenContent, 1000);

        // Store interval ID for cleanup
        fullscreenOverlay.dataset.updateInterval = fullscreenUpdateInterval;

        // Close on ESC key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeScreenShareFullscreen();
            }
        };
        document.addEventListener('keydown', escHandler);
        fullscreenOverlay.dataset.escHandler = 'true';

        // Fade in
        setTimeout(() => {
            fullscreenOverlay.classList.add('active');
        }, 10);
    };

    window.closeScreenShareFullscreen = function() {
        const fullscreenOverlay = document.querySelector('.screen-share-fullscreen');
        if (!fullscreenOverlay) return;

        // Clear update interval
        const intervalId = fullscreenOverlay.dataset.updateInterval;
        if (intervalId) {
            clearInterval(parseInt(intervalId, 10));
        }

        // Remove ESC handler
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeScreenShareFullscreen();
            }
        };
        document.removeEventListener('keydown', escHandler);

        // Fade out and remove
        fullscreenOverlay.classList.remove('active');
        setTimeout(() => {
            if (fullscreenOverlay.parentElement) {
                fullscreenOverlay.parentElement.removeChild(fullscreenOverlay);
            }
        }, 300);
    };

    // Initialize
    /**
     * Punish employee - Force logout with womp womp screen
     * Temporarily sets employee status to 'suspended' which triggers the womp womp logout
     */
    // Lockdown employee - Force their browser into lockdown mode
    window.lockdownEmployee = async function(employeeId, employeeName) {
        if (!confirm(`🔒 Are you sure you want to LOCKDOWN ${employeeName}'s browser?\n\nThis will:\n- Force their browser to fullscreen\n- Keep it always on top\n- Prevent minimizing/closing\n- Block access to other applications\n\nThey will NOT be able to escape until you release the lockdown.`)) {
            return;
        }
        
        try {
            console.log(`🔒 Locking down employee ${employeeId} (${employeeName})...`);
            
            // Get the employee's user_id (which references public.users.id)
            const { data: employee, error: empError } = await supabaseService.client
                .from('employees')
                .select('user_id')
                .eq('id', employeeId)
                .single();
            
            if (empError || !employee || !employee.user_id) {
                console.error('❌ Error finding employee:', empError);
                alert(`❌ Could not find employee user ID. ${empError ? empError.message : ''}`);
                return;
            }
            
            // Get the auth_id from the users table (browser_instances.user_id references auth.users.id)
            const { data: userData, error: userError } = await supabaseService.client
                .from('users')
                .select('auth_id')
                .eq('id', employee.user_id)
                .single();
            
            if (userError || !userData || !userData.auth_id) {
                console.error('❌ Error finding user auth_id:', userError);
                alert(`❌ Could not find user's auth ID. ${userError ? userError.message : 'The employee may not have a linked auth account.'}`);
                return;
            }
            
            const authUserId = userData.auth_id;
            console.log(`🔍 Looking for browser instance with auth user_id: ${authUserId} (employee user_id: ${employee.user_id})`);
            
            // First, try to find active instances
            let { data: browserInstances, error: instanceError } = await supabaseService.client
                .from('browser_instances')
                .select('instance_id, last_seen, hostname, user_id, is_active')
                .eq('user_id', authUserId) // browser_instances.user_id references auth.users.id
                .eq('is_active', true)
                .order('last_seen', { ascending: false })
                .limit(1);
            
            if (instanceError) {
                console.error('❌ Error finding browser instance:', instanceError);
                console.error('Full error details:', JSON.stringify(instanceError, null, 2));
                alert(`❌ Error finding browser instance: ${instanceError.message}\n\nThis may be a permissions issue. Please check RLS policies.\n\nError code: ${instanceError.code || 'unknown'}`);
                return;
            }
            
            console.log(`🔍 Query result: Found ${browserInstances?.length || 0} active instances`);
            
            // If no active instances found, try without is_active filter (maybe it's false but still usable)
            if (!browserInstances || browserInstances.length === 0) {
                console.log('⚠️ No active instances found, checking all instances for this user...');
                const { data: allInstances, error: allError } = await supabaseService.client
                    .from('browser_instances')
                    .select('instance_id, last_seen, hostname, user_id, is_active')
                    .eq('user_id', authUserId)
                    .order('last_seen', { ascending: false })
                    .limit(1);
                
                if (!allError && allInstances && allInstances.length > 0) {
                    console.log(`ℹ️ Found inactive instance: ${allInstances[0].instance_id}, is_active: ${allInstances[0].is_active}`);
                    browserInstances = allInstances;
                } else {
                    // Debug: Let's see if there are ANY instances with this user_id
                    const { data: debugInstances, error: debugError } = await supabaseService.client
                        .from('browser_instances')
                        .select('instance_id, user_id, is_active, last_seen, hostname')
                        .eq('user_id', authUserId)
                        .limit(10);
                    
                    console.log(`🔍 Debug: Found ${debugInstances?.length || 0} total instances for auth user_id ${authUserId}:`, debugInstances);
                    if (debugError) {
                        console.error('❌ Debug query error:', debugError);
                    }
                    
                    // Also check if there are any instances with NULL user_id (maybe they're not linked yet)
                    const { data: nullInstances, error: nullError } = await supabaseService.client
                        .from('browser_instances')
                        .select('instance_id, user_id, is_active, last_seen, hostname, serial_code')
                        .is('user_id', null)
                        .eq('is_active', true)
                        .order('last_seen', { ascending: false })
                        .limit(5);
                    
                    console.log(`🔍 Debug: Found ${nullInstances?.length || 0} instances with NULL user_id (not linked):`, nullInstances);
                    if (nullError) {
                        console.error('❌ Null instances query error:', nullError);
                    }
                    
                    // Show detailed error message
                    const errorDetails = `Could not find browser instance for ${employeeName}.\n\n` +
                        `Auth User ID: ${authUserId}\n` +
                        `Employee User ID: ${employee.user_id}\n\n` +
                        `Found ${debugInstances?.length || 0} instances linked to this user.\n` +
                        `Found ${nullInstances?.length || 0} unlinked instances.\n\n` +
                        `Possible causes:\n` +
                        `- The employee hasn't logged in yet in the WaterROC Secure Browser\n` +
                        `- The browser instance registration failed\n` +
                        `- The browser instance wasn't linked to the user account\n\n` +
                        `Ask the employee to:\n` +
                        `1. Open the WaterROC Secure Browser\n` +
                        `2. Log in to their account\n` +
                        `3. Wait a few seconds for the instance to register\n` +
                        `4. Then try locking down again`;
                    
                    console.error('❌ ' + errorDetails);
                    alert(errorDetails);
                    return;
                }
            }
            
            // Update browser instance with lockdown flag
            if (browserInstances && browserInstances.length > 0) {
                const instance = browserInstances[0];
                const instanceId = instance.instance_id;
                
                console.log(`🔒 Locking down instance ${instanceId} (hostname: ${instance.hostname || 'unknown'}, auth user_id: ${instance.user_id})`);
                
                // Update using Supabase properly
                const { data: updateData, error: updateError } = await supabaseService.client
                    .from('browser_instances')
                    .update({ 
                        lockdown_enabled: true,
                        updated_at: new Date().toISOString()
                    })
                    .eq('instance_id', instanceId)
                    .select('instance_id, lockdown_enabled, updated_at');
                
                if (updateError) {
                    console.error('❌ Error updating browser_instances for lockdown:', updateError);
                    alert(`❌ Error: Could not set lockdown. ${updateError.message}\n\nPossible causes:\n- Missing 'lockdown_enabled' column (run the SQL schema)\n- RLS policy blocking update\n- Instance not found`);
                    return;
                }
                
                if (updateData && updateData.length > 0) {
                    console.log(`✅ Successfully set lockdown_enabled=true for instance: ${instanceId}`, updateData[0]);
                    console.log(`   Lockdown enabled: ${updateData[0].lockdown_enabled}`);
                    console.log(`   Updated at: ${updateData[0].updated_at}`);
                } else {
                    console.warn('⚠️ Update returned no data - check if update actually worked');
                }
            } else {
                alert(`⚠️ Could not find active browser instance for ${employeeName}.\n\nPossible reasons:\n- They are not logged in\n- They are not using the WaterROC Secure Browser\n- Their browser instance hasn't registered yet\n\nAsk them to log in using the WaterROC Secure Browser application.`);
                return;
            }
            
            // Store lockdown state in a way the browser can check
            // Alternative: Use a dedicated table or add column to employee_profiles
            // For now, we'll use a simple metadata approach
            
            alert(`✅ Lockdown command sent to ${employeeName}'s browser.\n\nThe browser will enter lockdown mode within a few seconds.`);
            
            console.log(`✅ Lockdown command processed for ${employeeName}`);
        } catch (error) {
            console.error('Error locking down employee:', error);
            alert('❌ Error locking down employee: ' + (error.message || 'Unknown error'));
        }
    };
    
    // Release lockdown
    window.releaseLockdown = async function(employeeId, employeeName) {
        try {
            console.log(`🔓 Releasing lockdown for employee ${employeeId} (${employeeName})...`);
            
            // Get the employee's user_id (which references public.users.id)
            const { data: employee, error: empError } = await supabaseService.client
                .from('employees')
                .select('user_id')
                .eq('id', employeeId)
                .single();
            
            if (empError || !employee || !employee.user_id) {
                console.error('❌ Error finding employee:', empError);
                alert(`❌ Could not find employee user ID. ${empError ? empError.message : ''}`);
                return;
            }
            
            // Get the auth_id from the users table (browser_instances.user_id references auth.users.id)
            const { data: userData, error: userError } = await supabaseService.client
                .from('users')
                .select('auth_id')
                .eq('id', employee.user_id)
                .single();
            
            if (userError || !userData || !userData.auth_id) {
                console.error('❌ Error finding user auth_id:', userError);
                alert(`❌ Could not find user's auth ID. ${userError ? userError.message : 'The employee may not have a linked auth account.'}`);
                return;
            }
            
            const authUserId = userData.auth_id;
            console.log(`🔍 Looking for browser instance with auth user_id: ${authUserId} (employee user_id: ${employee.user_id})`);
            
            // Find the most recent active browser instance
            const { data: browserInstances, error: findError } = await supabaseService.client
                .from('browser_instances')
                .select('instance_id, last_seen')
                .eq('user_id', authUserId) // browser_instances.user_id references auth.users.id
                .eq('is_active', true)
                .order('last_seen', { ascending: false })
                .limit(1);
            
            if (findError) {
                console.error('❌ Error finding browser instance for release:', findError);
                alert('❌ Error finding browser instance: ' + findError.message);
                return;
            }
            
            if (browserInstances && browserInstances.length > 0) {
                const instanceId = browserInstances[0].instance_id;
                
                const { data: updateData, error: updateError } = await supabaseService.client
                    .from('browser_instances')
                    .update({ 
                        lockdown_enabled: false,
                        updated_at: new Date().toISOString()
                    })
                    .eq('instance_id', instanceId)
                    .select('instance_id, lockdown_enabled, updated_at');
                
                if (updateError) {
                    console.error('❌ Error releasing lockdown:', updateError);
                    alert('❌ Error releasing lockdown: ' + updateError.message);
                    return;
                }
                
                if (updateData && updateData.length > 0) {
                    console.log(`✅ Successfully released lockdown for instance: ${instanceId}`, updateData[0]);
                    alert(`✅ Lockdown released for ${employeeName}'s browser.`);
                }
            } else {
                console.warn('⚠️ No active browser instance found to release lockdown');
                alert(`⚠️ Could not find active browser instance for ${employeeName}.`);
            }
            
            alert(`✅ Lockdown released for ${employeeName}`);
            await loadEmployeeData(false); // Refresh to update UI
        } catch (error) {
            console.error('Error releasing lockdown:', error);
            alert('❌ Error releasing lockdown: ' + (error.message || 'Unknown error'));
        }
    };
    
    window.punishEmployee = async function(employeeId, employeeName) {
        if (!confirm(`⚠️ Are you sure you want to punish ${employeeName}?\n\nThis will force them to logout with the womp womp screen.`)) {
            return;
        }
        
        try {
            console.log(`👢 Punishing employee ${employeeId} (${employeeName})...`);
            
            // Get current profile to save the original status
            const { data: currentProfile } = await supabaseService.client
                .from('employee_profiles')
                .select('employment_status')
                .eq('employee_id', employeeId)
                .maybeSingle();
            
            const originalStatus = currentProfile?.employment_status || 'active';
            
            // Get current admin's employee ID for status_changed_by (must be bigint, not UUID)
            let changedByEmployeeId = null;
            try {
                const currentAdminEmployee = await supabaseService.getCurrentEmployee();
                if (currentAdminEmployee && currentAdminEmployee.id) {
                    changedByEmployeeId = currentAdminEmployee.id;
                }
            } catch (e) {
                console.warn('Could not get current admin employee ID:', e);
                // Continue without status_changed_by if admin doesn't have employee record
            }
            
            // Temporarily set status to 'suspended' to trigger womp womp logout
            const updateData = {
                employment_status: 'suspended',
                status_changed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            // Only add status_changed_by if we have an employee ID (bigint, not UUID)
            if (changedByEmployeeId) {
                updateData.status_changed_by = changedByEmployeeId;
            }
            
            // Try to update first (if profile exists)
            const { data: updatedProfile, error: updateError } = await supabaseService.client
                .from('employee_profiles')
                .update(updateData)
                .eq('employee_id', employeeId)
                .select();
            
            // Check if update was successful
            if (updateError) {
                console.error('Error updating employee profile:', updateError);
                throw new Error(`Failed to update employee status: ${updateError.message}`);
            }
            
            // If update didn't find a record (empty result), insert a new one
            if (!updatedProfile || updatedProfile.length === 0) {
                const insertData = {
                    employee_id: employeeId,
                    employment_status: 'suspended',
                    status_changed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                if (changedByEmployeeId) {
                    insertData.status_changed_by = changedByEmployeeId;
                }
                
                const { data: insertedProfile, error: insertError } = await supabaseService.client
                    .from('employee_profiles')
                    .insert(insertData)
                    .select()
                    .single();
                
                if (insertError) {
                    console.error('Error inserting employee profile:', insertError);
                    throw new Error(`Failed to create employee profile: ${insertError.message}`);
                }
                
                if (!insertedProfile) {
                    throw new Error('Failed to insert employee profile - no data returned');
                }
            }
            
            console.log(`✅ Employee ${employeeName} has been punished! They will see the womp womp screen and be logged out.`);
            
            // Show success message
            const card = document.querySelector(`.employee-card[data-employee-id="${employeeId}"]`);
            if (card) {
                const punishBtn = card.querySelector('.punish-btn');
                if (punishBtn) {
                    const originalText = punishBtn.textContent;
                    punishBtn.textContent = '✅ Punished!';
                    punishBtn.disabled = true;
                    punishBtn.style.background = '#10b981';
                    
                    // Restore button after 3 seconds
                    setTimeout(() => {
                        punishBtn.textContent = originalText;
                        punishBtn.disabled = false;
                        punishBtn.style.background = '';
                    }, 3000);
                }
            }
            
            // Optionally restore status after a delay (or leave it for admin to manually restore)
            // Uncomment the following if you want to auto-restore after 30 seconds:
            /*
            setTimeout(async () => {
                await supabaseService.client
                    .from('employee_profiles')
                    .update({
                        employment_status: originalStatus,
                        status_changed_at: new Date().toISOString()
                    })
                    .eq('employee_id', employeeId);
                console.log(`✅ Restored ${employeeName} to ${originalStatus} status`);
            }, 30000); // 30 seconds
            */
            
        } catch (error) {
            console.error('Error punishing employee:', error);
            alert('❌ Error punishing employee. Please try again.');
        }
    };

    init();
});


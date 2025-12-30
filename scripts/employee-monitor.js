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

            const today = new Date().toISOString().split('T')[0];
            const now = new Date();

            // Load additional data for each employee
            const newEmployeeData = await Promise.all(employees.map(async (emp) => {
                try {
                    // Get today's shift
                    const shifts = await supabaseService.getEmployeeShifts(today, today, emp.id);
                    const todayShift = shifts && shifts.length > 0 ? shifts[0] : null;

                    // Get today's tasks
                    const tasks = await supabaseService.getHourlyTasks(today, today, emp.id) || [];

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
                            .single();
                        
                        if (!error && screenShare) {
                            // Check if screen share is recent (within last minute)
                            const shareTime = new Date(screenShare.updated_at);
                            const timeDiff = now - shareTime;
                            if (timeDiff < 60000) { // 1 minute
                                screenShareData = screenShare;
                            }
                        }
                    } catch (error) {
                        // Screen share not found or error - that's okay
                    }

                    // Calculate status
                    const status = calculateEmployeeStatus(emp, todayShift, tasks, exceptions, now);

                    return {
                        ...emp,
                        shift: todayShift,
                        tasks: tasks,
                        exceptions: exceptions,
                        screenShare: screenShareData,
                        status: status
                    };
                } catch (error) {
                    console.error(`Error loading data for employee ${emp.id}:`, error);
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

    function calculateEmployeeStatus(employee, shift, tasks, exceptions, now) {
        // Check employment status
        if (employee.employment_status === 'terminated' || employee.employment_status === 'administrative_leave') {
            return {
                type: 'inactive',
                label: employee.employment_status === 'terminated' ? 'Terminated' : 'Admin Leave',
                color: '#ef4444'
            };
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
            const shiftInfo = emp.shift 
                ? `${emp.shift.start_time.substring(0,5)} - ${emp.shift.end_time.substring(0,5)}`
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
                            <span class="detail-label">📋 Tasks:</span>
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
                        ${emp.tasks && emp.tasks.length > 0 ? `
                            <div class="tasks-list">
                                ${emp.tasks.slice(0, 3).map(task => {
                                    const taskStatusColor = task.status === 'completed' ? '#10b981' : 
                                                          task.status === 'overdue' ? '#ef4444' : 
                                                          task.status === 'in-progress' ? '#3b82f6' : '#64748b';
                                    return `
                                        <div class="task-item-mini">
                                            <span class="task-time">${task.start_time.substring(0,5)}-${task.end_time.substring(0,5)}</span>
                                            <span class="task-name">${escapeHtml(task.name)}</span>
                                            <span class="task-status" style="background: ${taskStatusColor}">${task.status}</span>
                                        </div>
                                    `;
                                }).join('')}
                                ${emp.tasks.length > 3 ? `<div class="more-tasks">+${emp.tasks.length - 3} more tasks</div>` : ''}
                            </div>
                        ` : '<div class="no-tasks">No tasks scheduled</div>'}
                    </div>

                    ${emp.screenShare && emp.screenShare.frame_data ? `
                        <div class="employee-screen-preview">
                            <div class="screen-preview-header">
                                <span class="screen-label">🖥️ Screen Share</span>
                                <span class="screen-status live">● Live</span>
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
        setInterval(updateScreenShares, 2000);
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
                const shiftInfo = emp.shift 
                    ? `${emp.shift.start_time.substring(0,5)} - ${emp.shift.end_time.substring(0,5)}`
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

            // Update tasks preview (only if structure changed significantly)
            const tasksPreview = card.querySelector('.employee-tasks-preview');
            if (tasksPreview && emp.tasks && emp.tasks.length > 0) {
                const taskItems = tasksPreview.querySelectorAll('.task-item-mini');
                if (taskItems.length !== Math.min(emp.tasks.length, 3)) {
                    // Task count changed, re-render tasks section
                    const taskCount = emp.tasks.length;
                    const completedTasks = emp.tasks.filter(t => t.status === 'completed').length;
                    const pendingTasks = emp.tasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length;
                    const overdueTasks = emp.tasks.filter(t => t.status === 'overdue').length;
                    
                    tasksPreview.innerHTML = `
                        <div class="tasks-list">
                            ${emp.tasks.slice(0, 3).map(task => {
                                const taskStatusColor = task.status === 'completed' ? '#10b981' : 
                                                      task.status === 'overdue' ? '#ef4444' : 
                                                      task.status === 'in-progress' ? '#3b82f6' : '#64748b';
                                return `
                                    <div class="task-item-mini">
                                        <span class="task-time">${task.start_time.substring(0,5)}-${task.end_time.substring(0,5)}</span>
                                        <span class="task-name">${escapeHtml(task.name)}</span>
                                        <span class="task-status" style="background: ${taskStatusColor}">${task.status}</span>
                                    </div>
                                `;
                            }).join('')}
                            ${emp.tasks.length > 3 ? `<div class="more-tasks">+${emp.tasks.length - 3} more tasks</div>` : ''}
                        </div>
                    `;
                }
            }

            // Update screen share (handled separately by updateScreenShares)
        });
    }

    async function updateScreenShares() {
        if (!allEmployees || allEmployees.length === 0) return;

        try {
            // Get all active screen shares
            const { data: screenShares, error } = await supabaseService.client
                .from('employee_screen_shares')
                .select('employee_id, frame_data, updated_at')
                .gte('updated_at', new Date(Date.now() - 60000).toISOString()); // Only get recent (last minute)

            if (error) {
                console.error('Error fetching screen shares:', error);
                return;
            }

            if (!screenShares || screenShares.length === 0) return;

            // Update screen preview images
            screenShares.forEach(share => {
                const img = document.querySelector(`.screen-preview-image[data-employee-id="${share.employee_id}"]`);
                if (img && share.frame_data) {
                    img.src = share.frame_data + '?t=' + Date.now(); // Cache bust
                }
            });
        } catch (error) {
            console.error('Error updating screen shares:', error);
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

    // Initialize
    init();
});


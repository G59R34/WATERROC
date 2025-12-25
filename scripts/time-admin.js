// Admin script to view time clocks and recent activity logs
// Requires `supabaseService` and admin session

document.addEventListener('DOMContentLoaded', async () => {
    // Wait a bit for Supabase to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Create a floating button to open admin time panel
    const btn = document.createElement('button');
    btn.id = 'attendanceBtn';
    btn.innerHTML = '<span style="font-size: 18px; margin-right: 6px;">🕒</span>Attendance';
    btn.className = 'attendance-floating-btn';
    btn.style.cssText = `
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 99999;
        padding: 14px 20px;
        border: none;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 140px;
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
    `;
    
    // Add hover effect
    btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.4)';
    });
    
    btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
    });
    
    document.body.appendChild(btn);
    
    // Update button status periodically
    function updateButtonStatus() {
        // Check both window.supabaseService and global supabaseService
        const service = window.supabaseService || (typeof supabaseService !== 'undefined' ? supabaseService : null);
        if (service && service.isReady()) {
            btn.innerHTML = '<span style="font-size: 18px; margin-right: 6px;">🕒</span>Attendance';
            btn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            btn.style.opacity = '1';
        } else {
            btn.innerHTML = '<span style="font-size: 18px; margin-right: 6px;">⏳</span>Attendance (Not Ready)';
            btn.style.background = 'linear-gradient(135deg, #64748b 0%, #475569 100%)';
            btn.style.opacity = '0.8';
        }
    }
    
    // Check status initially and periodically
    updateButtonStatus();
    const statusInterval = setInterval(() => {
        updateButtonStatus();
    }, 2000);
    
    // Clear interval when page unloads
    window.addEventListener('beforeunload', () => {
        clearInterval(statusInterval);
    });

    const panel = document.createElement('div');
    panel.id = 'attendancePanel';
    panel.className = 'attendance-panel';
    document.body.appendChild(panel);

    btn.addEventListener('click', async () => {
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            panel.innerHTML = '<h3 class="attendance-panel-title">Attendance</h3><div id="attendanceContent">Loading...</div>';
            await loadAttendance(panel.querySelector('#attendanceContent'));
        } else {
            panel.style.display = 'none';
        }
    });

    async function loadAttendance(container) {
        // Check both window.supabaseService and global supabaseService
        const service = window.supabaseService || (typeof supabaseService !== 'undefined' ? supabaseService : null);
        if (!service || !service.isReady()) {
            container.innerHTML = '<div class="muted">Supabase not ready</div>';
            return;
        }
        container.innerHTML = '<div>Loading latest sessions...</div>';

        try {
            // Fetch latest sessions
            const { data: sessions, error: sErr } = await service.client
                .from('time_clocks')
                .select('id, employee_id, session_id, clock_in, clock_out, device_info, employee:employee_id (id, name)')
                .order('clock_in', { ascending: false })
                .limit(30);
            if (sErr) throw sErr;

            // Fetch employee names for display
            // Build a simple map of employee id -> name from the joined employee payload where available
            let employeesById = {};
            (sessions || []).forEach(s => {
                if (s.employee && s.employee.id) employeesById[s.employee.id] = s.employee.name || '';
            });

            const { data: activities, error: aErr } = await service.client
                .from('activity_logs')
                .select('id, employee_id, recorded_at, category, detail, idle_seconds, employee:employee_id (id, name)')
                .order('recorded_at', { ascending: false })
                .limit(50);
            if (aErr) throw aErr;

            let html = '<h4 class="attendance-section-title">Recent Sessions</h4>';
            if (!sessions || sessions.length === 0) {
                html += '<div class="attendance-empty">No sessions found</div>';
            } else {
                html += '<ul class="attendance-list">' + sessions.map(s => `
                    <li class="attendance-item">
                        <strong>Employee:</strong> ${employeesById[s.employee_id] || s.employee_id} <br>
                        <strong>In:</strong> ${s.clock_in ? new Date(s.clock_in).toLocaleString() : '-'} <br>
                        <strong>Out:</strong> ${s.clock_out ? new Date(s.clock_out).toLocaleString() : 'IN'} <br>
                        <small class="attendance-device-info">${s.device_info || ''}</small>
                    </li>
                `).join('') + '</ul>';
            }

            html += '<h4 class="attendance-section-title">Recent Activity</h4>';
            if (!activities || activities.length === 0) {
                html += '<div class="attendance-empty">No activity logs</div>';
            } else {
                html += '<ul class="attendance-list">' + activities.map(a => `
                    <li class="attendance-item">
                        <strong>Employee:</strong> ${ (a.employee && a.employee.name) || employeesById[a.employee_id] || a.employee_id } <br>
                        <strong>${a.category}</strong> at ${new Date(a.recorded_at).toLocaleString()}<br>
                        <small class="attendance-device-info">${a.detail ? a.detail.substring(0,180) : ''}</small>
                    </li>
                `).join('') + '</ul>';
            }

            container.innerHTML = html;
        } catch (error) {
            console.error('Error loading attendance', error);
            container.innerHTML = '<div class="text-danger">Failed to load</div>';
        }
    }

    // Shift Scheduling modal handlers
    const manageShiftsBtn = document.getElementById('manageShiftsBtn');
    const shiftModal = document.getElementById('shiftSchedulingModal');
    const closeShiftBtn = document.getElementById('closeShiftScheduling');
    if (manageShiftsBtn && shiftModal) {
        manageShiftsBtn.addEventListener('click', async () => {
            shiftModal.style.display = 'block';
            const container = document.getElementById('attendanceByEmployee');
            if (container) container.innerHTML = 'Loading...';
            await loadAttendanceByEmployee(container);
        });

        // Close handlers
        shiftModal.querySelectorAll('.close').forEach(el => el.addEventListener('click', () => shiftModal.style.display = 'none'));
        if (closeShiftBtn) closeShiftBtn.addEventListener('click', () => shiftModal.style.display = 'none');
    }
    
    // Load attendance grouped by employee and render a table per employee
    async function loadAttendanceByEmployee(container) {
        // Check both window.supabaseService and global supabaseService
        const service = window.supabaseService || (typeof supabaseService !== 'undefined' ? supabaseService : null);
        if (!service || !service.isReady()) {
            container.innerHTML = '<div class="muted">Supabase not ready</div>';
            return;
        }
        console.log('[time-admin] loadAttendanceByEmployee: started');
        container.innerHTML = '<div>Loading attendance by employee...</div>';

        try {
            const { data: sessions, error } = await service.client
                .from('time_clocks')
                .select('id, employee_id, session_id, clock_in, clock_out, device_info, employee:employee_id (id, name)')
                .order('employee_id', { ascending: true })
                .order('clock_in', { ascending: false })
                .limit(500);
            if (error) throw error;

            console.log('[time-admin] sessions fetched:', Array.isArray(sessions) ? sessions.length : 0);
            if (sessions && sessions.length > 0) console.debug('[time-admin] sample session:', sessions[0]);

            let employeesById = {};
            (sessions || []).forEach(s => {
                if (s.employee && s.employee.id) employeesById[s.employee.id] = s.employee.name || '';
            });

            const grouped = {};
            (sessions || []).forEach(s => {
                const key = s.employee_id || 'unknown';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(s);
            });

            const employeeIds = Object.keys(grouped);
            let html = '<h4 class="attendance-section-title">Attendance By Employee</h4>';
            html += `<div class="attendance-summary">Loaded ${sessions ? sessions.length : 0} sessions for ${employeeIds.length} employees</div>`;
            if (!sessions || sessions.length === 0) {
                html += '<div class="attendance-empty">No sessions found</div>';
            } else {
                for (const empId of Object.keys(grouped)) {
                    const rows = grouped[empId].map(s => `
                        <tr>
                            <td>${s.session_id}</td>
                            <td>${s.clock_in ? new Date(s.clock_in).toLocaleString() : '-'}</td>
                            <td>${s.clock_out ? new Date(s.clock_out).toLocaleString() : 'IN'}</td>
                            <td>${s.device_info || ''}</td>
                        </tr>
                    `).join('');

                    const displayName = employeesById[empId] || empId;
                    html += `
                        <div class="attendance-employee-group">
                            <h4 class="attendance-employee-name">${displayName} (ID: ${empId})</h4>
                            <table class="attendance-table">
                                <thead>
                                    <tr><th>Session</th><th>Clock In</th><th>Clock Out</th><th>Device</th></tr>
                                </thead>
                                <tbody>
                                    ${rows}
                                </tbody>
                            </table>
                        </div>
                    `;
                }
            }

            container.innerHTML = html;
        } catch (err) {
            console.error('Failed to load attendance by employee', err);
            container.innerHTML = '<div class="text-danger">Failed to load attendance</div>';
        }
    }
});

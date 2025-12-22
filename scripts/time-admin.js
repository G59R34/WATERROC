// Admin script to view time clocks and recent activity logs
// Requires `supabaseService` and admin session

document.addEventListener('DOMContentLoaded', async () => {
    // Create a floating button to open admin time panel
    const btn = document.createElement('button');
    btn.textContent = 'Attendance';
    btn.className = 'btn-warning';
    btn.style.position = 'fixed';
    btn.style.right = '20px';
    btn.style.bottom = '20px';
    btn.style.zIndex = 99999;
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.style.position = 'fixed';
    panel.style.right = '20px';
    panel.style.bottom = '70px';
    panel.style.width = '420px';
    panel.style.maxHeight = '70vh';
    panel.style.overflowY = 'auto';
    panel.style.background = 'white';
    panel.style.border = '1px solid #ddd';
    panel.style.padding = '12px';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
    panel.style.zIndex = 99999;
    panel.style.display = 'none';
    document.body.appendChild(panel);

    btn.addEventListener('click', async () => {
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            panel.innerHTML = '<h3 style="margin-top:0">Attendance</h3><div id="attendanceContent">Loading...</div>';
            await loadAttendance(panel.querySelector('#attendanceContent'));
        } else {
            panel.style.display = 'none';
        }
    });

    async function loadAttendance(container) {
        if (!window.supabaseService || !window.supabaseService.isReady()) {
            container.innerHTML = '<div class="muted">Supabase not ready</div>';
            return;
        }
        container.innerHTML = '<div>Loading latest sessions...</div>';

        try {
            // Fetch latest sessions
            const { data: sessions, error: sErr } = await window.supabaseService.client
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

            const { data: activities, error: aErr } = await window.supabaseService.client
                .from('activity_logs')
                .select('id, employee_id, recorded_at, category, detail, idle_seconds, employee:employee_id (id, name)')
                .order('recorded_at', { ascending: false })
                .limit(50);
            if (aErr) throw aErr;

            let html = '<h4>Recent Sessions</h4>';
            if (!sessions || sessions.length === 0) {
                html += '<div>No sessions found</div>';
            } else {
                html += '<ul>' + sessions.map(s => `
                    <li style="margin-bottom:8px;border-bottom:1px solid #f0f0f0;padding-bottom:6px;">
                        <strong>Employee:</strong> ${employeesById[s.employee_id] || s.employee_id} <br>
                        <strong>In:</strong> ${s.clock_in ? new Date(s.clock_in).toLocaleString() : '-'} <br>
                        <strong>Out:</strong> ${s.clock_out ? new Date(s.clock_out).toLocaleString() : 'IN'} <br>
                        <small>${s.device_info || ''}</small>
                    </li>
                `).join('') + '</ul>';
            }

            html += '<h4>Recent Activity</h4>';
            if (!activities || activities.length === 0) {
                html += '<div>No activity logs</div>';
            } else {
                html += '<ul>' + activities.map(a => `
                    <li style="margin-bottom:8px;border-bottom:1px solid #f8f8f8;padding-bottom:6px;">
                        <strong>Employee:</strong> ${ (a.employee && a.employee.name) || employeesById[a.employee_id] || a.employee_id } <br>
                        <strong>${a.category}</strong> at ${new Date(a.recorded_at).toLocaleString()}<br>
                        <small>${a.detail ? a.detail.substring(0,180) : ''}</small>
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
        if (!window.supabaseService || !window.supabaseService.isReady()) {
            container.innerHTML = '<div class="muted">Supabase not ready</div>';
            return;
        }
        console.log('[time-admin] loadAttendanceByEmployee: started');
        container.innerHTML = '<div>Loading attendance by employee...</div>';

        try {
            const { data: sessions, error } = await window.supabaseService.client
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

            let html = '<h4>Attendance By Employee</h4>';
            html += `<div style="margin-bottom:8px;color:#64748b;font-size:13px;">Loaded ${sessions ? sessions.length : 0} sessions for ${employeeIds.length} employees</div>`;
            if (!sessions || sessions.length === 0) {
                html += '<div>No sessions found</div>';
            } else {
                for (const empId of Object.keys(grouped)) {
                    const rows = grouped[empId].map(s => `
                        <tr>
                            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${s.session_id}</td>
                            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${s.clock_in ? new Date(s.clock_in).toLocaleString() : '-'}</td>
                            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${s.clock_out ? new Date(s.clock_out).toLocaleString() : 'IN'}</td>
                            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${s.device_info || ''}</td>
                        </tr>
                    `).join('');

                    const displayName = employeesById[empId] || empId;
                    html += `
                        <div style="margin-bottom:18px;">
                            <h4 style="margin:6px 0;">${displayName} (ID: ${empId})</h4>
                            <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
                                <thead>
                                    <tr style="text-align:left;border-bottom:1px solid #eee;"><th style="padding:6px 8px;">Session</th><th style="padding:6px 8px;">Clock In</th><th style="padding:6px 8px;">Clock Out</th><th style="padding:6px 8px;">Device</th></tr>
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

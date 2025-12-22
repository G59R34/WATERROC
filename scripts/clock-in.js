// Client-side clock-in/clock-out script
// Requires global `supabaseService` and sessionStorage user info

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('clockInBtn')) return;

    const btn = document.getElementById('clockInBtn');
    const statusEl = document.getElementById('clockStatus');

    async function getActiveSession() {
        const sessionId = sessionStorage.getItem('timeSessionId');
        if (!sessionId) return null;
        const { data } = await supabaseService.client
            .from('time_clocks')
            .select('*')
            .eq('session_id', sessionId)
            .maybeSingle();
        return data;
    }

    async function refreshStatus() {
        try {
            const data = await getActiveSession();
            if (data && !data.clock_out) {
                btn.textContent = 'Clock Out';
                statusEl.textContent = `Clocked in at ${new Date(data.clock_in).toLocaleTimeString()}`;
                btn.dataset.state = 'in';
            } else {
                btn.textContent = 'Clock In';
                statusEl.textContent = 'Not clocked in';
                btn.dataset.state = 'out';
            }
        } catch (error) {
            console.error('Error refreshing clock status', error);
        }
    }

    async function clockIn() {
        try {
            const userId = sessionStorage.getItem('userId');
            if (!userId) {
                alert('User not signed in');
                return;
            }
            // Load employee id from employees table
            const { data: employee } = await supabaseService.client
                .from('employees')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle();
            if (!employee) {
                alert('Employee record not found');
                return;
            }

            const deviceInfo = navigator.userAgent;
            const { data, error } = await supabaseService.client
                .from('time_clocks')
                .insert({
                    employee_id: employee.id,
                    clock_in: new Date().toISOString(),
                    device_info: deviceInfo
                })
                .select()
                .single();

            if (error) throw error;
            sessionStorage.setItem('timeSessionId', data.session_id);
            refreshStatus();

            // Log initial activity
            await supabaseService.client
                .rpc('insert_activity_log', {
                    p_employee_id: employee.id,
                    p_session_id: data.session_id,
                    p_category: 'clock_in',
                    p_detail: 'Clocked in via web',
                    p_idle_seconds: 0,
                    p_device_info: deviceInfo
                });

        } catch (error) {
            console.error('Clock in failed', error);
            alert('Clock in failed');
        }
    }

    async function clockOut() {
        try {
            const sessionId = sessionStorage.getItem('timeSessionId');
            if (!sessionId) {
                alert('No active session');
                return;
            }

            const { data: session } = await supabaseService.client
                .from('time_clocks')
                .select('*')
                .eq('session_id', sessionId)
                .maybeSingle();

            if (!session) {
                alert('Session not found');
                sessionStorage.removeItem('timeSessionId');
                refreshStatus();
                return;
            }

            const { error } = await supabaseService.client
                .from('time_clocks')
                .update({ clock_out: new Date().toISOString() })
                .eq('id', session.id);

            if (error) throw error;
            sessionStorage.removeItem('timeSessionId');
            refreshStatus();

            // Log clock out event
            await supabaseService.client
                .rpc('insert_activity_log', {
                    p_employee_id: session.employee_id,
                    p_session_id: session.session_id,
                    p_category: 'clock_out',
                    p_detail: 'Clocked out via web',
                    p_idle_seconds: 0,
                    p_device_info: session.device_info
                });

        } catch (error) {
            console.error('Clock out failed', error);
            alert('Clock out failed');
        }
    }

    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (btn.dataset.state === 'in') {
            await clockOut();
        } else {
            await clockIn();
        }
    });

    // Initialize UI
    refreshStatus();
});

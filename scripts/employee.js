// Employee Dashboard Script with Supabase Integration
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'employee') {
        window.location.href = 'index.html';
        return;
    }
    
    // Initialize check-in system
    if (typeof checkInSystem !== 'undefined') {
        checkInSystem.init();
    }
    
    // Initialize notification system if available
    if (typeof notificationSystem !== 'undefined') {
        await notificationSystem.init();
        setupNotificationPanel();
    }
    
    // Initialize announcement banner
    if (typeof announcementBanner !== 'undefined') {
        announcementBanner.init();
    }
    
    // Initialize Gantt Chart in read-only mode first
    const gantt = new GanttChart('ganttChart', false);
    
    // Logout functionality - set this up FIRST before any async operations
    document.getElementById('logoutBtn').addEventListener('click', async function(e) {
        e.preventDefault();
        
        try {
            // Clean up employee status monitoring first
            if (typeof employeeStatusMonitor !== 'undefined') {
                employeeStatusMonitor.cleanup();
            }
            
            // Sign out from Supabase
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                console.log('Signing out from Supabase...');
                await supabaseService.signOut();
            }
        } catch (error) {
            console.error('Error during Supabase logout:', error);
        }
        
        // Clear all session data
        sessionStorage.clear();
        localStorage.removeItem('ganttData');
        
        // Small delay to ensure signOut completes
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 100);
    });
    
    // Check Supabase authentication
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        const session = await supabaseService.getSession();
        if (!session) {
            sessionStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        
        await supabaseService.loadCurrentUser();
        const currentUser = await supabaseService.getCurrentUser();
        
        // Check employment status
        if (currentUser) {
            const { data: profile } = await supabaseService.client
                .from('employee_profiles')
                .select('employment_status')
                .eq('employee_id', currentUser.id)
                .single();
            
            const employmentStatus = profile?.employment_status || 'active';
            
            if (employmentStatus === 'terminated' || employmentStatus === 'administrative_leave') {
                alert('Your account access has been revoked. Please contact an administrator.');
                await supabaseService.signOut();
                sessionStorage.clear();
                window.location.href = 'index.html';
                return;
            }
            
            if (employmentStatus === 'extended_leave') {
                window.location.href = 'extended-leave.html';
                return;
            }
        }
        
        await syncFromSupabase();
        
        // Check for expired time off and restore employees to active
        try {
            await supabaseService.checkExpiredTimeOff();
        } catch (error) {
            console.error('Error checking expired time off on employee load:', error);
        }

        // Load team members for calling
        loadTeamMembers();
        
        // Update summary after initial load
        setTimeout(async () => {
            await updateScheduleSummary();
        }, 1500);
    }
    
    // Show check-in dialog after everything is loaded
    setTimeout(() => {
        if (typeof checkInSystem !== 'undefined' && checkInSystem.shouldShowCheckIn()) {
            checkInSystem.show('employee');
        }
    }, 500);
    
    // Update schedule summary
    async function updateScheduleSummary() {
        const upcomingShiftsEl = document.getElementById('upcomingShiftsCount');
        const activeTasksEl = document.getElementById('activeTasksCount');
        const weeklyHoursEl = document.getElementById('weeklyHours');
        const weeklyTasksEl = document.getElementById('weeklyTasksCount');
        
        if (!upcomingShiftsEl || !activeTasksEl || !weeklyHoursEl || !weeklyTasksEl) {
            console.warn('Summary elements not found');
            return;
        }
        
        if (!supabaseService || !supabaseService.isReady()) {
            console.warn('Supabase not ready for summary');
            return;
        }
        
        const employee = await getCurrentEmployee();
        if (!employee) {
            console.warn('No employee found for summary');
            return;
        }
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset to start of day
            
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)
            
            // Format dates for queries
            const formatDate = (date) => date.toISOString().split('T')[0];
            const startDate = formatDate(weekStart);
            const endDate = formatDate(weekEnd);
            
            console.log('Updating summary for week:', startDate, 'to', endDate, 'employee:', employee.id);
            
            // Get shifts for this week
            const shifts = await supabaseService.getEmployeeShifts(startDate, endDate);
            console.log('Loaded shifts:', shifts);
            const myShifts = shifts?.filter(s => s.employee_id === employee.id) || [];
            console.log('My shifts:', myShifts);
            
            // Filter upcoming shifts (from today onwards)
            const upcomingShifts = myShifts.filter(shift => {
                const shiftDate = new Date(shift.shift_date);
                shiftDate.setHours(0, 0, 0, 0);
                return shiftDate >= today && (shift.status === 'scheduled' || !shift.status);
            });
            console.log('Upcoming shifts:', upcomingShifts);
            
            // Get tasks for this week
            const allTasks = await supabaseService.getTasksWithAcknowledgements();
            console.log('All tasks:', allTasks);
            const myTasks = allTasks?.filter(t => t.employee_id === employee.id) || [];
            console.log('My tasks:', myTasks);
            
            // Filter tasks in date range
            const weekTasks = myTasks.filter(task => {
                const taskStart = new Date(task.start_date);
                const taskEnd = new Date(task.end_date);
                return (taskStart <= weekEnd && taskEnd >= weekStart);
            });
            console.log('Week tasks:', weekTasks);
            
            // Count active tasks (not completed)
            const activeTasks = weekTasks.filter(t => t.status !== 'completed');
            console.log('Active tasks:', activeTasks);
            
            // Calculate weekly hours
            let weeklyHours = 0;
            myShifts.forEach(shift => {
                if (shift.start_time && shift.end_time) {
                    const start = shift.start_time.split(':').map(Number);
                    const end = shift.end_time.split(':').map(Number);
                    const startMinutes = start[0] * 60 + (start[1] || 0);
                    const endMinutes = end[0] * 60 + (end[1] || 0);
                    const hours = (endMinutes - startMinutes) / 60;
                    if (hours > 0) weeklyHours += hours;
                }
            });
            console.log('Weekly hours:', weeklyHours);
            
            // Update summary display
            upcomingShiftsEl.textContent = upcomingShifts.length;
            activeTasksEl.textContent = activeTasks.length;
            weeklyHoursEl.textContent = Math.round(weeklyHours);
            weeklyTasksEl.textContent = weekTasks.length;
            
            console.log('Summary updated:', {
                upcomingShifts: upcomingShifts.length,
                activeTasks: activeTasks.length,
                weeklyHours: Math.round(weeklyHours),
                weeklyTasks: weekTasks.length
            });
            
        } catch (error) {
            console.error('Error updating schedule summary:', error);
            // Set to 0 on error
            upcomingShiftsEl.textContent = '0';
            activeTasksEl.textContent = '0';
            weeklyHoursEl.textContent = '0';
            weeklyTasksEl.textContent = '0';
        }
    }
    
    // Update summary when Gantt chart updates
    if (typeof gantt !== 'undefined') {
        const originalSync = syncFromSupabase;
        syncFromSupabase = async function() {
            await originalSync();
            await updateScheduleSummary();
        };
    }
    
    // Sync data from Supabase
    async function syncFromSupabase() {
        if (!supabaseService.isReady()) return;
        
        const currentUser = await supabaseService.getCurrentUser();
        if (!currentUser) return;
        
        const employees = await supabaseService.getEmployees();
        const allTasks = await supabaseService.getTasksWithAcknowledgements();
        
        if (employees && allTasks) {
            // Find the employee linked to this user
            const userEmployee = employees.find(e => e.user_id === currentUser.id);
            
            if (!userEmployee) {
                console.warn('No employee record found for this user');
                // Show message to user
                const ganttContainer = document.getElementById('ganttChart');
                ganttContainer.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #64748b;">
                        <h3>No Employee Record Found</h3>
                        <p>Your user account is not linked to an employee. Please contact an administrator.</p>
                    </div>
                `;
                return;
            }
            
            // Filter tasks to only show this employee's tasks
            const userTasks = allTasks.filter(t => t.employee_id === userEmployee.id);
            
            const data = {
                employees: [{ // Only show this employee
                    id: userEmployee.id,
                    name: userEmployee.name,
                    role: userEmployee.role
                }],
                tasks: userTasks.map(t => ({
                    id: t.id,
                    employeeId: t.employee_id,
                    name: t.name,
                    startDate: t.start_date,
                    endDate: t.end_date,
                    startTime: t.start_time,
                    endTime: t.end_time,
                    status: t.status,
                    acknowledgements: t.acknowledgements || []
                })),
                nextEmployeeId: Math.max(...employees.map(e => e.id), 0) + 1,
                nextTaskId: Math.max(...allTasks.map(t => t.id), 0) + 1
            };
            
            // Only update if data actually changed to prevent unnecessary re-renders
            const currentDataStr = JSON.stringify({
                employees: gantt.data.employees,
                tasks: gantt.data.tasks
            });
            const newDataStr = JSON.stringify({
                employees: data.employees,
                tasks: data.tasks
            });
            
            if (currentDataStr !== newDataStr) {
                localStorage.setItem('ganttData', JSON.stringify(data));
                gantt.data = data;
                // Use requestAnimationFrame to make render smoother
                requestAnimationFrame(async () => {
                    await gantt.render();
                });
                
                console.log(`📋 Updated ${userTasks.length} task(s) for ${userEmployee.name}`);
            }
            
            // Update summary after a short delay to ensure DOM is ready
            setTimeout(async () => {
                await updateScheduleSummary();
            }, 500);
        }
    }
    
    // Auto-refresh from Supabase every 2 seconds
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        // Track last announcement count to detect new ones
        let lastAnnouncementCount = 0;
        
        // Initial count
        supabaseService.getUnreadAnnouncements().then(announcements => {
            lastAnnouncementCount = announcements ? announcements.length : 0;
        });
        
        // Check for overdue tasks immediately on load
        supabaseService.checkAndMarkOverdueTasks();
        
        setInterval(async () => {
            // Check for overdue tasks and mark them (this creates NSFT exceptions automatically)
            await supabaseService.checkAndMarkOverdueTasks();
            
            // Check for new tasks if notification system is available
            if (typeof notificationSystem !== 'undefined') {
                const currentUser = await supabaseService.getCurrentUser();
                if (currentUser) {
                    const allTasks = await supabaseService.getTasksWithAcknowledgements();
                    const employees = await supabaseService.getEmployees();
                    const userEmployee = employees?.find(e => e.user_id === currentUser.id);
                    
                    if (userEmployee && allTasks) {
                        const userTasks = allTasks.filter(t => t.employee_id === userEmployee.id);
                        await notificationSystem.checkForNewTasks(userTasks.length);
                    }
                }
            }
            
            // Check for new announcements
            const unreadAnnouncements = await supabaseService.getUnreadAnnouncements();
            if (unreadAnnouncements && unreadAnnouncements.length > lastAnnouncementCount) {
                const newCount = unreadAnnouncements.length - lastAnnouncementCount;
                console.log(`📢 ${newCount} new announcement(s) detected!`);
                
                // Add notification for new announcements
                if (typeof notificationSystem !== 'undefined' && newCount > 0) {
                    const latestAnnouncement = unreadAnnouncements[0];
                    notificationSystem.addNotification(
                        'announcement',
                        `📢 ${latestAnnouncement.title}: ${latestAnnouncement.message.substring(0, 100)}...`
                    );
                }
                
                lastAnnouncementCount = unreadAnnouncements.length;
            } else if (unreadAnnouncements) {
                lastAnnouncementCount = unreadAnnouncements.length;
            }
            
            // Only sync if page is visible (not in background tab)
            if (document.visibilityState === 'visible') {
                await syncFromSupabase();
            }
        }, 30000); // Refresh every 30 seconds instead of 2 (less disruptive)
        
        console.log('🔄 Auto-refresh enabled (every 30 seconds)');
    }

    // My Shifts and Profile functionality
    let currentEmployeeData = null;

    // Get current employee data
    async function getCurrentEmployee() {
        if (currentEmployeeData) return currentEmployeeData;

        const currentUser = await supabaseService.getCurrentUser();
        if (!currentUser) return null;

        const employees = await supabaseService.getEmployees();
        currentEmployeeData = employees?.find(e => e.user_id === currentUser.id);
        return currentEmployeeData;
    }

    // My Shifts Modal
    const myShiftsModal = document.getElementById('myShiftsModal');
    const myShiftsBtn = document.getElementById('viewMyShiftsBtn');
    let shiftsWeekStart = getMonday(new Date());

    myShiftsBtn.addEventListener('click', async () => {
        myShiftsModal.style.display = 'block';
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('shifts data');
        }
        await loadMyShifts();
    });

    document.getElementById('myShiftsPrevWeek').addEventListener('click', async () => {
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('previous week shifts');
        }
        shiftsWeekStart.setDate(shiftsWeekStart.getDate() - 7);
        await loadMyShifts();
    });

    document.getElementById('myShiftsNextWeek').addEventListener('click', async () => {
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('next week shifts');
        }
        shiftsWeekStart.setDate(shiftsWeekStart.getDate() + 7);
        await loadMyShifts();
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

    async function loadMyShifts() {
        const content = document.getElementById('myShiftsContent');
        content.innerHTML = '<div class="loading-message">Loading your shifts...</div>';

        const employee = await getCurrentEmployee();
        if (!employee) {
            content.innerHTML = '<div class="loading-message">Error loading employee data</div>';
            return;
        }

        const weekEnd = new Date(shiftsWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const shifts = await supabaseService.getEmployeeShifts(
            formatDate(shiftsWeekStart),
            formatDate(weekEnd)
        );

        // Get exceptions for this employee for the week
        console.log(`Fetching exceptions for employee ${employee.id} (${employee.name})`);
        console.log(`Date range: ${formatDate(shiftsWeekStart)} to ${formatDate(weekEnd)}`);
        
        const exceptions = await supabaseService.getExceptionLogs({
            employeeId: employee.id,
            startDate: formatDate(shiftsWeekStart),
            endDate: formatDate(weekEnd)
        }) || [];

        console.log('Loaded exceptions for employee:', exceptions);
        console.log('Exception count:', exceptions.length);
        
        if (exceptions.length > 0) {
            console.log('Sample exception:', exceptions[0]);
        }

        // Update week display
        document.getElementById('myShiftsWeekDisplay').textContent = 
            `${formatDateDisplay(shiftsWeekStart)} - ${formatDateDisplay(weekEnd)}`;

        // Filter for this employee only
        const myShifts = shifts?.filter(s => s.employee_id === employee.id) || [];

        // Generate week days
        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(shiftsWeekStart);
            day.setDate(day.getDate() + i);
            weekDays.push(day);
        }

        // Create shift map
        const shiftMap = {};
        myShifts.forEach(shift => {
            // Normalize shift_date to YYYY-MM-DD format
            let shiftDate = shift.shift_date;
            if (shiftDate instanceof Date) {
                shiftDate = formatDate(shiftDate);
            } else if (typeof shiftDate === 'string') {
                shiftDate = shiftDate.split('T')[0];
            }
            
            if (!shiftMap[shiftDate]) {
                shiftMap[shiftDate] = [];
            }
            shiftMap[shiftDate].push(shift);
        });

        // Create exception map - normalize dates to YYYY-MM-DD format
        const exceptionMap = {};
        if (Array.isArray(exceptions) && exceptions.length > 0) {
            exceptions.forEach(exc => {
                // Normalize exception_date to YYYY-MM-DD format
                let excDate = exc.exception_date;
                if (excDate instanceof Date) {
                    excDate = formatDate(excDate);
                } else if (typeof excDate === 'string') {
                    // If it's already a string, ensure it's in YYYY-MM-DD format
                    excDate = excDate.split('T')[0]; // Remove time portion if present
                }
                
                if (!exceptionMap[excDate]) {
                    exceptionMap[excDate] = [];
                }
                exceptionMap[excDate].push(exc);
            });
        } else {
            console.log('No exceptions found or exceptions is not an array');
        }

        console.log('Exception map:', exceptionMap);
        console.log('Exception map keys:', Object.keys(exceptionMap));

        // Exception colors
        const exceptionColors = {
            'VAUT': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            'DO': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            'UAEO': 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            'NSFT': 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            'VATO': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            'EMWM': 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
        };

        const exceptionLabels = {
            'VAUT': 'Verified Authorized Unavailable Time',
            'DO': 'Day Off',
            'UAEO': 'Unauthorized Absence',
            'NSFT': 'No Show For Task',
            'VATO': 'Verified Authorized Time Off',
            'EMWM': 'Employee Meeting With Management'
        };

        // Build display
        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">';
        
        weekDays.forEach(day => {
            const dateStr = formatDate(day);
            const dayShifts = shiftMap[dateStr] || [];
            const dayExceptions = exceptionMap[dateStr] || [];
            const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
            
            html += `
                <div class="my-shifts-day-card">
                    <div style="font-weight: 600; margin-bottom: 10px; text-align: center; color: var(--text-primary);">
                        ${dayName}<br>${formatDateDisplay(day)}
                    </div>
                    ${dayShifts.length > 0 ? dayShifts.map(shift => {
                        const statusColors = {
                            'scheduled': 'var(--primary-color)',
                            'completed': 'var(--success-color)',
                            'cancelled': 'var(--danger-color)',
                            'no-show': '#64748b'
                        };
                        return `
                            <div style="background: ${statusColors[shift.status] || statusColors.scheduled}; color: white; padding: 10px; border-radius: 6px; margin-bottom: 8px; font-size: 13px;">
                                <div style="font-weight: 600;">${shift.start_time.substring(0, 5)} - ${shift.end_time.substring(0, 5)}</div>
                                ${shift.shift_templates ? `<div style="font-size: 11px; opacity: 0.9;">${shift.shift_templates.name}</div>` : ''}
                                ${shift.notes ? `<div style="font-size: 11px; margin-top: 5px; opacity: 0.9;">${shift.notes}</div>` : ''}
                            </div>
                        `;
                    }).join('') : ''}
                    ${dayExceptions.length > 0 ? dayExceptions.map(exc => `
                        <div style="background: ${exceptionColors[exc.exception_code] || '#64748b'}; color: white; padding: 10px; border-radius: 6px; margin-top: ${dayShifts.length > 0 ? '8px' : '0'}; font-size: 12px; border: 2px solid rgba(255,255,255,0.3);">
                            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${exc.exception_code}</div>
                            <div style="font-size: 11px; opacity: 0.95; margin-bottom: 3px;">${exceptionLabels[exc.exception_code] || exc.exception_code}</div>
                            ${exc.start_time && exc.end_time ? `<div style="font-size: 11px; opacity: 0.9;">⏰ ${exc.start_time.substring(0, 5)} - ${exc.end_time.substring(0, 5)}</div>` : ''}
                            ${exc.reason ? `<div style="font-size: 11px; margin-top: 4px; opacity: 0.9; font-style: italic;">${exc.reason}</div>` : ''}
                            ${exc.approved_by && exc.approved_by !== 'SYSTEM' ? `<div style="font-size: 10px; margin-top: 4px; opacity: 0.8;">✓ Approved by ${exc.approved_by}</div>` : ''}
                        </div>
                    `).join('') : ''}
                    ${dayShifts.length === 0 && dayExceptions.length === 0 ? '<div style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 20px 0;">No shifts</div>' : ''}
                </div>
            `;
        });
        
        html += '</div>';
        content.innerHTML = html;
    }

    // My Profile Modal
    const myProfileModal = document.getElementById('myProfileModal');
    const myProfileBtn = document.getElementById('editMyProfileBtn');
    const myProfileForm = document.getElementById('myProfileForm');

    myProfileBtn.addEventListener('click', async () => {
        myProfileModal.style.display = 'block';
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('profile data');
        }
        await loadMyProfile();
    });

    document.getElementById('cancelMyProfileBtn').addEventListener('click', () => {
        myProfileModal.style.display = 'none';
    });

    async function loadMyProfile() {
        const employee = await getCurrentEmployee();
        if (!employee) {
            alert('Error loading employee data');
            return;
        }

        const profile = await supabaseService.getEmployeeProfile(employee.id);

        document.getElementById('myProfileName').value = employee.name;
        document.getElementById('myProfilePhone').value = profile?.phone || '';
        document.getElementById('myProfileEmail').value = profile?.email || '';
        document.getElementById('myProfileSkills').value = profile?.skills ? profile.skills.join(', ') : '';
        document.getElementById('myProfileCertifications').value = profile?.certifications ? profile.certifications.join(', ') : '';
    }

    myProfileForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (typeof showFormLoadingScreen !== 'undefined') {
            showFormLoadingScreen('profile update');
        }

        const employee = await getCurrentEmployee();
        if (!employee) {
            alert('Error loading employee data');
            return;
        }

        const profileData = {
            phone: document.getElementById('myProfilePhone').value.trim() || null,
            email: document.getElementById('myProfileEmail').value.trim() || null,
            skills: document.getElementById('myProfileSkills').value
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0),
            certifications: document.getElementById('myProfileCertifications').value
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0)
        };

        try {
            const result = await supabaseService.createOrUpdateEmployeeProfile(employee.id, profileData);
            
            if (result) {
                alert('✅ Profile updated successfully!');
                myProfileModal.style.display = 'none';
            } else {
                alert('❌ Failed to update profile. Please try again.');
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('❌ Error saving profile. Please try again.');
        }
    });

    // Close modals when clicking outside or on close button
    window.addEventListener('click', (e) => {
        if (e.target === myShiftsModal) {
            myShiftsModal.style.display = 'none';
        }
        if (e.target === myProfileModal) {
            myProfileModal.style.display = 'none';
        }
    });

    myShiftsModal.querySelector('.close').addEventListener('click', () => {
        myShiftsModal.style.display = 'none';
    });

    myProfileModal.querySelector('.close').addEventListener('click', () => {
        myProfileModal.style.display = 'none';
    });

    // My Paycheck Modal
    const myPaycheckModal = document.getElementById('myPaycheckModal');
    const myPaycheckBtn = document.getElementById('viewMyPaycheckBtn');
    const closeMyPaycheckModal = document.getElementById('closeMyPaycheckModal');
    const myTransactionsBtn = document.getElementById('viewMyTransactionsBtn');
    const myTransactionsModal = document.getElementById('myTransactionsModal');
    const closeMyTransactionsModal = document.getElementById('closeMyTransactionsModal');
    const transactionSearchInput = document.getElementById('transactionSearchInput');
    const transactionTypeFilter = document.getElementById('transactionTypeFilter');
    const transactionDateFilter = document.getElementById('transactionDateFilter');

    if (myPaycheckBtn) {
        myPaycheckBtn.addEventListener('click', async () => {
            myPaycheckModal.style.display = 'block';
            if (typeof showDataLoadingScreen !== 'undefined') {
                showDataLoadingScreen('paycheck data');
            }
            await loadMyPaycheck();
        });
    }

    if (closeMyPaycheckModal) {
        closeMyPaycheckModal.addEventListener('click', () => {
            myPaycheckModal.style.display = 'none';
        });
    }
    
    if (myTransactionsBtn) {
        myTransactionsBtn.addEventListener('click', async () => {
            myTransactionsModal.style.display = 'block';
            if (typeof showDataLoadingScreen !== 'undefined') {
                showDataLoadingScreen('transaction history');
            }
            await loadMyTransactions();
        });
    }
    
    if (closeMyTransactionsModal) {
        closeMyTransactionsModal.addEventListener('click', () => {
            myTransactionsModal.style.display = 'none';
        });
    }
    
    if (transactionSearchInput) {
        transactionSearchInput.addEventListener('input', () => {
            filterTransactions();
        });
    }
    
    if (transactionTypeFilter) {
        transactionTypeFilter.addEventListener('change', () => {
            filterTransactions();
        });
    }
    
    if (transactionDateFilter) {
        transactionDateFilter.addEventListener('change', () => {
            filterTransactions();
        });
    }
    
    let allTransactions = [];
    
    async function loadMyTransactions() {
        const content = document.getElementById('transactionsContent');
        if (!content) return;
        
        try {
            const employee = await getCurrentEmployee();
            if (!employee) {
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc2626;">Error loading employee data</div>';
                return;
            }
            
            if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc2626;">Supabase not available</div>';
                return;
            }
            
            allTransactions = await supabaseService.getEmployeeTransactions(employee.id, 500);
            
            if (allTransactions.length === 0) {
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: #64748b;">No transactions found</div>';
                return;
            }
            
            renderTransactions(allTransactions);
        } catch (error) {
            console.error('Error loading transactions:', error);
            content.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc2626;">Error loading transactions</div>';
        }
    }
    
    function renderTransactions(transactions) {
        const content = document.getElementById('transactionsContent');
        if (!content) return;
        
        if (transactions.length === 0) {
            content.innerHTML = '<div style="text-align: center; padding: 40px; color: #64748b;">No transactions match your filters</div>';
            return;
        }
        
        const transactionIcons = {
            'payroll': '💰',
            'purchase': '🛒',
            'garnishment': '⚖️',
            'stock_buy': '📈',
            'stock_sell': '📊',
            'stock_loss': '📉'
        };
        
        const transactionLabels = {
            'payroll': 'Payroll Payment',
            'purchase': 'Store Purchase',
            'garnishment': 'Wage Garnishment / Admin Deduction',
            'stock_buy': 'Stock Purchase',
            'stock_sell': 'Stock Sale',
            'stock_loss': 'Stock Loss'
        };
        
        content.innerHTML = transactions.map(tx => {
            const amount = parseFloat(tx.amount || 0);
            const isPositive = amount > 0;
            const balanceAfter = parseFloat(tx.balance_after || 0);
            const date = new Date(tx.created_at);
            const icon = transactionIcons[tx.transaction_type] || '💳';
            const label = transactionLabels[tx.transaction_type] || tx.transaction_type;
            
            return `
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 4px solid ${isPositive ? '#10b981' : '#ef4444'};">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <span style="font-size: 24px;">${icon}</span>
                                <div>
                                    <div style="font-weight: 600; font-size: 16px; color: #1f2937;">
                                        ${label}
                                    </div>
                                    <div style="font-size: 12px; color: #6b7280;">
                                        ${date.toLocaleString('en-US', { 
                                            month: 'short', 
                                            day: 'numeric', 
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                            </div>
                            ${tx.description ? `<div style="font-size: 14px; color: #4b5563; margin-top: 8px;">${tx.description}</div>` : ''}
                        </div>
                        <div style="text-align: right; margin-left: 20px;">
                            <div style="font-size: 20px; font-weight: bold; color: ${isPositive ? '#10b981' : '#ef4444'};">
                                ${isPositive ? '+' : ''}$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            ${balanceAfter !== null ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Balance: $${balanceAfter.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    function filterTransactions() {
        if (!allTransactions || allTransactions.length === 0) return;
        
        const searchTerm = (transactionSearchInput?.value || '').toLowerCase();
        const typeFilter = transactionTypeFilter?.value || 'all';
        const dateFilter = transactionDateFilter?.value || 'all';
        
        let filtered = allTransactions;
        
        // Filter by search term
        if (searchTerm) {
            filtered = filtered.filter(tx => {
                const description = (tx.description || '').toLowerCase();
                const type = (tx.transaction_type || '').toLowerCase();
                return description.includes(searchTerm) || type.includes(searchTerm);
            });
        }
        
        // Filter by type
        if (typeFilter !== 'all') {
            filtered = filtered.filter(tx => tx.transaction_type === typeFilter);
        }
        
        // Filter by date
        if (dateFilter !== 'all') {
            const now = new Date();
            const cutoffDate = new Date();
            
            switch (dateFilter) {
                case 'week':
                    cutoffDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    cutoffDate.setMonth(now.getMonth() - 1);
                    break;
                case 'quarter':
                    cutoffDate.setMonth(now.getMonth() - 3);
                    break;
                case 'year':
                    cutoffDate.setFullYear(now.getFullYear() - 1);
                    break;
            }
            
            filtered = filtered.filter(tx => {
                const txDate = new Date(tx.created_at);
                return txDate >= cutoffDate;
            });
        }
        
        renderTransactions(filtered);
    }

    window.addEventListener('click', (e) => {
        if (e.target === myPaycheckModal) {
            myPaycheckModal.style.display = 'none';
        }
    });

    async function loadMyPaycheck() {
        const content = document.getElementById('paycheckContent');
        if (!content) return;

        try {
            const employee = await getCurrentEmployee();
            if (!employee) {
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc2626;">Error loading employee data</div>';
                return;
            }

            if (!supabaseService.isReady()) {
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: #64748b;">Payroll system not available. Please contact your administrator.</div>';
                return;
            }

            // Get employee's payroll history
            console.log('Loading paycheck for employee ID:', employee.id);
            const payrollHistory = await supabaseService.getEmployeePayrollHistory(employee.id, 10);
            console.log('Payroll history retrieved:', payrollHistory);

            if (payrollHistory.length === 0) {
                // Try to get all payroll history to debug
                const allHistory = await supabaseService.getPayrollHistory(10);
                console.log('All payroll history (for debugging):', allHistory);
                
                content.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #64748b;">
                        <h3>No Paycheck History</h3>
                        <p>You don't have any payroll records yet. Paychecks will appear here once payroll has been processed.</p>
                        <p style="font-size: 12px; margin-top: 10px; color: #9ca3af;">Employee ID: ${employee.id}</p>
                    </div>
                `;
                return;
            }

            // Display latest paycheck and history
            const latestPayroll = payrollHistory[0];
            const payrollData = latestPayroll.employeePayrollData;

            content.innerHTML = `
                <div style="margin-bottom: 30px;">
                    <h3 style="margin-bottom: 20px; color: var(--text-primary, #1f2937);">Latest Paycheck</h3>
                    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <div>
                                <div style="font-size: 14px; color: #6b7280;">Pay Period</div>
                                <div style="font-weight: 600; color: var(--text-primary, #1f2937);">
                                    ${new Date(latestPayroll.pay_period_start).toLocaleDateString()} - ${new Date(latestPayroll.pay_period_end).toLocaleDateString()}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 14px; color: #6b7280;">Pay Date</div>
                                <div style="font-weight: 600; color: var(--text-primary, #1f2937);">
                                    ${new Date(latestPayroll.pay_date).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                        
                        <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 15px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                                <span style="color: #6b7280;">Hours Worked:</span>
                                <span style="font-weight: 600;">${payrollData.hours ? payrollData.hours.toFixed(2) : '0.00'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                                <span style="color: #6b7280;">Hourly Rate:</span>
                                <span style="font-weight: 600;">$${payrollData.hourlyRate ? payrollData.hourlyRate.toFixed(2) : '0.00'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                                <span style="color: #6b7280;">Gross Pay:</span>
                                <span style="font-weight: 600;">$${payrollData.grossPay ? payrollData.grossPay.toFixed(2) : '0.00'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px;">
                                <span style="color: #6b7280;">Federal Tax:</span>
                                <span>$${payrollData.federalTax ? payrollData.federalTax.toFixed(2) : '0.00'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px;">
                                <span style="color: #6b7280;">State Tax:</span>
                                <span>$${payrollData.stateTax ? payrollData.stateTax.toFixed(2) : '0.00'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px;">
                                <span style="color: #6b7280;">Social Security:</span>
                                <span>$${payrollData.socialSecurity ? payrollData.socialSecurity.toFixed(2) : '0.00'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px;">
                                <span style="color: #6b7280;">Medicare:</span>
                                <span>$${payrollData.medicare ? payrollData.medicare.toFixed(2) : '0.00'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px;">
                                <span style="color: #6b7280;">Unemployment:</span>
                                <span>$${payrollData.unemployment ? payrollData.unemployment.toFixed(2) : '0.00'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px;">
                                <span style="color: #6b7280;">Health Insurance:</span>
                                <span>$${payrollData.healthInsurance ? payrollData.healthInsurance.toFixed(2) : '0.00'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 15px; padding-top: 15px; border-top: 2px solid #3b82f6; font-size: 18px; font-weight: 700;">
                                <span style="color: var(--text-primary, #1f2937);">Net Pay:</span>
                                <span style="color: #3b82f6;">$${payrollData.netPay ? payrollData.netPay.toFixed(2) : '0.00'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                    <h3 style="margin-bottom: 15px; color: var(--text-primary, #1f2937);">Paycheck History</h3>
                    <div id="paycheckHistoryList" style="max-height: 400px; overflow-y: auto;">
                        ${payrollHistory.slice(1).map(payroll => {
                            const empData = payroll.employeePayrollData;
                            return `
                                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin-bottom: 10px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--text-primary, #1f2937);">
                                                ${new Date(payroll.pay_period_start).toLocaleDateString()} - ${new Date(payroll.pay_period_end).toLocaleDateString()}
                                            </div>
                                            <div style="font-size: 12px; color: #6b7280; margin-top: 3px;">
                                                Paid: ${new Date(payroll.pay_date).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div style="text-align: right;">
                                            <div style="font-size: 18px; font-weight: 700; color: #3b82f6;">
                                                $${empData.netPay ? empData.netPay.toFixed(2) : '0.00'}
                                            </div>
                                            <div style="font-size: 12px; color: #6b7280;">
                                                ${empData.hours ? empData.hours.toFixed(1) : '0'} hrs
                                            </div>
                                        </div>
                                    </div>
                                    <div style="font-size: 12px; color: #6b7280;">
                                        Gross: $${empData.grossPay ? empData.grossPay.toFixed(2) : '0.00'} | 
                                        Deductions: $${empData.totalDeductions ? empData.totalDeductions.toFixed(2) : '0.00'}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading paycheck:', error);
            content.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc2626;">Error loading paycheck information. Please try again later.</div>';
        }
    }
    
    // Setup notification panel
    function setupNotificationPanel() {
        const notificationBtn = document.getElementById('notificationBtn');
        const notificationPanel = document.getElementById('notificationPanel');
        const notificationOverlay = document.getElementById('notificationOverlay');
        const closeNotificationBtn = document.getElementById('closeNotificationBtn');
        const markAllReadBtn = document.getElementById('markAllReadBtn');
        const clearAllBtn = document.getElementById('clearAllBtn');
        
        if (!notificationBtn) return; // Exit if elements don't exist
        
        // Toggle notification panel
        notificationBtn.addEventListener('click', () => {
            if (typeof showUILoadingScreen !== 'undefined') {
                showUILoadingScreen('notification panel');
            }
            notificationPanel.classList.add('active');
            notificationOverlay.classList.add('active');
        });
        
        // Close panel
        const closePanel = () => {
            notificationPanel.classList.remove('active');
            notificationOverlay.classList.remove('active');
        };
        
        closeNotificationBtn.addEventListener('click', closePanel);
        notificationOverlay.addEventListener('click', closePanel);
        
        // Mark all as read
        markAllReadBtn.addEventListener('click', () => {
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('notification update');
            }
            notificationSystem.markAllAsRead();
        });
        
        // Clear all notifications
        clearAllBtn.addEventListener('click', () => {
            if (confirm('Clear all notifications?')) {
                if (typeof showActionLoadingScreen !== 'undefined') {
                    showActionLoadingScreen('notification clearing');
                }
                notificationSystem.clearAll();
            }
        });
    }
    
    // Task Details Modal
    const taskDetailsModal = document.getElementById('taskDetailsModal');
    const closeBtn = taskDetailsModal.querySelector('.close');
    
    closeBtn.addEventListener('click', function() {
        taskDetailsModal.style.display = 'none';
    });
    
    window.addEventListener('click', function(e) {
        if (e.target === taskDetailsModal) {
            taskDetailsModal.style.display = 'none';
        }
    });
    
    // Override task click handler for read-only view
    gantt.onTaskClick = async function(task) {
        const employee = this.data.employees.find(e => e.id === task.employeeId);
        
        const statusLabels = {
            'in-progress': 'In Progress',
            'completed': 'Completed',
            'pending': 'Pending',
            'overdue': 'Overdue',
            'on-hold': 'On Hold'
        };
        
        // Format time display
        const startTime = task.startTime || '0000';
        const endTime = task.endTime || '2359';
        const timeDisplay = `${formatTime(startTime)} - ${formatTime(endTime)}`;
        
        const taskDetailsContent = document.getElementById('taskDetails');
        taskDetailsContent.innerHTML = `
            <p><strong>Task:</strong> ${task.name}</p>
            <p><strong>Assigned To:</strong> ${employee.name} (${employee.role})</p>
            <p><strong>Start Date:</strong> ${formatFullDate(new Date(task.startDate))}</p>
            <p><strong>End Date:</strong> ${formatFullDate(new Date(task.endDate))}</p>
            <p><strong>Time:</strong> ${timeDisplay}</p>
            <p><strong>Status:</strong> ${statusLabels[task.status]}</p>
            <p><strong>Duration:</strong> ${calculateDuration(task.startDate, task.endDate)} days</p>
        `;
        
        // Setup acknowledgement buttons
        await setupAcknowledgementButtons(task.id);
        
        // Load and display messages
        await loadTaskMessages(task.id);
        
        // Setup message sending
        setupMessageSending(task.id);
        
        taskDetailsModal.style.display = 'block';
    };
    
    // Setup acknowledgement buttons
    async function setupAcknowledgementButtons(taskId) {
        const acknowledgeBtn = document.getElementById('acknowledgeBtn');
        const unacknowledgeBtn = document.getElementById('unacknowledgeBtn');
        
        if (!supabaseService.isReady()) {
            acknowledgeBtn.style.display = 'none';
            unacknowledgeBtn.style.display = 'none';
            return;
        }
        
        // Check if already acknowledged
        const hasAcked = await supabaseService.hasAcknowledgedTask(taskId);
        
        if (hasAcked) {
            acknowledgeBtn.style.display = 'none';
            unacknowledgeBtn.style.display = 'block';
        } else {
            acknowledgeBtn.style.display = 'block';
            unacknowledgeBtn.style.display = 'none';
        }
        
        // Acknowledge button handler
        acknowledgeBtn.onclick = async function() {
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('task acknowledgement');
            }
            const result = await supabaseService.acknowledgeTask(taskId);
            if (result) {
                alert('Task acknowledged successfully!');
                acknowledgeBtn.style.display = 'none';
                unacknowledgeBtn.style.display = 'block';
                await syncFromSupabase();
            } else {
                alert('Failed to acknowledge task');
            }
        };
        
        // Unacknowledge button handler
        unacknowledgeBtn.onclick = async function() {
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('acknowledgement removal');
            }
            const result = await supabaseService.unacknowledgeTask(taskId);
            if (result) {
                alert('Acknowledgement removed');
                acknowledgeBtn.style.display = 'block';
                unacknowledgeBtn.style.display = 'none';
                await syncFromSupabase();
            } else {
                alert('Failed to remove acknowledgement');
            }
        };
    }
    
    function formatTime(timeStr) {
        if (!timeStr || timeStr.length !== 4) return '00:00';
        return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
    }
    
    function formatFullDate(date) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }
    
    function calculateDuration(start, end) {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const oneDay = 24 * 60 * 60 * 1000;
        return Math.round(Math.abs((endDate - startDate) / oneDay)) + 1;
    }
    
    // Load task messages
    async function loadTaskMessages(taskId) {
        const messagesList = document.getElementById('taskMessagesList');
        
        if (!supabaseService.isReady()) {
            messagesList.innerHTML = '<p class="messages-empty">Messages are not available offline</p>';
            return;
        }
        
        const messages = await supabaseService.getTaskMessages(taskId);
        
        if (!messages || messages.length === 0) {
            messagesList.innerHTML = '<p class="messages-empty">No messages yet. Send a message to ask a question!</p>';
            return;
        }
        
        messagesList.innerHTML = messages.map(msg => {
            const isFromAdmin = msg.is_from_admin;
            const author = msg.user?.full_name || 'Unknown';
            const time = new Date(msg.created_at).toLocaleString();
            
            return `
                <div class="message-item ${isFromAdmin ? 'from-admin' : 'from-employee'}">
                    <div class="message-header">
                        <span class="message-author">${isFromAdmin ? '👨‍💼 ' : '👤 '}${author}</span>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-text">${msg.message}</div>
                </div>
            `;
        }).join('');
        
        // Mark messages as read
        await supabaseService.markMessagesAsRead(taskId);
        
        // Scroll to bottom
        messagesList.scrollTop = messagesList.scrollHeight;
    }
    
    // Setup message sending
    function setupMessageSending(taskId) {
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendMessageBtn');
        
        // Clear previous input
        messageInput.value = '';
        
        // Remove previous event listeners by cloning
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        
        newSendBtn.addEventListener('click', async () => {
            const message = messageInput.value.trim();
            
            if (!message) {
                alert('Please enter a message');
                return;
            }
            
            if (!supabaseService.isReady()) {
                alert('Messages are not available offline');
                return;
            }
            
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('message');
            }
            
            newSendBtn.disabled = true;
            newSendBtn.textContent = 'Sending...';
            
            const result = await supabaseService.sendTaskMessage(taskId, message, false);
            
            if (result) {
                messageInput.value = '';
                await loadTaskMessages(taskId);
                
                // Show success notification
                if (notificationSystem) {
                    notificationSystem.addNotification(
                        'Message sent to admin',
                        'Your message has been sent successfully',
                        'success'
                    );
                }
            } else {
                alert('Failed to send message. Please try again.');
            }
            
            newSendBtn.disabled = false;
            newSendBtn.textContent = 'Send Message';
        });
        
        // Allow Enter key to send (Shift+Enter for new line)
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                newSendBtn.click();
            }
        });
    }
    
    // ============================================
    // TIME OFF REQUEST FUNCTIONALITY
    // ============================================
    
    const timeOffModal = document.getElementById('timeOffModal');
    // ==========================================
    // 401K PLAN MANAGEMENT
    // ==========================================
    
    const manage401kBtn = document.getElementById('manage401kBtn');
    const manage401kModal = document.getElementById('manage401kModal');
    const close401kModal = document.getElementById('close401kModal');
    const enrollment401kForm = document.getElementById('401kEnrollmentForm');
    const update401kForm = document.getElementById('401kUpdateForm');
    const pause401kBtn = document.getElementById('pause401kBtn');
    
    if (manage401kBtn) {
        manage401kBtn.addEventListener('click', async () => {
            manage401kModal.style.display = 'block';
            await load401kUI();
        });
    }
    
    if (close401kModal) {
        close401kModal.addEventListener('click', () => {
            manage401kModal.style.display = 'none';
        });
    }
    
    async function load401kUI() {
        const employee = await getCurrentEmployee();
        if (!employee) return;
        
        const enrollment = await supabaseService.getEmployee401k(employee.id);
        const enrollmentDiv = document.getElementById('401kEnrollment');
        const detailsDiv = document.getElementById('401kDetails');
        
        if (!enrollment) {
            enrollmentDiv.style.display = 'block';
            detailsDiv.style.display = 'none';
        } else {
            enrollmentDiv.style.display = 'none';
            detailsDiv.style.display = 'block';
            
            document.getElementById('401kBalance').textContent = 
                `$${parseFloat(enrollment.current_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById('401kContributionRate').textContent = `${enrollment.contribution_percent}%`;
            document.getElementById('401kTotalContributed').textContent = 
                `$${parseFloat(enrollment.total_contributed || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById('401kEmployerMatch').textContent = 
                `$${parseFloat(enrollment.total_employer_match || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById('401kUpdatePercent').value = enrollment.contribution_percent;
            
            // Load history
            const history = await supabaseService.get401kContributions(enrollment.id);
            const historyDiv = document.getElementById('401kHistory');
            if (history.length === 0) {
                historyDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No contributions yet</div>';
            } else {
                historyDiv.innerHTML = history.map(contrib => `
                    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                        <div style="font-weight: 600;">${new Date(contrib.pay_period_start).toLocaleDateString()} - ${new Date(contrib.pay_period_end).toLocaleDateString()}</div>
                        <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
                            Employee: $${contrib.employee_contribution.toFixed(2)} • 
                            Match: $${contrib.employer_match.toFixed(2)} • 
                            Total: $${contrib.total_contribution.toFixed(2)}
                        </div>
                    </div>
                `).join('');
            }
        }
    }
    
    if (enrollment401kForm) {
        enrollment401kForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const employee = await getCurrentEmployee();
            if (!employee) return;
            
            const percent = parseFloat(document.getElementById('401kContributionPercent').value);
            const max = document.getElementById('401kMaxContribution').value ? parseFloat(document.getElementById('401kMaxContribution').value) : null;
            
            const result = await supabaseService.enroll401k(employee.id, percent, max);
            if (result.error) {
                alert(`❌ Enrollment failed: ${result.error}`);
                return;
            }
            
            alert('✅ Successfully enrolled in 401k plan!');
            await load401kUI();
        });
    }
    
    if (update401kForm) {
        update401kForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const employee = await getCurrentEmployee();
            if (!employee) return;
            
            const percent = parseFloat(document.getElementById('401kUpdatePercent').value);
            const result = await supabaseService.update401kContribution(employee.id, percent);
            if (result.error) {
                alert(`❌ Update failed: ${result.error}`);
                return;
            }
            
            alert('✅ Contribution percentage updated!');
            await load401kUI();
        });
    }
    
    if (pause401kBtn) {
        pause401kBtn.addEventListener('click', async () => {
            if (!confirm('Pause 401k contributions?')) return;
            const employee = await getCurrentEmployee();
            if (!employee) return;
            
            // Update status to paused
            const { error } = await supabaseService.client
                .from('employee_401k')
                .update({ status: 'paused' })
                .eq('employee_id', employee.id);
            
            if (error) {
                alert(`❌ Failed to pause: ${error.message}`);
                return;
            }
            
            alert('✅ Contributions paused');
            await load401kUI();
        });
    }
    
    // ==========================================
    // STOCK MARKET PLAN (SMP) MANAGEMENT
    // ==========================================
    
    const manageSMPBtn = document.getElementById('manageSMPBtn');
    const manageSMPModal = document.getElementById('manageSMPModal');
    const closeSMPModal = document.getElementById('closeSMPModal');
    const enrollmentSMPForm = document.getElementById('SMPEnrollmentForm');
    const updateSMPForm = document.getElementById('SMPUpdateForm');
    const pauseSMPBtn = document.getElementById('pauseSMPBtn');
    
    if (manageSMPBtn) {
        manageSMPBtn.addEventListener('click', async () => {
            manageSMPModal.style.display = 'block';
            await loadSMPUI();
        });
    }
    
    if (closeSMPModal) {
        closeSMPModal.addEventListener('click', () => {
            manageSMPModal.style.display = 'none';
        });
    }
    
    async function loadSMPUI() {
        const employee = await getCurrentEmployee();
        if (!employee) return;
        
        // Load stocks for dropdown
        const stocks = await supabaseService.getStockMarket();
        const stockSelect = document.getElementById('SMPStockSymbol');
        if (stockSelect) {
            stockSelect.innerHTML = '<option value="">Select a stock...</option>' +
                stocks.map(s => `<option value="${s.symbol}">${s.symbol} - ${s.company_name}</option>`).join('');
        }
        
        const enrollment = await supabaseService.getEmployeeSMP(employee.id);
        const enrollmentDiv = document.getElementById('SMPEnrollment');
        const detailsDiv = document.getElementById('SMPDetails');
        
        if (!enrollment) {
            enrollmentDiv.style.display = 'block';
            detailsDiv.style.display = 'none';
        } else {
            enrollmentDiv.style.display = 'none';
            detailsDiv.style.display = 'block';
            
            document.getElementById('SMPContributionRate').textContent = `${enrollment.contribution_percent}%`;
            document.getElementById('SMPUpdatePercent').value = enrollment.contribution_percent;
            
            // Get total shares and contributions
            const contributions = await supabaseService.getSMPContributions(enrollment.id);
            const totalShares = contributions.reduce((sum, c) => sum + parseFloat(c.shares_purchased), 0);
            const totalContributed = contributions.reduce((sum, c) => sum + parseFloat(c.contribution_amount), 0);
            
            document.getElementById('SMPTotalShares').textContent = totalShares.toFixed(4);
            document.getElementById('SMPTotalContributed').textContent = 
                `$${totalContributed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            
            // Get stock symbol from first contribution or use default
            const stockSymbol = contributions.length > 0 ? contributions[0].stock_symbol : 'N/A';
            document.getElementById('SMPStockSymbolDisplay').textContent = stockSymbol;
            
            // Load history
            const historyDiv = document.getElementById('SMPHistory');
            if (contributions.length === 0) {
                historyDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No purchases yet</div>';
            } else {
                historyDiv.innerHTML = contributions.map(contrib => `
                    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                        <div style="font-weight: 600;">${new Date(contrib.pay_period_start).toLocaleDateString()} - ${new Date(contrib.pay_period_end).toLocaleDateString()}</div>
                        <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
                            ${contrib.shares_purchased} shares of ${contrib.stock_symbol} @ $${contrib.purchase_price.toFixed(2)} • 
                            Total: $${contrib.contribution_amount.toFixed(2)}
                        </div>
                    </div>
                `).join('');
            }
        }
    }
    
    if (enrollmentSMPForm) {
        enrollmentSMPForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const employee = await getCurrentEmployee();
            if (!employee) return;
            
            const percent = parseFloat(document.getElementById('SMPContributionPercent').value);
            const stockSymbol = document.getElementById('SMPStockSymbol').value;
            const max = document.getElementById('SMPMaxContribution').value ? parseFloat(document.getElementById('SMPMaxContribution').value) : null;
            
            if (!stockSymbol) {
                alert('Please select a stock');
                return;
            }
            
            const result = await supabaseService.enrollSMP(employee.id, percent, stockSymbol, max);
            if (result.error) {
                alert(`❌ Enrollment failed: ${result.error}`);
                return;
            }
            
            alert('✅ Successfully enrolled in Stock Market Purchase Plan!');
            await loadSMPUI();
        });
    }
    
    if (updateSMPForm) {
        updateSMPForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const employee = await getCurrentEmployee();
            if (!employee) return;
            
            const percent = parseFloat(document.getElementById('SMPUpdatePercent').value);
            const result = await supabaseService.updateSMPContribution(employee.id, percent);
            if (result.error) {
                alert(`❌ Update failed: ${result.error}`);
                return;
            }
            
            alert('✅ Contribution percentage updated!');
            await loadSMPUI();
        });
    }
    
    if (pauseSMPBtn) {
        pauseSMPBtn.addEventListener('click', async () => {
            if (!confirm('Pause SMP contributions?')) return;
            const employee = await getCurrentEmployee();
            if (!employee) return;
            
            const { error } = await supabaseService.client
                .from('smp_enrollments')
                .update({ status: 'paused' })
                .eq('employee_id', employee.id);
            
            if (error) {
                alert(`❌ Failed to pause: ${error.message}`);
                return;
            }
            
            alert('✅ Contributions paused');
            await loadSMPUI();
        });
    }
    
    // Helper function to get current employee
    async function getCurrentEmployee() {
        const currentUser = await supabaseService.getCurrentUser();
        if (!currentUser) return null;
        
        const employees = await supabaseService.getEmployees();
        return employees?.find(e => e.user_id === currentUser.id);
    }
    
    const requestTimeOffBtn = document.getElementById('requestTimeOffBtn');
    const closeTimeOffModal = document.getElementById('closeTimeOffModal');
    const cancelTimeOffBtn = document.getElementById('cancelTimeOffBtn');
    const timeOffForm = document.getElementById('timeOffForm');
    
    // Open time off modal
    requestTimeOffBtn.addEventListener('click', async () => {
        timeOffModal.style.display = 'flex';
        
        // Set minimum date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('timeOffStartDate').min = today;
        document.getElementById('timeOffEndDate').min = today;
        
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('time off requests');
        }
        // Load existing time off requests
        await loadMyTimeOffRequests();
    });
    
    // Close modal
    closeTimeOffModal.addEventListener('click', () => {
        timeOffModal.style.display = 'none';
        timeOffForm.reset();
    });
    
    cancelTimeOffBtn.addEventListener('click', () => {
        timeOffModal.style.display = 'none';
        timeOffForm.reset();
    });
    
    // Close modal when clicking outside
    timeOffModal.addEventListener('click', (e) => {
        if (e.target === timeOffModal) {
            timeOffModal.style.display = 'none';
            timeOffForm.reset();
        }
    });
    
    // Submit time off request
    timeOffForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (typeof showFormLoadingScreen !== 'undefined') {
            showFormLoadingScreen('time off request');
        }
        
        if (!supabaseService.isReady()) {
            alert('Time off requests require an active connection');
            return;
        }
        
        const currentUser = await supabaseService.getCurrentUser();
        if (!currentUser) {
            alert('You must be logged in to submit a time off request');
            return;
        }
        
        // Get current employee
        const employee = await getCurrentEmployee();
        if (!employee) {
            alert('Could not find your employee record');
            return;
        }
        
        const startDate = document.getElementById('timeOffStartDate').value;
        const endDate = document.getElementById('timeOffEndDate').value;
        const reason = document.getElementById('timeOffReason').value.trim();
        
        // Validate dates
        if (new Date(endDate) < new Date(startDate)) {
            alert('End date cannot be before start date');
            return;
        }
        
        // Create time off request
        const request = {
            employee_id: employee.id,
            start_date: startDate,
            end_date: endDate,
            reason: reason,
            status: 'pending'
        };
        
        const submitBtn = timeOffForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Submitting...';
        
        const result = await supabaseService.createTimeOffRequest(request);
        
        submitBtn.disabled = false;
        submitBtn.textContent = '📤 Submit Request';
        
        if (result) {
            alert('Time off request submitted successfully!');
            timeOffForm.reset();
            await loadMyTimeOffRequests();
            
            // Show notification
            if (notificationSystem) {
                notificationSystem.addNotification(
                    'Time Off Request Submitted',
                    `Your request from ${startDate} to ${endDate} has been submitted for approval`,
                    'success'
                );
            }
        } else {
            alert('Failed to submit time off request. Please try again.');
        }
    });
    
    // Load employee's time off requests
    async function loadMyTimeOffRequests() {
        const listContainer = document.getElementById('myTimeOffRequestsList');
        
        if (!supabaseService.isReady()) {
            listContainer.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">Time off requests require an active connection</p>';
            return;
        }
        
        const employee = await getCurrentEmployee();
        if (!employee) {
            listContainer.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">Could not load your employee record</p>';
            return;
        }
        
        const requests = await supabaseService.getTimeOffRequests();
        
        if (!requests || requests.length === 0) {
            listContainer.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">No time off requests yet</p>';
            return;
        }
        
        // Filter to only this employee's requests
        const myRequests = requests.filter(r => r.employee_id === employee.id);
        
        if (myRequests.length === 0) {
            listContainer.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">No time off requests yet</p>';
            return;
        }
        
        // Sort by most recent first
        myRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        listContainer.innerHTML = myRequests.map(request => {
            const statusColors = {
                'pending': '#f59e0b',
                'approved': '#10b981',
                'denied': '#ef4444'
            };
            
            const statusIcons = {
                'pending': '⏳',
                'approved': '✅',
                'denied': '❌'
            };
            
            const startDate = new Date(request.start_date).toLocaleDateString();
            const endDate = new Date(request.end_date).toLocaleDateString();
            const requestDate = new Date(request.created_at).toLocaleDateString();
            
            return `
                <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                        <div>
                            <strong>${startDate} - ${endDate}</strong>
                            <div style="color: #64748b; font-size: 0.875rem; margin-top: 4px;">
                                Requested: ${requestDate}
                            </div>
                        </div>
                        <span style="background: ${statusColors[request.status]}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.875rem; font-weight: 500;">
                            ${statusIcons[request.status]} ${request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                    </div>
                    <div style="color: #374151; margin-top: 8px;">
                        <strong>Reason:</strong> ${request.reason}
                    </div>
                    ${request.admin_notes ? `
                        <div style="margin-top: 8px; padding: 8px; background: #f3f4f6; border-radius: 4px; font-size: 0.875rem;">
                            <strong>Admin Notes:</strong> ${request.admin_notes}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    // Load team members for calling
    async function loadTeamMembers() {
        const teamMembersList = document.getElementById('teamMembersList');
        if (!teamMembersList) return;

        try {
            // Get current employee to exclude from list
            const currentEmployee = await supabaseService.getCurrentEmployee();
            if (!currentEmployee) {
                teamMembersList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #6b7280;">Unable to load team members</div>';
                return;
            }

            // Get all employees
            const employees = await supabaseService.getEmployees();
            if (!employees || employees.length === 0) {
                teamMembersList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #6b7280;">No team members found</div>';
                return;
            }

            // Filter out current employee
            const otherEmployees = employees.filter(emp => emp.id !== currentEmployee.id);

            if (otherEmployees.length === 0) {
                teamMembersList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #6b7280;">No other team members</div>';
                return;
            }

            // Render team members with call buttons
            teamMembersList.innerHTML = otherEmployees.map(emp => {
                const initials = emp.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                return `
                    <div class="team-member-item" style="
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 12px;
                        margin-bottom: 8px;
                        background: var(--bg-secondary, #f8fafc);
                        border-radius: 8px;
                        border: 1px solid var(--border-light, #e2e8f0);
                        transition: all 0.2s ease;
                    " onmouseover="this.style.transform='translateX(2px)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)'" onmouseout="this.style.transform=''; this.style.boxShadow=''">
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                            <div style="
                                width: 40px;
                                height: 40px;
                                border-radius: 50%;
                                background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: white;
                                font-weight: 600;
                                font-size: 14px;
                                flex-shrink: 0;
                            ">${initials}</div>
                            <div style="min-width: 0; flex: 1;">
                                <div style="font-weight: 600; color: var(--text-primary, #1f2937); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${escapeHtml(emp.name)}
                                </div>
                                <div style="font-size: 12px; color: var(--text-secondary, #6b7280); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${escapeHtml(emp.role || 'Employee')}
                                </div>
                            </div>
                        </div>
                        <div class="team-member-call-buttons" id="callButtons-${emp.id}" style="display: flex; gap: 6px; flex-shrink: 0;"></div>
                    </div>
                `;
            }).join('');

            // Add call buttons using VOIP UI
            if (typeof voipUI !== 'undefined' && voipUI) {
                otherEmployees.forEach(emp => {
                    const callButtonsContainer = document.getElementById(`callButtons-${emp.id}`);
                    if (callButtonsContainer) {
                        voipUI.addCallButton(callButtonsContainer, emp);
                    }
                });
            } else {
                console.warn('VOIP UI not available for adding call buttons');
            }

        } catch (error) {
            console.error('Error loading team members:', error);
            teamMembersList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #6b7280;">Error loading team members</div>';
        }
    }

    // Helper function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});


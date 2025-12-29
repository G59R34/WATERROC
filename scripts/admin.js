// Admin Dashboard Script with Supabase Integration
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    // Mobile UI helpers (admin.html only)
    const isMobileAdmin = () => window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    const openMobileControls = () => document.body.classList.add('mobile-controls-open');
    const closeMobileControls = () => document.body.classList.remove('mobile-controls-open');
    
    // Initialize notification system if available
    if (typeof notificationSystem !== 'undefined') {
        await notificationSystem.init();
        setupNotificationPanel();
    }
    
    // Initialize announcement banner
    if (typeof announcementBanner !== 'undefined') {
        announcementBanner.init();
    }
    
    // Initialize Gantt Chart FIRST
    const ganttContainer = document.getElementById('ganttChart');
    if (!ganttContainer) {
        console.error('Gantt chart container not found!');
        // Don't return - continue with button setup even if Gantt fails
    }
    
    // Wait for GanttChart class to be available (in case scripts load asynchronously)
    const waitForGanttChart = async () => {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        while (typeof GanttChart === 'undefined' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        return typeof GanttChart !== 'undefined';
    };
    
    // Initialize Gantt Chart
    let gantt;
    try {
        // Wait for GanttChart to be available
        const isAvailable = await waitForGanttChart();
        
        if (!isAvailable) {
            console.error('GanttChart class is not defined after waiting. Make sure gantt.js is loaded before admin.js');
            gantt = null;
        } else if (ganttContainer) {
            gantt = new GanttChart('ganttChart', true);
            console.log('Gantt chart instance created');
        } else {
            console.warn('Gantt container not found, creating placeholder');
            gantt = null;
        }
    } catch (error) {
        console.error('Error initializing Gantt chart:', error);
        gantt = null; // Don't return - continue with rest of initialization
    }
    
    // Initialize context menu for Gantt chart
    let ganttContextMenu = null;
    if (typeof GanttContextMenu !== 'undefined' && gantt) {
        try {
            ganttContextMenu = new GanttContextMenu(gantt);
        } catch (error) {
            console.error('Error initializing Gantt context menu:', error);
        }
    } else if (!gantt) {
        console.warn('Gantt chart not available, skipping context menu initialization');
    }
    
    // Set up date inputs
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (startDateInput && endDateInput && gantt) {
        try {
            startDateInput.valueAsDate = gantt.startDate;
            endDateInput.valueAsDate = gantt.endDate;
        } catch (error) {
            console.error('Error setting date inputs:', error);
        }
    }
    
    // Make gantt globally accessible
    window.gantt = gantt;

    // Mobile admin UX: off-canvas menu + quick actions + friendlier default zoom
    (function setupMobileAdminUX() {
        const menuBtn = document.getElementById('mobileMenuBtn');
        const menuCloseBtn = document.getElementById('mobileMenuCloseBtn');
        const overlay = document.getElementById('mobileControlsOverlay');

        if (menuBtn) {
            menuBtn.addEventListener('click', () => openMobileControls());
        }
        if (menuCloseBtn) {
            menuCloseBtn.addEventListener('click', () => closeMobileControls());
        }
        if (overlay) {
            overlay.addEventListener('click', () => closeMobileControls());
        }

        // Wire quick actions to existing buttons (avoid duplicating logic)
        const wireProxyClick = (proxyId, targetId) => {
            const proxy = document.getElementById(proxyId);
            const target = document.getElementById(targetId);
            if (!proxy || !target) return;
            proxy.addEventListener('click', () => {
                closeMobileControls();
                target.click();
            });
        };

        wireProxyClick('mobileQuickAddTaskBtn', 'addTaskBtn');
        wireProxyClick('mobileQuickAddEmployeeBtn', 'addEmployeeBtn');
        wireProxyClick('mobileQuickSaveBtn', 'saveDataBtn');
        wireProxyClick('mobileQuickShiftsBtn', 'manageShiftsBtn');

        // Default to a more usable zoom on small screens (still user-changeable)
        const scaleSelector = document.getElementById('ganttScaleSelector');
        if (gantt && isMobileAdmin()) {
            try {
                // Week view shows something immediately without excessive horizontal panning.
                gantt.setZoomLevel('week');
                if (scaleSelector) scaleSelector.value = 'week';
            } catch (e) {
                console.warn('Mobile default zoom failed:', e);
            }
        }

        // If screen grows (rotate / resize), close the drawer to avoid stuck state
        window.addEventListener('resize', () => {
            if (!isMobileAdmin()) closeMobileControls();
        }, { passive: true });
    })();
    
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
        
        if (!supabaseService.isAdmin()) {
            alert('Access denied. Admin privileges required.');
            sessionStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        
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
        
        // Sync from Supabase AFTER gantt is initialized
        // Wait for gantt to be fully initialized before syncing
        const waitForGantt = async () => {
            if (!gantt) {
                console.warn('Gantt chart not available');
                return;
            }
            
            // Wait for initialization to complete (max 5 seconds)
            let attempts = 0;
            const maxAttempts = 50; // 50 * 100ms = 5 seconds
            while (!gantt._initialized && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (gantt._initialized) {
                try {
                    await syncFromSupabase();
                } catch (error) {
                    console.error('Error in initial syncFromSupabase:', error);
                }
            } else {
                console.warn('Gantt chart initialization timeout, attempting sync anyway');
                try {
                    await syncFromSupabase();
                } catch (error) {
                    console.error('Error in syncFromSupabase after timeout:', error);
                }
            }
        };
        
        // Start waiting for gantt initialization
        waitForGantt();
        
        // Ensure DO exceptions are created for today
        try {
            const today = new Date().toISOString().split('T')[0];
            console.log('🔧 Admin page: Ensuring DO exceptions for today:', today);
            await supabaseService.ensureDOExceptions(today);
        } catch (error) {
            console.error('Error ensuring DO exceptions on admin load:', error);
        }

        // Check for expired time off and restore employees to active
        try {
            await supabaseService.checkExpiredTimeOff();
        } catch (error) {
            console.error('Error checking expired time off on admin load:', error);
        }
    }
    
    // Make syncFromSupabase globally accessible for context menu
    window.syncFromSupabase = syncFromSupabase;
    
    // Sync data from Supabase
    async function syncFromSupabase() {
        if (!supabaseService.isReady()) return;
        
        const employees = await supabaseService.getEmployees();
        const tasks = await supabaseService.getTasksWithAcknowledgements();
        
        if (employees && tasks) {
            const data = {
                employees: employees.map(e => ({
                    id: e.id,
                    name: e.name,
                    role: e.role
                })),
                tasks: tasks.map(t => ({
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
                nextTaskId: Math.max(...tasks.map(t => t.id), 0) + 1
            };
            
            // Only update if data actually changed to prevent unnecessary re-renders
            const currentDataStr = JSON.stringify({
                employees: gantt ? gantt.data.employees : [],
                tasks: gantt ? gantt.data.tasks : []
            });
            const newDataStr = JSON.stringify({
                employees: data.employees,
                tasks: data.tasks
            });
            
            if (currentDataStr !== newDataStr) {
                localStorage.setItem('ganttData', JSON.stringify(data));
                if (gantt) {
                    gantt.data = data;
                    // Use requestAnimationFrame to make render smoother
                    requestAnimationFrame(async () => {
                        try {
                            await gantt.render();
                            console.log(`📋 Updated ${data.tasks.length} task(s) for ${data.employees.length} employee(s)`);
                        } catch (error) {
                            console.error('Error rendering Gantt after sync:', error);
                        }
                    });
                } else {
                    console.warn('Gantt chart not initialized, cannot render');
                }
            }
        }
    }
    
    // Auto-refresh from Supabase - less frequent to prevent visible flickering
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        let isRefreshing = false;
        
        // Check for overdue tasks immediately on load
        supabaseService.checkAndMarkOverdueTasks();
        
        setInterval(async () => {
            // Only sync if page is visible and not already refreshing
            if (supabaseService.isReady() && document.visibilityState === 'visible' && !isRefreshing) {
                isRefreshing = true;
                try {
                    // Check for overdue tasks and mark them
                    await supabaseService.checkAndMarkOverdueTasks();
                    
                    // Check for new acknowledgements if notification system is available
                    if (typeof notificationSystem !== 'undefined') {
                        const tasks = await supabaseService.getTasksWithAcknowledgements();
                        if (tasks) {
                            const totalAcks = tasks.reduce((sum, task) => sum + (task.acknowledgements?.length || 0), 0);
                            await notificationSystem.checkForNewAcknowledgements(totalAcks);
                        }
                    }
                    await syncFromSupabase();
                } finally {
                    isRefreshing = false;
                }
            }
        }, 30000); // Refresh every 30 seconds instead of 2 (less disruptive)
        
        console.log('🔄 Auto-refresh enabled (every 30 seconds)');
    }
    
    // Zoom controls for Gantt chart
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomResetBtn = document.getElementById('zoomResetBtn');
    const scaleSelector = document.getElementById('ganttScaleSelector');
    
    if (zoomInBtn && gantt) {
        zoomInBtn.addEventListener('click', function() {
            if (gantt) {
                gantt.zoomIn();
                // Update selector to match
                if (scaleSelector) {
                    scaleSelector.value = gantt.currentZoomLevel;
                }
            }
        });
    }
    
    if (zoomOutBtn && gantt) {
        zoomOutBtn.addEventListener('click', function() {
            if (gantt) {
                gantt.zoomOut();
                // Update selector to match
                if (scaleSelector) {
                    scaleSelector.value = gantt.currentZoomLevel;
                }
            }
        });
    }
    
    if (zoomResetBtn && gantt) {
        zoomResetBtn.addEventListener('click', function() {
            if (gantt) {
                gantt.resetZoom();
                // Update selector to match
                if (scaleSelector) {
                    scaleSelector.value = gantt.currentZoomLevel;
                }
            }
        });
    }
    
    // Scale selector dropdown
    if (scaleSelector && gantt) {
        scaleSelector.value = gantt.currentZoomLevel; // Set initial value
        scaleSelector.addEventListener('change', function() {
            if (gantt) {
                gantt.setZoomLevel(this.value);
            }
        });
    }
    
    // Analytics navigation
    const viewAnalyticsBtn = document.getElementById('viewAnalyticsBtn');
    if (viewAnalyticsBtn) {
        viewAnalyticsBtn.addEventListener('click', function() {
            if (typeof showPageLoadScreen !== 'undefined') {
                showPageLoadScreen();
                setTimeout(() => {
                    window.location.href = 'analytics.html';
                }, 100);
            } else {
                window.location.href = 'analytics.html';
            }
        });
    }
    
    // Employee Profiles navigation
    const manageProfilesBtn = document.getElementById('manageProfilesBtn');
    if (manageProfilesBtn) {
        manageProfilesBtn.addEventListener('click', function() {
            if (typeof showPageLoadScreen !== 'undefined') {
                showPageLoadScreen();
                setTimeout(() => {
                    window.location.href = 'profiles.html';
                }, 100);
            } else {
                window.location.href = 'profiles.html';
            }
        });
    }
    
    // Shift Scheduling navigation
    const manageShiftsBtn = document.getElementById('manageShiftsBtn');
    if (manageShiftsBtn) {
        manageShiftsBtn.addEventListener('click', function() {
            if (typeof showPageLoadScreen !== 'undefined') {
                showPageLoadScreen();
                setTimeout(() => {
                    window.location.href = 'shifts.html';
                }, 100);
            } else {
                window.location.href = 'shifts.html';
            }
        });
    }
    
    // Task Templates navigation
    const manageTaskTemplatesBtn = document.getElementById('manageTaskTemplatesBtn');
    if (manageTaskTemplatesBtn) {
        manageTaskTemplatesBtn.addEventListener('click', function() {
            if (typeof showPageLoadScreen !== 'undefined') {
                showPageLoadScreen();
                setTimeout(() => {
                    window.location.href = 'task-templates.html';
                }, 100);
            } else {
                window.location.href = 'task-templates.html';
            }
        });
    }
    
    // Exceptions & Absence navigation
    const manageExceptionsBtn = document.getElementById('manageExceptionsBtn');
    if (manageExceptionsBtn) {
        manageExceptionsBtn.addEventListener('click', function() {
            if (typeof showPageLoadScreen !== 'undefined') {
                showPageLoadScreen();
                setTimeout(() => {
                    window.location.href = 'exceptions.html';
                }, 100);
            } else {
                window.location.href = 'exceptions.html';
            }
        });
    }

    // ==========================================
    // PAYROLL MANAGEMENT
    // ==========================================

    // Payroll Hours Management
    const payrollHoursModal = document.getElementById('payrollHoursModal');
    const managePayrollHoursBtn = document.getElementById('managePayrollHoursBtn');
    const closePayrollHours = document.getElementById('closePayrollHours');
    const savePayrollHoursBtn = document.getElementById('savePayrollHoursBtn');
    const cancelPayrollHours = document.getElementById('cancelPayrollHours');

    if (managePayrollHoursBtn) {
        managePayrollHoursBtn.addEventListener('click', async function() {
            payrollHoursModal.style.display = 'block';
            await loadPayrollHoursUI();
        });
    }

    if (closePayrollHours) {
        closePayrollHours.addEventListener('click', function() {
            payrollHoursModal.style.display = 'none';
        });
    }

    if (cancelPayrollHours) {
        cancelPayrollHours.addEventListener('click', function() {
            payrollHoursModal.style.display = 'none';
        });
    }

    if (savePayrollHoursBtn) {
        savePayrollHoursBtn.addEventListener('click', async function() {
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('payroll hours');
            }

            const periodStart = document.getElementById('payrollPeriodStart').value;
            const periodEnd = document.getElementById('payrollPeriodEnd').value;

            if (!periodStart || !periodEnd) {
                alert('❌ Please select both start and end dates for the pay period');
                return;
            }

            try {
                const employees = await supabaseService.getEmployees() || [];
                const hoursInputs = document.querySelectorAll('#payrollHoursList input[type="number"][data-employee-id]');
                
                let savedCount = 0;
                for (const input of hoursInputs) {
                    const employeeId = parseInt(input.getAttribute('data-employee-id'));
                    const hours = parseFloat(input.value) || 0;
                    const hourlyRate = parseFloat(input.getAttribute('data-hourly-rate')) || null;
                    const notes = input.getAttribute('data-notes') || null;

                    if (hours > 0) {
                        const result = await supabaseService.setPayrollHours(
                            employeeId,
                            periodStart,
                            periodEnd,
                            hours,
                            hourlyRate,
                            notes
                        );
                        if (!result.error) {
                            savedCount++;
                        }
                    }
                }

                alert(`✅ Saved payroll hours for ${savedCount} employee(s)!`);
                payrollHoursModal.style.display = 'none';
            } catch (error) {
                console.error('Error saving payroll hours:', error);
                alert('❌ Failed to save payroll hours: ' + error.message);
            }
        });
    }

    async function loadPayrollHoursUI() {
        const list = document.getElementById('payrollHoursList');
        if (!list) return;

        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">Loading employees...</div>';

        try {
            const employees = await supabaseService.getEmployees() || [];
            
            if (employees.length === 0) {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No employees found</div>';
                return;
            }

            const periodStart = document.getElementById('payrollPeriodStart').value || new Date().toISOString().split('T')[0];
            const periodEnd = document.getElementById('payrollPeriodEnd').value || new Date().toISOString().split('T')[0];

            // Get existing payroll hours for this period
            const existingHours = await supabaseService.getPayrollHours(periodStart, periodEnd);

            list.innerHTML = employees.map(emp => {
                const existing = existingHours.find(h => h.employee_id === emp.id);
                const hours = existing ? existing.hours : 0;
                const hourlyRate = existing ? existing.hourly_rate : null;

                return `
                    <div style="display: flex; align-items: center; gap: 15px; padding: 15px; border-bottom: 1px solid var(--border-light, #e5e7eb);">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: var(--text-primary, #1f2937);">${emp.name}</div>
                            <div style="font-size: 12px; color: var(--text-secondary, #6b7280);">${emp.role}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <label style="font-size: 14px;">Hours:</label>
                            <input type="number" 
                                   data-employee-id="${emp.id}" 
                                   data-hourly-rate="${hourlyRate || ''}"
                                   data-notes=""
                                   value="${hours}" 
                                   min="0" 
                                   step="0.25" 
                                   style="width: 100px; padding: 8px; border: 1px solid var(--border-light, #e5e7eb); border-radius: 4px;">
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading payroll hours UI:', error);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc2626;">Error loading employees</div>';
        }
    }

    // Accountant Access Management
    const accountantAccessModal = document.getElementById('accountantAccessModal');
    const manageAccountantAccessBtn = document.getElementById('manageAccountantAccessBtn');
    const closeAccountantAccess = document.getElementById('closeAccountantAccess');
    const saveAccountantAccessBtn = document.getElementById('saveAccountantAccessBtn');
    const cancelAccountantAccess = document.getElementById('cancelAccountantAccess');

    if (manageAccountantAccessBtn) {
        manageAccountantAccessBtn.addEventListener('click', async function() {
            accountantAccessModal.style.display = 'block';
            await loadAccountantAccessUI();
        });
    }

    if (closeAccountantAccess) {
        closeAccountantAccess.addEventListener('click', function() {
            accountantAccessModal.style.display = 'none';
        });
    }

    if (cancelAccountantAccess) {
        cancelAccountantAccess.addEventListener('click', function() {
            accountantAccessModal.style.display = 'none';
        });
    }

    if (saveAccountantAccessBtn) {
        saveAccountantAccessBtn.addEventListener('click', async function() {
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('accountant access');
            }

            try {
                const employees = await supabaseService.getEmployees() || [];
                const checkboxes = document.querySelectorAll('#accountantAccessList input[type="checkbox"]');
                
                let savedCount = 0;
                for (const checkbox of checkboxes) {
                    const employeeId = parseInt(checkbox.getAttribute('data-employee-id'));
                    const canView = checkbox.checked;
                    const canProcess = checkbox.getAttribute('data-can-process') === 'true' ? checkbox.checked : false;

                    const result = await supabaseService.setAccountantAccess(
                        employeeId,
                        canView,
                        canProcess
                    );
                    if (!result.error) {
                        savedCount++;
                    }
                }

                alert(`✅ Saved accountant access for ${savedCount} employee(s)!`);
                accountantAccessModal.style.display = 'none';
            } catch (error) {
                console.error('Error saving accountant access:', error);
                alert('❌ Failed to save accountant access: ' + error.message);
            }
        });
    }

    async function loadAccountantAccessUI() {
        const list = document.getElementById('accountantAccessList');
        if (!list) return;

        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">Loading employees...</div>';

        try {
            const employees = await supabaseService.getEmployees() || [];
            const accessList = await supabaseService.getAccountantAccess();

            if (employees.length === 0) {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No employees found</div>';
                return;
            }

            list.innerHTML = employees.map(emp => {
                const access = accessList.find(a => a.employee_id === emp.id);
                const canView = access ? access.can_view : true; // Default to true
                const canProcess = access ? access.can_process : true; // Default to true

                return `
                    <div style="display: flex; align-items: center; gap: 15px; padding: 15px; border-bottom: 1px solid var(--border-light, #e5e7eb);">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: var(--text-primary, #1f2937);">${emp.name}</div>
                            <div style="font-size: 12px; color: var(--text-secondary, #6b7280);">${emp.role}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" 
                                       data-employee-id="${emp.id}" 
                                       data-can-process="true"
                                       ${canView ? 'checked' : ''}>
                                <span style="font-size: 14px;">Accountant Access</span>
                            </label>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading accountant access UI:', error);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc2626;">Error loading employees</div>';
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
    
    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
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
    }
    
    // Update date range
    const updateDateRangeBtn = document.getElementById('updateDateRange');
    if (updateDateRangeBtn) {
        updateDateRangeBtn.addEventListener('click', function() {
            if (typeof showDataLoadingScreen !== 'undefined') {
                showDataLoadingScreen('date range update');
            }
            if (!gantt) {
                alert('Gantt chart not initialized');
                return;
            }
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('date range', () => {
                    const newStart = new Date(startDateInput.value);
                    const newEnd = new Date(endDateInput.value);
                    
                    if (newStart > newEnd) {
                        alert('Start date must be before end date!');
                        return;
                    }
                    
                    gantt.setDateRange(newStart, newEnd);
                    if (startDateInput && endDateInput) {
                        startDateInput.valueAsDate = gantt.startDate;
                        endDateInput.valueAsDate = gantt.endDate;
                    }
                });
            } else {
                const newStart = new Date(startDateInput.value);
                const newEnd = new Date(endDateInput.value);
                
                if (newStart > newEnd) {
                    alert('Start date must be before end date!');
                    return;
                }
                
                gantt.setDateRange(newStart, newEnd);
                if (startDateInput && endDateInput) {
                    startDateInput.valueAsDate = gantt.startDate;
                    endDateInput.valueAsDate = gantt.endDate;
                }
            }
        });
    }
    
    // Reset view
    const resetViewBtn = document.getElementById('resetViewBtn');
    if (resetViewBtn) {
        resetViewBtn.addEventListener('click', function() {
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('view reset');
            }
            if (!gantt) {
                alert('Gantt chart not initialized');
                return;
            }
            const today = new Date();
            const start = new Date(today);
            start.setDate(today.getDate() - 7);
            
            const end = new Date(today);
            end.setDate(today.getDate() + 23);
            
            gantt.setDateRange(start, end);
            if (startDateInput && endDateInput) {
                startDateInput.valueAsDate = gantt.startDate;
                endDateInput.valueAsDate = gantt.endDate;
            }
        });
    }
    
    // Announcement Modal
    const announcementModal = document.getElementById('announcementModal');
    const sendAnnouncementBtn = document.getElementById('sendAnnouncementBtn');
    const announcementForm = document.getElementById('announcementForm');
    const cancelAnnouncementBtn = document.getElementById('cancelAnnouncementBtn');
    
    // Open announcement modal
    if (sendAnnouncementBtn && announcementModal) {
        sendAnnouncementBtn.addEventListener('click', function() {
            announcementModal.style.display = 'block';
            const titleInput = document.getElementById('announcementTitle');
            const messageInput = document.getElementById('announcementMessage');
            const priorityInput = document.getElementById('announcementPriority');
            if (titleInput) titleInput.value = '';
            if (messageInput) messageInput.value = '';
            if (priorityInput) priorityInput.value = 'normal';
        });
    }
    
    // Close announcement modal
    announcementModal.querySelectorAll('.close')[0].addEventListener('click', function() {
        announcementModal.style.display = 'none';
    });
    
    cancelAnnouncementBtn.addEventListener('click', function() {
        announcementModal.style.display = 'none';
    });
    
    // Submit announcement
    announcementForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const title = document.getElementById('announcementTitle').value;
        const message = document.getElementById('announcementMessage').value;
        const priority = document.getElementById('announcementPriority').value;
        
        if (!title || !message) {
            alert('Please fill in all fields');
            return;
        }
        
        // Show loading state
        const submitBtn = announcementForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        
        if (supabaseService.isReady()) {
            const result = await supabaseService.createAnnouncement(title, message, priority);
            
            if (result) {
                alert('✅ Announcement sent to all employees!');
                announcementModal.style.display = 'none';
                
                // Refresh announcement banner
                if (typeof announcementBanner !== 'undefined') {
                    await announcementBanner.loadAnnouncements();
                }
                
                // Add to notification system
                if (typeof notificationSystem !== 'undefined') {
                    notificationSystem.addNotification(
                        'announcement-sent',
                        `Your announcement "${title}" has been sent to all employees`
                    );
                }
            } else {
                alert('❌ Failed to send announcement. Please try again.');
            }
        } else {
            alert('❌ Announcements require Supabase connection');
        }
        
        // Reset button
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    });
    
    // Save data manually
    const saveDataBtn = document.getElementById('saveDataBtn');
    if (saveDataBtn) {
        saveDataBtn.addEventListener('click', function() {
            if (!gantt) {
                alert('Gantt chart not initialized');
                return;
            }
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('save', () => {
                    gantt.saveData();
                    
                    // Show success message
                    const btn = document.getElementById('saveDataBtn');
                    const originalText = btn.textContent;
                    btn.textContent = '✓ Saved!';
                    btn.style.background = '#10b981';
                    
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = '';
                    }, 2000);
                });
            } else {
                gantt.saveData();
                
                // Show success message
                const btn = document.getElementById('saveDataBtn');
                const originalText = btn.textContent;
                btn.textContent = '✓ Saved!';
                btn.style.background = '#10b981';
                
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '';
                }, 2000);
            }
        });
    }
    
    // Modal functionality
    const addEmployeeModal = document.getElementById('addEmployeeModal');
    const addTaskModal = document.getElementById('addTaskModal');
    const editTaskModal = document.getElementById('editTaskModal');
    
    const addEmployeeBtn = document.getElementById('addEmployeeBtn');
    const addTaskBtn = document.getElementById('addTaskBtn');
    
    const closeBtns = document.querySelectorAll('.close');
    
    // Open Add Employee Modal
    if (addEmployeeBtn) {
        addEmployeeBtn.addEventListener('click', async function() {
            if (addEmployeeModal) addEmployeeModal.style.display = 'block';
            if (typeof showDataLoadingScreen !== 'undefined') {
                showDataLoadingScreen('employee data');
            }
            await loadUsersForEmployeeModal();
        });
    }
    
    // Load users into the employee modal dropdown
    async function loadUsersForEmployeeModal() {
        const userSelect = document.getElementById('linkUserAccount');
        
        // Clear existing options except the first one
        while (userSelect.options.length > 1) {
            userSelect.remove(1);
        }
        
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            const { data: users, error } = await supabaseService.client
                .from('users')
                .select('id, username, email, full_name')
                .order('username');
            
            if (users && !error) {
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = `${user.full_name} (${user.username})`;
                    userSelect.appendChild(option);
                });
            }
        }
    }
    
    // Open Add Task Modal
    function openAddTaskModal(employeeId = null, date = null) {
        updateEmployeeDropdown();
        addTaskModal.style.display = 'block';
        
        // Reset "send to all" checkbox
        const sendToAllCheckbox = document.getElementById('taskSendToAll');
        const employeeGroup = document.getElementById('taskEmployeeGroup');
        const employeeSelect = document.getElementById('taskEmployee');
        
        sendToAllCheckbox.checked = false;
        employeeGroup.style.display = 'block';
        employeeSelect.required = true;
        
        // Pre-fill employee if provided (wait for dropdown to populate)
        if (employeeId && employeeSelect) {
            // Wait a bit for the dropdown to be populated
            setTimeout(() => {
                employeeSelect.value = employeeId;
                // Trigger change event to ensure value is set
                employeeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }, 100);
        }
        
        // Set dates
        if (date) {
            const dateObj = new Date(date);
            const startDateInput = document.getElementById('taskStart');
            const endDateInput = document.getElementById('taskEnd');
            
            if (startDateInput) {
                // Format date as YYYY-MM-DD
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                startDateInput.value = `${year}-${month}-${day}`;
            }
            
            if (endDateInput) {
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                endDateInput.value = `${year}-${month}-${day}`;
            }
        } else {
            const today = new Date();
            const startDateInput = document.getElementById('taskStart');
            const endDateInput = document.getElementById('taskEnd');
            
            if (startDateInput) {
                startDateInput.valueAsDate = today;
            }
            
            if (endDateInput) {
                const endDate = new Date(today);
                endDate.setDate(today.getDate() + 7);
                endDateInput.valueAsDate = endDate;
            }
        }
        
        // Set default times
        document.getElementById('taskStartTime').value = '09:00';
        document.getElementById('taskEndTime').value = '17:00';
    }
    
    // Make it globally accessible for context menu
    window.openAddTaskModal = openAddTaskModal;
    
    if (addTaskBtn) {
        console.log('Add Task button found, attaching listener');
        addTaskBtn.addEventListener('click', function() {
            console.log('Add Task button clicked!');
            if (!gantt) {
                alert('Gantt chart not initialized. Please refresh the page.');
                return;
            }
            openAddTaskModal();
            if (typeof showUILoadingScreen !== 'undefined') {
                showUILoadingScreen('task form');
            }
        });
    } else {
        console.error('Add Task button not found!');
    }
    
    // Toggle employee dropdown when "send to all" is checked
    document.getElementById('taskSendToAll')?.addEventListener('change', function(e) {
        const employeeGroup = document.getElementById('taskEmployeeGroup');
        const employeeSelect = document.getElementById('taskEmployee');
        
        if (e.target.checked) {
            employeeGroup.style.display = 'none';
            employeeSelect.required = false;
        } else {
            employeeGroup.style.display = 'block';
            employeeSelect.required = true;
        }
    });
    
    // Close modals
    closeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            addEmployeeModal.style.display = 'none';
            addTaskModal.style.display = 'none';
            editTaskModal.style.display = 'none';
            const hourlyModal = document.getElementById('hourlyGanttModal');
            const addHourlyModal = document.getElementById('addHourlyTaskModal');
            if (hourlyModal) hourlyModal.style.display = 'none';
            if (addHourlyModal) addHourlyModal.style.display = 'none';
        });
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target === addEmployeeModal) {
            addEmployeeModal.style.display = 'none';
        }
        if (e.target === addTaskModal) {
            addTaskModal.style.display = 'none';
        }
        if (e.target === editTaskModal) {
            editTaskModal.style.display = 'none';
        }
        const hourlyModal = document.getElementById('hourlyGanttModal');
        const addHourlyModal = document.getElementById('addHourlyTaskModal');
        if (e.target === hourlyModal) {
            if (currentHourlyGantt) {
                currentHourlyGantt.destroy();
                currentHourlyGantt = null;
            }
            hourlyModal.style.display = 'none';
        }
        if (e.target === addHourlyModal) {
            addHourlyModal.style.display = 'none';
        }
    });
    
    // Hourly Gantt Modal Setup
    setupHourlyGanttModal();
    
    // Add Employee Form
    const addEmployeeForm = document.getElementById('addEmployeeForm');
    if (addEmployeeForm) {
        addEmployeeForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!gantt) {
                alert('Gantt chart not initialized');
                return;
            }
            
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('employee', async () => {
                    const name = document.getElementById('employeeName').value;
                    const role = document.getElementById('employeeRole').value;
                    const userId = document.getElementById('linkUserAccount').value || null;
                    
                    // Add to Gantt chart
                    const employee = gantt.addEmployee(name, role);
                
                // If Supabase is enabled, sync to database with user_id
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    await supabaseService.addEmployee(name, role, userId);
                    await syncFromSupabase(); // Refresh from database
                }
                
                addEmployeeModal.style.display = 'none';
                e.target.reset();
                
                    const linkedMsg = userId ? ' and linked to user account' : '';
                    alert(`Employee ${name} added successfully${linkedMsg}!`);
                });
            } else {
                const name = document.getElementById('employeeName').value;
                const role = document.getElementById('employeeRole').value;
                const userId = document.getElementById('linkUserAccount').value || null;
                
                // Add to Gantt chart
                const employee = gantt.addEmployee(name, role);
                
                // If Supabase is enabled, sync to database with user_id
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    await supabaseService.addEmployee(name, role, userId);
                    await syncFromSupabase(); // Refresh from database
                }
                
                if (addEmployeeModal) addEmployeeModal.style.display = 'none';
                e.target.reset();
                
                const linkedMsg = userId ? ' and linked to user account' : '';
                alert(`Employee ${name} added successfully${linkedMsg}!`);
            }
        });
    }
    
    // Add Task Form
    const addTaskForm = document.getElementById('addTaskForm');
    if (addTaskForm)   {
        addTaskForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!gantt) {
                alert('Gantt chart not initialized');
                return;
            }
            
            const sendToAll = document.getElementById('taskSendToAll').checked;
            const employeeId = sendToAll ? null : parseInt(document.getElementById('taskEmployee').value);
            const name = document.getElementById('taskName').value;
            const startDate = document.getElementById('taskStart').value;
            const endDate = document.getElementById('taskEnd').value;
            const startTime = document.getElementById('taskStartTime').value.replace(':', '');
            const endTime = document.getElementById('taskEndTime').value.replace(':', '');
            const status = document.getElementById('taskStatus').value;
            
            // Validate dates
            if (new Date(startDate) > new Date(endDate)) {
                alert('Start date must be before end date!');
                return;
            }
            
            // Validate employee selection if not sending to all
            if (!sendToAll && !employeeId) {
                alert('Please select an employee or check "Send to all employees"');
                return;
            }
            
            // Get employees list
            const employees = gantt.getEmployees();
            
            if (employees.length === 0) {
                alert('No employees available. Please add employees first.');
                return;
            }
            
            // Determine which employees to assign the task to
            const targetEmployees = sendToAll ? employees : [employees.find(emp => emp.id === employeeId)];
            
            if (!sendToAll && !targetEmployees[0]) {
                alert('Selected employee not found.');
                return;
            }
            
            // Show loading state
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = sendToAll ? `Adding to ${targetEmployees.length} employees...` : 'Adding...';
            submitBtn.disabled = true;
            
            try {
            // Check for time off conflicts before adding tasks
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                const conflicts = [];
                for (const emp of targetEmployees) {
                    const hasConflict = await supabaseService.checkTimeOffConflict(emp.id, startDate, endDate);
                    if (hasConflict) {
                        conflicts.push(emp.name);
                    }
                }
                
                if (conflicts.length > 0) {
                    alert(`Cannot assign task: The following employee(s) have approved time off during this period:\n${conflicts.join(', ')}\n\nPlease adjust the task dates or select different employees.`);
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                    return;
                }
            }
            
                // Add tasks to local Gantt chart
                targetEmployees.forEach(emp => {
                    gantt.addTask(emp.id, name, startDate, endDate, status, startTime, endTime);
                });
                
                // Sync to Supabase if enabled
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    // Create tasks for all target employees
                    const taskPromises = targetEmployees.map(emp => 
                        supabaseService.addTask(emp.id, name, startDate, endDate, startTime, endTime, status)
                    );
                    
                    await Promise.all(taskPromises);
                    
                    // Refresh from database
                    await syncFromSupabase();
                }
                
                addTaskModal.style.display = 'none';
                e.target.reset();
                
                const successMessage = sendToAll 
                    ? `Task "${name}" added successfully to ${targetEmployees.length} employees!`
                    : `Task "${name}" added successfully!`;
                alert(successMessage);
            } catch (error) {
                console.error('Error adding task(s):', error);
                alert('Error adding task. Please try again.');
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
    });
    }
    
    // Edit Task Form
    const editTaskForm = document.getElementById('editTaskForm');
    if (editTaskForm) {
        editTaskForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (typeof showFormLoadingScreen !== 'undefined') {
            showFormLoadingScreen('task update', async () => {
                const taskId = parseInt(document.getElementById('editTaskId').value);
                const name = document.getElementById('editTaskName').value;
                const startDate = document.getElementById('editTaskStart').value;
                const endDate = document.getElementById('editTaskEnd').value;
                const startTime = document.getElementById('editTaskStartTime').value.replace(':', '');
                const endTime = document.getElementById('editTaskEndTime').value.replace(':', '');
                const status = document.getElementById('editTaskStatus').value;
                
                // Validate dates
                if (new Date(startDate) > new Date(endDate)) {
                    alert('Start date must be before end date!');
                    return;
                }
                
                // Update local Gantt chart
                gantt.updateTask(taskId, {
                    name: name,
                    startDate: startDate,
                    endDate: endDate,
                    startTime: startTime,
                    endTime: endTime,
                    status: status
                });
                
                // Sync to Supabase if enabled
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    const currentUser = await supabaseService.getCurrentUser();
                    await supabaseService.updateTask(taskId, {
                        name: name,
                        start_date: startDate,
                        end_date: endDate,
                        start_time: startTime,
                        end_time: endTime,
                        status: status,
                        updated_by: currentUser ? currentUser.id : null
                    });
                    
                    // Refresh from database
                    await syncFromSupabase();
                }
                
                editTaskModal.style.display = 'none';
                e.target.reset();
                
                alert('Task updated successfully!');
            });
        } else {
            if (!gantt) {
                alert('Gantt chart not initialized');
                return;
            }
            const taskId = parseInt(document.getElementById('editTaskId').value);
            const name = document.getElementById('editTaskName').value;
            const startDate = document.getElementById('editTaskStart').value;
            const endDate = document.getElementById('editTaskEnd').value;
            const startTime = document.getElementById('editTaskStartTime').value.replace(':', '');
            const endTime = document.getElementById('editTaskEndTime').value.replace(':', '');
            const status = document.getElementById('editTaskStatus').value;
            
            // Validate dates
            if (new Date(startDate) > new Date(endDate)) {
                alert('Start date must be before end date!');
                return;
            }
            
            // Update local Gantt chart
            gantt.updateTask(taskId, {
                name: name,
                startDate: startDate,
                endDate: endDate,
                startTime: startTime,
                endTime: endTime,
                status: status
            });
            
            // Sync to Supabase if enabled
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                const currentUser = await supabaseService.getCurrentUser();
                await supabaseService.updateTask(taskId, {
                    name: name,
                    start_date: startDate,
                    end_date: endDate,
                    start_time: startTime,
                    end_time: endTime,
                    status: status,
                    updated_by: currentUser ? currentUser.id : null
                });
                
                // Refresh from database
                await syncFromSupabase();
            }
            
            editTaskModal.style.display = 'none';
            this.reset();
            
            alert('Task updated successfully!');
        }
    });
    }
    
    // Delete Task
    const deleteTaskBtn = document.getElementById('deleteTaskBtn');
    if (deleteTaskBtn) {
        deleteTaskBtn.addEventListener('click', async function() {
            const taskId = parseInt(document.getElementById('editTaskId').value);
            
            if (!taskId || isNaN(taskId)) {
                alert('Error: Invalid task ID');
                return;
            }
            
            if (confirm('Are you sure you want to delete this task?')) {
                console.log('🗑️ Deleting task ID:', taskId);
                
                try {
                    // Delete from Supabase first
                    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                        const result = await supabaseService.deleteTask(taskId);
                        console.log('Supabase delete result:', result);
                        
                        // Refresh from database
                        await syncFromSupabase();
                    }
                    
                    // Delete from local Gantt chart
                    if (gantt) {
                        await gantt.deleteTask(taskId);
                    }
                    
                    editTaskModal.style.display = 'none';
                    document.getElementById('editTaskForm').reset();
                    
                    alert('✅ Task deleted successfully!');
                } catch (error) {
                    console.error('Error deleting task:', error);
                    alert('❌ Failed to delete task: ' + error.message);
                }
            }
        });
    }
    
    // Override task click handler
    if (gantt) {
        gantt.onTaskClick = async function(task) {
        const employee = this.data.employees.find(e => e.id === task.employeeId);
        
        // Populate edit form
        document.getElementById('editTaskId').value = task.id;
        document.getElementById('editTaskName').value = task.name;
        document.getElementById('editTaskStart').value = task.startDate;
        document.getElementById('editTaskEnd').value = task.endDate;
        
        // Format time for input (HHMM to HH:MM)
        const startTime = task.startTime || '0000';
        const endTime = task.endTime || '2359';
        document.getElementById('editTaskStartTime').value = 
            `${startTime.substring(0, 2)}:${startTime.substring(2, 4)}`;
        document.getElementById('editTaskEndTime').value = 
            `${endTime.substring(0, 2)}:${endTime.substring(2, 4)}`;
        
        document.getElementById('editTaskStatus').value = task.status;
        
        // Load and display acknowledgements
        await loadTaskAcknowledgements(task.id);
        
        // Load and display messages
        await loadAdminTaskMessages(task.id);
        
        // Setup admin message sending
        setupAdminMessageSending(task.id);
        
        // Show modal
        editTaskModal.style.display = 'block';
    };
    }
    
    // Load task acknowledgements
    async function loadTaskAcknowledgements(taskId) {
        const ackList = document.getElementById('ackList');
        ackList.innerHTML = '<div class="ack-empty">Loading...</div>';
        
        if (!supabaseService.isReady()) {
            ackList.innerHTML = '<div class="ack-empty">Acknowledgements require Supabase</div>';
            return;
        }
        
        const acks = await supabaseService.getTaskAcknowledgements(taskId);
        
        if (!acks || acks.length === 0) {
            ackList.innerHTML = '<div class="ack-empty">No acknowledgements yet</div>';
            return;
        }
        
        ackList.innerHTML = acks.map(ack => {
            const date = new Date(ack.acknowledged_at);
            const timeStr = date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <div class="ack-item">
                    <span class="ack-icon">✓</span>
                    <span class="ack-user">${ack.user.full_name || ack.user.username}</span>
                    <span class="ack-time">${timeStr}</span>
                </div>
            `;
        }).join('');
    }
    
    // Helper function to update employee dropdown
    function updateEmployeeDropdown() {
        if (!gantt) return;
        const employees = gantt.getEmployees();
        const select = document.getElementById('taskEmployee');
        
        select.innerHTML = '';
        
        if (employees.length === 0) {
            select.innerHTML = '<option value="">No employees available</option>';
            return;
        }
        
        employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.id;
            option.textContent = `${emp.name} - ${emp.role}`;
            select.appendChild(option);
        });
    }

    // Handle employee deletion (make it globally accessible)
    window.handleDeleteEmployee = async function(employeeId, employeeName) {
        if (!employeeId || !employeeName) {
            console.error('Invalid employee data for deletion');
            return;
        }

        // Double confirmation for safety
        const confirm1 = confirm(`⚠️ WARNING: Are you sure you want to delete "${employeeName}"?\n\nThis will permanently delete:\n- All tasks assigned to this employee\n- All shifts for this employee\n- All related records\n\nThis action CANNOT be undone!`);
        
        if (!confirm1) return;

        const confirm2 = confirm(`⚠️ FINAL CONFIRMATION:\n\nDelete "${employeeName}" permanently?\n\nType "DELETE" in the next prompt to confirm.`);
        
        if (!confirm2) return;

        const confirmText = prompt(`Type "DELETE" to confirm deletion of "${employeeName}":`);
        
        if (confirmText !== 'DELETE') {
            alert('Deletion cancelled. You must type "DELETE" exactly to confirm.');
            return;
        }

        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('delete employee', async () => {
                // Show loading state
                const deleteBtn = document.querySelector(`[data-employee-id="${employeeId}"]`);
                if (deleteBtn) {
                    deleteBtn.disabled = true;
                    deleteBtn.textContent = '...';
                }

                try {
                    if (!supabaseService || !supabaseService.isReady()) {
                        alert('Supabase is not available. Cannot delete employee.');
                        return;
                    }

                    // Check if user is admin
                    const isAdmin = await supabaseService.isAdmin();
                    if (!isAdmin) {
                        alert('Only admins can delete employees.');
                        return;
                    }

                    // Delete the employee
                    const success = await supabaseService.deleteEmployee(employeeId);
                    
                    if (success) {
                        // Remove from Gantt chart
                        if (gantt) {
                            gantt.removeEmployee(employeeId);
                        }
                        
                        // Sync from Supabase to refresh data
                        await syncFromSupabase();
                        
                        // Update employee dropdown
                        updateEmployeeDropdown();
                        
                        alert(`✅ Employee "${employeeName}" has been deleted successfully.`);
                    } else {
                        alert(`❌ Failed to delete employee "${employeeName}". Please check the console for errors.`);
                    }
                } catch (error) {
                    console.error('Error in handleDeleteEmployee:', error);
                    alert(`❌ Error deleting employee: ${error.message || 'Unknown error'}`);
                } finally {
                    // Restore button state
                    if (deleteBtn) {
                        deleteBtn.disabled = false;
                        deleteBtn.textContent = '×';
                    }
                }
            });
        } else {
            // Fallback if loading screen not available
            try {
                if (!supabaseService || !supabaseService.isReady()) {
                    alert('Supabase is not available. Cannot delete employee.');
                    return;
                }

                const isAdmin = await supabaseService.isAdmin();
                if (!isAdmin) {
                    alert('Only admins can delete employees.');
                    return;
                }

                const success = await supabaseService.deleteEmployee(employeeId);
                
                if (success) {
                    if (gantt) {
                        gantt.removeEmployee(employeeId);
                    }
                    await syncFromSupabase();
                    updateEmployeeDropdown();
                    alert(`✅ Employee "${employeeName}" has been deleted successfully.`);
                } else {
                    alert(`❌ Failed to delete employee "${employeeName}". Please check the console for errors.`);
                }
            } catch (error) {
                console.error('Error in handleDeleteEmployee:', error);
                alert(`❌ Error deleting employee: ${error.message || 'Unknown error'}`);
            }
        }
    };
    
    // Load task messages for admin
    async function loadAdminTaskMessages(taskId) {
        const messagesList = document.getElementById('taskMessagesList');
        
        if (!supabaseService.isReady()) {
            messagesList.innerHTML = '<p class="messages-empty">Messages are not available offline</p>';
            return;
        }
        
        const messages = await supabaseService.getTaskMessages(taskId);
        
        if (!messages || messages.length === 0) {
            messagesList.innerHTML = '<p class="messages-empty">No messages yet.</p>';
            return;
        }
        
        messagesList.innerHTML = messages.map(msg => {
            const isFromAdmin = msg.is_from_admin;
            const author = msg.user?.full_name || 'Unknown';
            const time = new Date(msg.created_at).toLocaleString();
            
            return `
                <div class="message-item ${isFromAdmin ? 'from-admin' : 'from-employee'}">
                    <div class="message-header">
                        <span class="message-author">${isFromAdmin ? '👨‍💼 Admin' : '👤 Employee'}: ${author}</span>
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
    
    // Setup admin message sending
    function setupAdminMessageSending(taskId) {
        const messageInput = document.getElementById('adminMessageInput');
        const sendBtn = document.getElementById('sendAdminMessageBtn');
        
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
            
            newSendBtn.disabled = true;
            newSendBtn.textContent = 'Sending...';
            
            const result = await supabaseService.sendTaskMessage(taskId, message, true);
            
            if (result) {
                messageInput.value = '';
                await loadAdminTaskMessages(taskId);
                
                // Show success notification
                if (notificationSystem) {
                    notificationSystem.addNotification(
                        'Reply sent',
                        'Your message has been sent to the employee',
                        'success'
                    );
                }
            } else {
                alert('Failed to send message. Please try again.');
            }
            
            newSendBtn.disabled = false;
            newSendBtn.textContent = 'Send Reply';
        });
        
        // Allow Enter key to send (Shift+Enter for new line)
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                newSendBtn.click();
            }
        });
    }
    
    // Hourly Gantt Modal Functions
    function setupHourlyGanttModal() {
        const hourlyModal = document.getElementById('hourlyGanttModal');
        const addHourlyModal = document.getElementById('addHourlyTaskModal');
        
        // Make day headers clickable to open hourly view
        document.addEventListener('click', (e) => {
            // Check if clicked element or its parent is a day header
            let target = e.target;
            
            // Traverse up to find gantt-day-header
            while (target && !target.classList.contains('gantt-day-header')) {
                target = target.parentElement;
                // Stop if we've gone too far up
                if (target && target.classList.contains('gantt-header')) {
                    break;
                }
            }
            
            if (target && target.classList.contains('gantt-day-header')) {
                const dateStr = target.dataset.date;
                if (dateStr) {
                    openHourlyGantt(dateStr);
                }
            }
        });
        
        // Close hourly gantt modal
        document.getElementById('closeHourlyGantt')?.addEventListener('click', () => {
            if (currentHourlyGantt) {
                currentHourlyGantt.destroy();
                currentHourlyGantt = null;
            }
            hourlyModal.style.display = 'none';
        });
        
        // Open add hourly task modal
        document.getElementById('addHourlyTaskBtn')?.addEventListener('click', () => {
            if (currentHourlyGantt) {
                populateHourlyTaskEmployees();
                addHourlyModal.style.display = 'block';
            }
        });
        
        // Close add hourly task modal
        document.getElementById('closeAddHourlyTask')?.addEventListener('click', () => {
            addHourlyModal.style.display = 'none';
        });
        
        // Add hourly task form submission
        document.getElementById('addHourlyTaskForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('hourly task', async () => {
                    await addHourlyTask();
                });
            } else {
                await addHourlyTask();
            }
        });
    }
    
    // Helper function to parse date string as local date (not UTC)
    function parseLocalDate(dateStr) {
        // Parse YYYY-MM-DD format as local date
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
            const day = parseInt(parts[2], 10);
            return new Date(year, month, day);
        }
        // Fallback to regular Date parsing
        return new Date(dateStr);
    }
    
    function openHourlyGantt(dateStr) {
        const hourlyModal = document.getElementById('hourlyGanttModal');
        const titleEl = document.getElementById('hourlyGanttTitle');
        const date = parseLocalDate(dateStr);
        
        // Open modal first
        hourlyModal.style.display = 'block';
        
        titleEl.textContent = `Hourly Schedule - ${date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        })}`;
        
        // Show loading screen while rendering
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('hourly schedule');
        }
        
        // Create or update hourly gantt (this will render asynchronously)
        currentHourlyGantt = new HourlyGanttChart('hourlyGanttChart', dateStr, true);
        
        // Initialize context menu for hourly Gantt chart after a short delay
        setTimeout(() => {
            if (typeof HourlyGanttContextMenu !== 'undefined') {
                // Remove existing context menu if it exists
                const existingMenu = document.getElementById('hourlyGanttContextMenu');
                if (existingMenu) {
                    existingMenu.remove();
                }
                
                // Create new context menu
                if (currentHourlyGantt) {
                    window.hourlyGanttContextMenu = new HourlyGanttContextMenu(currentHourlyGantt);
                }
            }
        }, 100);
    }
    
    function populateHourlyTaskEmployees() {
        const select = document.getElementById('hourlyTaskEmployee');
        const ganttData = localStorage.getItem('ganttData');
        
        // Clear existing options except first
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        if (ganttData) {
            const data = JSON.parse(ganttData);
            data.employees.forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.id;
                option.textContent = emp.name;
                select.appendChild(option);
            });
        }
    }
    
    async function addHourlyTask() {
        const employeeId = parseInt(document.getElementById('hourlyTaskEmployee').value);
        const name = document.getElementById('hourlyTaskName').value;
        const category = document.getElementById('hourlyTaskCategory').value;
        const startTime = document.getElementById('hourlyTaskStartTime').value;
        const endTime = document.getElementById('hourlyTaskEndTime').value;
        const status = document.getElementById('hourlyTaskStatus').value;
        
        if (!employeeId || !name || !category || !startTime || !endTime) {
            alert('Please fill in all fields');
            return;
        }
        
        // Validate times
        if (startTime >= endTime) {
            alert('Start time must be before end time');
            return;
        }
        
        if (currentHourlyGantt) {
            await currentHourlyGantt.addTask(employeeId, name, startTime, endTime, status, category);
            document.getElementById('addHourlyTaskModal').style.display = 'none';
            document.getElementById('addHourlyTaskForm').reset();
            alert('✅ Hourly task added successfully!');
        }
    }
    
    // Global functions for hourly gantt callbacks
    window.openHourlyTaskModal = function(employeeId, hourOrWorkArea = null, workAreaOrStartTime = null, endTime = null) {
        populateHourlyTaskEmployees();
        
        if (employeeId) {
            document.getElementById('hourlyTaskEmployee').value = employeeId;
        }
        
        // Handle both old format (employeeId, hour, workArea) and new format (employeeId, workArea, startTime, endTime)
        if (typeof hourOrWorkArea === 'number') {
            // Old format: openHourlyTaskModal(employeeId, hour, workArea)
            const hour = hourOrWorkArea;
            const workArea = workAreaOrStartTime;
            document.getElementById('hourlyTaskStartTime').value = `${String(hour).padStart(2, '0')}:00`;
            document.getElementById('hourlyTaskEndTime').value = `${String(hour + 1).padStart(2, '0')}:00`;
            if (workArea) {
                document.getElementById('hourlyTaskCategory').value = workArea;
            }
        } else {
            // New format: openHourlyTaskModal(employeeId, workArea, startTime, endTime)
            const workArea = hourOrWorkArea;
            const startTime = workAreaOrStartTime;
            if (startTime) {
                document.getElementById('hourlyTaskStartTime').value = startTime;
            }
            if (endTime) {
                document.getElementById('hourlyTaskEndTime').value = endTime;
            }
            if (workArea) {
                document.getElementById('hourlyTaskCategory').value = workArea;
            }
        }
        
        document.getElementById('addHourlyTaskModal').style.display = 'block';
    };
    
    window.editHourlyTask = function(task) {
        console.log('Edit task function called with:', task);
        
        if (!task) {
            console.error('No task provided to editHourlyTask');
            alert('Error: No task data provided');
            return;
        }
        
        // Handle both Supabase format (start_time) and old format (startTime)
        const startTime = task.start_time || task.startTime;
        const endTime = task.end_time || task.endTime;
        const workArea = task.work_area || task.workArea;
        
        console.log('Task data:', { id: task.id, name: task.name, startTime, endTime, workArea });
        
        // Check if modal exists
        const modal = document.getElementById('editHourlyTaskModal');
        if (!modal) {
            console.error('editHourlyTaskModal element not found!');
            alert('Error: Task editor modal not found. Please refresh the page.');
            return;
        }
        
        // Populate the form
        const idField = document.getElementById('editHourlyTaskId');
        const nameField = document.getElementById('editHourlyTaskName');
        const categoryField = document.getElementById('editHourlyTaskCategory');
        const startTimeField = document.getElementById('editHourlyTaskStartTime');
        const endTimeField = document.getElementById('editHourlyTaskEndTime');
        const statusField = document.getElementById('editHourlyTaskStatus');
        
        if (!idField || !nameField || !categoryField || !startTimeField || !endTimeField || !statusField) {
            console.error('One or more form fields not found:', {
                idField: !!idField,
                nameField: !!nameField,
                categoryField: !!categoryField,
                startTimeField: !!startTimeField,
                endTimeField: !!endTimeField,
                statusField: !!statusField
            });
            alert('Error: Task editor form fields not found. Please refresh the page.');
            return;
        }
        
        idField.value = task.id;
        nameField.value = task.name || '';
        categoryField.value = workArea || 'other';
        startTimeField.value = startTime ? startTime.substring(0, 5) : '09:00';
        endTimeField.value = endTime ? endTime.substring(0, 5) : '17:00';
        statusField.value = task.status || 'pending';
        
        console.log('Form populated, showing modal');
        
        // Show the modal
        modal.style.display = 'block';
        console.log('Modal should now be visible');
    };
    
    // Edit Shift Modal
    window.openEditShiftModal = function(employeeId, employeeName, shift, date) {
        console.log('Opening edit shift modal:', { employeeId, employeeName, shift, date });
        
        document.getElementById('editShiftEmployeeId').value = employeeId;
        document.getElementById('editShiftEmployeeName').value = employeeName;
        document.getElementById('editShiftDate').value = date;
        document.getElementById('editShiftId').value = shift ? shift.id : '';
        document.getElementById('editShiftStartTime').value = shift ? shift.start_time.substring(0, 5) : '09:00';
        document.getElementById('editShiftEndTime').value = shift ? shift.end_time.substring(0, 5) : '17:00';
        
        // Show/hide delete button based on whether shift exists
        const deleteBtn = document.getElementById('deleteShiftBtn');
        if (deleteBtn) {
            deleteBtn.style.display = shift ? 'inline-block' : 'none';
        }
        
        document.getElementById('editShiftModal').style.display = 'block';
    };
    
    // Edit Shift Form Submit
    document.getElementById('editShiftForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateShift();
    });
    
    document.getElementById('closeEditShift')?.addEventListener('click', () => {
        document.getElementById('editShiftModal').style.display = 'none';
    });
    
    document.getElementById('cancelEditShift')?.addEventListener('click', () => {
        document.getElementById('editShiftModal').style.display = 'none';
    });
    
    // Delete Shift Button
    document.getElementById('deleteShiftBtn')?.addEventListener('click', async function() {
        const shiftId = parseInt(document.getElementById('editShiftId').value);
        
        if (!shiftId || isNaN(shiftId)) {
            alert('Error: No shift selected to delete');
            return;
        }
        
        if (confirm('Are you sure you want to delete this shift?')) {
            try {
                const result = await supabaseService.deleteEmployeeShift(shiftId);
                
                if (result) {
                    document.getElementById('editShiftModal').style.display = 'none';
                    
                    // Refresh hourly gantt if open
                    if (currentHourlyGantt) {
                        await currentHourlyGantt.render();
                    }
                    
                    // Refresh main Gantt chart
                    if (typeof syncFromSupabase === 'function') {
                        await syncFromSupabase();
                    }
                    
                    alert('✅ Shift deleted successfully!');
                } else {
                    alert('❌ Failed to delete shift');
                }
            } catch (error) {
                console.error('Error deleting shift:', error);
                alert('❌ Failed to delete shift: ' + error.message);
            }
        }
    });
    
    // Edit Hourly Task Modal handlers
    document.getElementById('closeEditHourlyTask')?.addEventListener('click', () => {
        document.getElementById('editHourlyTaskModal').style.display = 'none';
    });
    
    document.getElementById('cancelEditHourlyTask')?.addEventListener('click', () => {
        document.getElementById('editHourlyTaskModal').style.display = 'none';
    });
    
    document.getElementById('editHourlyTaskForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (typeof showFormLoadingScreen !== 'undefined') {
            showFormLoadingScreen('task update', async () => {
                await saveHourlyTask();
            });
        } else {
            await saveHourlyTask();
        }
    });
    
    document.getElementById('deleteHourlyTaskBtn')?.addEventListener('click', async () => {
        const taskId = parseInt(document.getElementById('editHourlyTaskId')?.value);
        
        if (!taskId || isNaN(taskId)) {
            alert('Error: Invalid task ID');
            return;
        }
        
        if (confirm('Are you sure you want to delete this task?')) {
            await deleteHourlyTask();
        }
    });
    
    async function saveHourlyTask() {
        const taskId = parseInt(document.getElementById('editHourlyTaskId').value);
        const name = document.getElementById('editHourlyTaskName').value;
        const category = document.getElementById('editHourlyTaskCategory').value;
        const startTime = document.getElementById('editHourlyTaskStartTime').value;
        const endTime = document.getElementById('editHourlyTaskEndTime').value;
        const status = document.getElementById('editHourlyTaskStatus').value;
        
        if (!supabaseService || !supabaseService.isReady()) {
            alert('Supabase not connected');
            return;
        }
        
        try {
            await supabaseService.updateHourlyTask(taskId, {
                name,
                work_area: category,
                start_time: startTime,
                end_time: endTime,
                status
            });
            
            // Close modal
            document.getElementById('editHourlyTaskModal').style.display = 'none';
            
            // Refresh hourly gantt if open
            if (currentHourlyGantt) {
                await currentHourlyGantt.render();
            }
            
            alert('✅ Task updated successfully!');
        } catch (error) {
            console.error('Error updating task:', error);
            alert('❌ Failed to update task: ' + error.message);
        }
    }
    
    async function deleteHourlyTask() {
        const taskIdField = document.getElementById('editHourlyTaskId');
        if (!taskIdField) {
            alert('Error: Task ID field not found');
            return;
        }
        
        const taskId = parseInt(taskIdField.value);
        
        if (!taskId || isNaN(taskId)) {
            alert('Error: Invalid task ID');
            return;
        }
        
        console.log('Attempting to delete hourly task with ID:', taskId);
        
        if (!supabaseService || !supabaseService.isReady()) {
            alert('❌ Supabase not connected');
            return;
        }
        
        try {
            console.log('Calling supabaseService.deleteHourlyTask with ID:', taskId);
            const result = await supabaseService.deleteHourlyTask(taskId);
            console.log('Delete result:', result);
            
            // Close modal
            const modal = document.getElementById('editHourlyTaskModal');
            if (modal) {
                modal.style.display = 'none';
            }
            
            // Refresh hourly gantt if open
            if (currentHourlyGantt) {
                console.log('Re-rendering hourly gantt...');
                await currentHourlyGantt.render();
            }
            
            alert('✅ Task deleted successfully!');
        } catch (error) {
            console.error('Error deleting hourly task:', error);
            alert('❌ Failed to delete task: ' + (error.message || error));
        }
    }
    
    async function updateShift() {
        const employeeId = parseInt(document.getElementById('editShiftEmployeeId').value);
        const date = document.getElementById('editShiftDate').value;
        const shiftId = document.getElementById('editShiftId').value;
        const startTime = document.getElementById('editShiftStartTime').value + ':00';
        const endTime = document.getElementById('editShiftEndTime').value + ':00';
        
        if (!supabaseService || !supabaseService.isReady()) {
            alert('Supabase not connected');
            return;
        }
        
        try {
            if (shiftId) {
                // Update existing shift
                await supabaseService.updateEmployeeShift(parseInt(shiftId), {
                    start_time: startTime,
                    end_time: endTime
                });
                alert('✅ Shift time updated successfully!');
            } else {
                // Create new shift
                await supabaseService.createEmployeeShift({
                    employee_id: employeeId,
                    shift_date: date,
                    start_time: startTime,
                    end_time: endTime
                });
                alert('✅ New shift created successfully!');
            }
            
            document.getElementById('editShiftModal').style.display = 'none';
            
            // Refresh hourly gantt if open
            if (currentHourlyGantt) {
                await currentHourlyGantt.render();
            }
            
            // Refresh main Gantt chart if available
            if (typeof syncFromSupabase === 'function') {
                await syncFromSupabase();
            }
        } catch (error) {
            console.error('Error updating shift:', error);
            alert('❌ Failed to update shift: ' + error.message);
        }
    }

    // ==========================================
    // STOCK MANAGEMENT
    // ==========================================
    
    const stockManagementModal = document.getElementById('stockManagementModal');
    const manageStocksBtn = document.getElementById('manageStocksBtn');
    const closeStockManagement = document.getElementById('closeStockManagement');
    const cancelStockManagement = document.getElementById('cancelStockManagement');
    const addStockForm = document.getElementById('addStockForm');
    const addRealStockForm = document.getElementById('addRealStockForm');
    const addSimulatedStockForm = document.getElementById('addSimulatedStockForm');
    const addRealStockTab = document.getElementById('addRealStockTab');
    const addSimulatedStockTab = document.getElementById('addSimulatedStockTab');
    const addRealStockFormElement = document.getElementById('addRealStockFormElement');
    
    // Tab switching
    if (addRealStockTab && addSimulatedStockTab) {
        addRealStockTab.addEventListener('click', () => {
            addRealStockForm.style.display = 'block';
            addSimulatedStockForm.style.display = 'none';
            addRealStockTab.className = 'btn-primary';
            addSimulatedStockTab.className = 'btn-secondary';
        });
        
        addSimulatedStockTab.addEventListener('click', () => {
            addRealStockForm.style.display = 'none';
            addSimulatedStockForm.style.display = 'block';
            addRealStockTab.className = 'btn-secondary';
            addSimulatedStockTab.className = 'btn-primary';
        });
    }
    
    if (manageStocksBtn) {
        manageStocksBtn.addEventListener('click', async function() {
            stockManagementModal.style.display = 'block';
            await loadStocksList();
        });
    }
    
    if (closeStockManagement) {
        closeStockManagement.addEventListener('click', function() {
            stockManagementModal.style.display = 'none';
        });
    }
    
    if (cancelStockManagement) {
        cancelStockManagement.addEventListener('click', function() {
            stockManagementModal.style.display = 'none';
        });
    }
    
    async function loadStocksList() {
        const list = document.getElementById('stocksList');
        if (!list) return;
        
        try {
            const stocks = await supabaseService.getStockMarket();
            
            if (stocks.length === 0) {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No stocks available</div>';
                return;
            }
            
            list.innerHTML = stocks.map(stock => {
                const changePercent = parseFloat(stock.change_percent || 0);
                const isPositive = changePercent >= 0;
                const changeClass = isPositive ? 'positive' : 'negative';
                const changeSymbol = isPositive ? '+' : '';
                const isReal = stock.is_real_stock || false;
                const source = stock.source || 'simulated';
                
                return `
                    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="font-weight: 600; font-size: 18px; color: #1f2937;">${stock.symbol}</div>
                                ${isReal ? `<span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">REAL ${source.toUpperCase()}</span>` : '<span style="background: #6b7280; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">SIMULATED</span>'}
                            </div>
                            <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">${stock.company_name}</div>
                            <div style="font-size: 16px; font-weight: 600; color: #3b82f6; margin-top: 8px;">
                                $${parseFloat(stock.current_price).toFixed(2)}
                                <span class="stock-change ${changeClass}" style="margin-left: 10px; font-size: 12px; padding: 2px 6px; border-radius: 4px;">
                                    ${changeSymbol}${changePercent.toFixed(2)}%
                                </span>
                            </div>
                            ${!isReal ? `<div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">Volatility: ${stock.volatility}%</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading stocks:', error);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444;">Error loading stocks</div>';
        }
    }
    
    if (addStockForm) {
        addStockForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const symbol = document.getElementById('newStockSymbol').value.toUpperCase().trim();
            const companyName = document.getElementById('newStockCompany').value.trim();
            const price = parseFloat(document.getElementById('newStockPrice').value);
            const volatility = parseFloat(document.getElementById('newStockVolatility').value);
            
            if (!symbol || !companyName || !price || price <= 0) {
                alert('Please fill in all required fields with valid values');
                return;
            }
            
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('creating stock');
            }
            
            try {
                const result = await supabaseService.createStock(symbol, companyName, price, volatility);
                
                if (result.error) {
                    alert(`❌ Failed to create stock: ${result.error}`);
                    return;
                }
                
                alert(`✅ Stock ${symbol} created successfully!`);
                addStockForm.reset();
                await loadStocksList();
            } catch (error) {
                console.error('Error creating stock:', error);
                alert(`❌ Failed to create stock: ${error.message}`);
            }
        });
    }
    
    // Add Real NYSE Stock
    if (addRealStockFormElement) {
        addRealStockFormElement.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const symbol = document.getElementById('realStockSymbol').value.toUpperCase().trim();
            
            if (!symbol) {
                alert('Please enter a stock symbol');
                return;
            }
            
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('fetching stock data');
            }
            
            try {
                const result = await supabaseService.addRealStock(symbol);
                
                if (result.error) {
                    alert(`❌ Failed to add stock: ${result.error}`);
                    return;
                }
                
                alert(`✅ Stock ${symbol} added successfully with real-time NYSE data!`);
                addRealStockFormElement.reset();
                await loadStocksList();
            } catch (error) {
                console.error('Error adding real stock:', error);
                alert(`❌ Failed to add stock: ${error.message}`);
            }
        });
    }
    
    // ==========================================
    // WAGE GARNISHMENT MANAGEMENT
    // ==========================================
    
    const garnishmentModal = document.getElementById('garnishmentModal');
    const manageGarnishmentsBtn = document.getElementById('manageGarnishmentsBtn');
    const closeGarnishment = document.getElementById('closeGarnishment');
    const cancelGarnishment = document.getElementById('cancelGarnishment');
    const addGarnishmentBtn = document.getElementById('addGarnishmentBtn');
    const addGarnishmentModal = document.getElementById('addGarnishmentModal');
    const closeAddGarnishment = document.getElementById('closeAddGarnishment');
    const cancelAddGarnishment = document.getElementById('cancelAddGarnishment');
    const garnishmentForm = document.getElementById('garnishmentForm');
    const garnishmentAmountType = document.getElementById('garnishmentAmountType');
    const garnishmentAmountLabel = document.getElementById('garnishmentAmountLabel');
    const viewEmployeeBalancesBtn = document.getElementById('viewEmployeeBalancesBtn');
    const employeeBalancesModal = document.getElementById('employeeBalancesModal');
    const closeEmployeeBalances = document.getElementById('closeEmployeeBalances');
    const cancelEmployeeBalances = document.getElementById('cancelEmployeeBalances');
    const balanceSearchInput = document.getElementById('balanceSearchInput');
    
    if (manageGarnishmentsBtn) {
        manageGarnishmentsBtn.addEventListener('click', async function() {
            garnishmentModal.style.display = 'block';
            await loadGarnishmentsList();
        });
    }
    
    if (viewEmployeeBalancesBtn) {
        viewEmployeeBalancesBtn.addEventListener('click', async function() {
            employeeBalancesModal.style.display = 'block';
            await loadEmployeeBalances();
        });
    }
    
    if (closeEmployeeBalances) {
        closeEmployeeBalances.addEventListener('click', function() {
            employeeBalancesModal.style.display = 'none';
        });
    }
    
    if (cancelEmployeeBalances) {
        cancelEmployeeBalances.addEventListener('click', function() {
            employeeBalancesModal.style.display = 'none';
        });
    }
    
    if (balanceSearchInput) {
        balanceSearchInput.addEventListener('input', function() {
            filterEmployeeBalances(this.value);
        });
    }
    
    async function loadEmployeeBalances() {
        const list = document.getElementById('employeeBalancesList');
        if (!list) return;
        
        try {
            const employees = await supabaseService.getEmployees() || [];
            const balances = [];
            
            // Get wallet balance for each employee
            for (const employee of employees) {
                try {
                    const wallet = await supabaseService.getEmployeeWallet(employee.id);
                    balances.push({
                        employee,
                        wallet: wallet || { balance: 0, total_earned: 0, total_spent: 0 }
                    });
                } catch (error) {
                    console.error(`Error loading wallet for ${employee.name}:`, error);
                    balances.push({
                        employee,
                        wallet: { balance: 0, total_earned: 0, total_spent: 0 }
                    });
                }
            }
            
            // Sort by balance (highest first)
            balances.sort((a, b) => parseFloat(b.wallet.balance || 0) - parseFloat(a.wallet.balance || 0));
            
            if (balances.length === 0) {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No employees found</div>';
                return;
            }
            
            list.innerHTML = balances.map(item => {
                const balance = parseFloat(item.wallet.balance || 0);
                const earned = parseFloat(item.wallet.total_earned || 0);
                const spent = parseFloat(item.wallet.total_spent || 0);
                const balanceClass = balance >= 0 ? 'positive' : 'negative';
                
                return `
                    <div class="employee-balance-item" data-employee-name="${item.employee.name.toLowerCase()}" 
                         style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; font-size: 18px; color: #1f2937; margin-bottom: 8px;">
                                    ${item.employee.name}
                                </div>
                                <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                                    ${item.employee.role}
                                </div>
                                <div style="font-size: 12px; color: #9ca3af; margin-top: 8px;">
                                    Total Earned: $${earned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • 
                                    Total Spent: $${spent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div style="text-align: right; margin-left: 20px;">
                                <div style="font-size: 24px; font-weight: bold; color: ${balance >= 0 ? '#10b981' : '#ef4444'};">
                                    $${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                                    Current Balance
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading employee balances:', error);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444;">Error loading employee balances</div>';
        }
    }
    
    function filterEmployeeBalances(searchTerm) {
        const items = document.querySelectorAll('.employee-balance-item');
        const term = searchTerm.toLowerCase().trim();
        
        items.forEach(item => {
            const employeeName = item.getAttribute('data-employee-name');
            if (employeeName.includes(term)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    if (closeGarnishment) {
        closeGarnishment.addEventListener('click', function() {
            garnishmentModal.style.display = 'none';
        });
    }
    
    if (cancelGarnishment) {
        cancelGarnishment.addEventListener('click', function() {
            garnishmentModal.style.display = 'none';
        });
    }
    
    if (addGarnishmentBtn) {
        addGarnishmentBtn.addEventListener('click', async function() {
            document.getElementById('garnishmentModalTitle').textContent = 'Add Wage Garnishment';
            document.getElementById('garnishmentId').value = '';
            garnishmentForm.reset();
            await loadEmployeeDropdown();
            addGarnishmentModal.style.display = 'block';
        });
    }
    
    if (deductWalletBtn) {
        deductWalletBtn.addEventListener('click', async function() {
            deductWalletForm.reset();
            await loadDeductWalletEmployeeDropdown();
            deductWalletModal.style.display = 'block';
        });
    }
    
    if (closeDeductWallet) {
        closeDeductWallet.addEventListener('click', function() {
            deductWalletModal.style.display = 'none';
        });
    }
    
    if (cancelDeductWallet) {
        cancelDeductWallet.addEventListener('click', function() {
            deductWalletModal.style.display = 'none';
        });
    }
    
    async function loadDeductWalletEmployeeDropdown() {
        const select = document.getElementById('deductWalletEmployee');
        if (!select) return;
        
        try {
            const employees = await supabaseService.getEmployees() || [];
            select.innerHTML = '<option value="">Select an employee...</option>' +
                employees.map(emp => `<option value="${emp.id}">${emp.name} (${emp.role})</option>`).join('');
        } catch (error) {
            console.error('Error loading employees:', error);
        }
    }
    
    if (deductWalletForm) {
        deductWalletForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const employeeId = parseInt(document.getElementById('deductWalletEmployee').value);
            const amount = parseFloat(document.getElementById('deductWalletAmount').value);
            const reason = document.getElementById('deductWalletReason').value.trim();
            
            if (!employeeId || !amount || amount <= 0 || !reason) {
                alert('Please fill in all required fields with valid values');
                return;
            }
            
            if (!confirm(`Are you sure you want to deduct $${amount.toFixed(2)} from this employee's wallet?`)) {
                return;
            }
            
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('deducting from wallet');
            }
            
            try {
                const result = await supabaseService.deductFromWallet(employeeId, amount, reason);
                
                if (result.error) {
                    alert(`❌ Failed to deduct: ${result.error}`);
                    return;
                }
                
                alert(`✅ Successfully deducted $${amount.toFixed(2)} from employee wallet!`);
                deductWalletModal.style.display = 'none';
                deductWalletForm.reset();
            } catch (error) {
                console.error('Error deducting from wallet:', error);
                alert(`❌ Failed to deduct: ${error.message}`);
            }
        });
    }
    
    if (closeAddGarnishment) {
        closeAddGarnishment.addEventListener('click', function() {
            addGarnishmentModal.style.display = 'none';
        });
    }
    
    if (cancelAddGarnishment) {
        cancelAddGarnishment.addEventListener('click', function() {
            addGarnishmentModal.style.display = 'none';
        });
    }
    
    // Update amount label based on type
    if (garnishmentAmountType) {
        garnishmentAmountType.addEventListener('change', function() {
            const amountInput = document.getElementById('garnishmentAmount');
            if (this.value === 'percent') {
                garnishmentAmountLabel.textContent = 'Percentage (%)';
                amountInput.max = 100;
                amountInput.step = '0.01';
            } else {
                garnishmentAmountLabel.textContent = 'Amount ($)';
                amountInput.removeAttribute('max');
                amountInput.step = '0.01';
            }
        });
    }
    
    async function loadEmployeeDropdown() {
        const select = document.getElementById('garnishmentEmployee');
        if (!select) return;
        
        try {
            const employees = await supabaseService.getEmployees() || [];
            select.innerHTML = '<option value="">Select an employee...</option>' +
                employees.map(emp => `<option value="${emp.id}">${emp.name} (${emp.role})</option>`).join('');
        } catch (error) {
            console.error('Error loading employees:', error);
        }
    }
    
    async function loadDeductWalletEmployeeDropdown() {
        const select = document.getElementById('deductWalletEmployee');
        if (!select) return;
        
        try {
            const employees = await supabaseService.getEmployees() || [];
            select.innerHTML = '<option value="">Select an employee...</option>' +
                employees.map(emp => `<option value="${emp.id}">${emp.name} (${emp.role})</option>`).join('');
        } catch (error) {
            console.error('Error loading employees:', error);
        }
    }
    
    async function loadGarnishmentsList() {
        const list = document.getElementById('garnishmentsList');
        if (!list) return;
        
        try {
            const garnishments = await supabaseService.getGarnishments();
            const employees = await supabaseService.getEmployees() || [];
            const employeeMap = new Map(employees.map(e => [e.id, e]));
            
            if (garnishments.length === 0) {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No active garnishments</div>';
                return;
            }
            
            list.innerHTML = garnishments.map(g => {
                const employee = employeeMap.get(g.employee_id);
                const amountDisplay = g.amount_type === 'percent' 
                    ? `${g.percent_of_pay}% of pay` 
                    : `$${parseFloat(g.amount).toFixed(2)}`;
                const statusClass = g.status === 'active' ? 'positive' : 'negative';
                const endDateDisplay = g.end_date ? new Date(g.end_date).toLocaleDateString() : 'Indefinite';
                
                return `
                    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; font-size: 18px; color: #1f2937; margin-bottom: 8px;">
                                    ${employee?.name || 'Unknown Employee'}
                                </div>
                                <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                                    <strong>Amount:</strong> ${amountDisplay}
                                </div>
                                <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                                    <strong>Reason:</strong> ${g.reason}
                                </div>
                                <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                                    <strong>Period:</strong> ${new Date(g.start_date).toLocaleDateString()} - ${endDateDisplay}
                                </div>
                                <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                                    <strong>Total Garnished:</strong> $${parseFloat(g.total_garnished || 0).toFixed(2)}
                                </div>
                                <div style="font-size: 12px; color: #9ca3af; margin-top: 8px;">
                                    Status: <span class="stock-change ${statusClass}" style="padding: 2px 6px; border-radius: 4px;">${g.status.toUpperCase()}</span>
                                </div>
                            </div>
                            <div style="margin-left: 20px;">
                                <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px; margin-bottom: 5px;" 
                                        onclick="editGarnishment(${g.id})">Edit</button>
                                <button class="btn-danger" style="padding: 6px 12px; font-size: 12px;" 
                                        onclick="cancelGarnishment(${g.id})">Cancel</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading garnishments:', error);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444;">Error loading garnishments</div>';
        }
    }
    
    window.editGarnishment = async function(garnishmentId) {
        try {
            const garnishment = await supabaseService.getGarnishment(garnishmentId);
            if (!garnishment) {
                alert('Garnishment not found');
                return;
            }
            
            document.getElementById('garnishmentModalTitle').textContent = 'Edit Wage Garnishment';
            document.getElementById('garnishmentId').value = garnishment.id;
            document.getElementById('garnishmentEmployee').value = garnishment.employee_id;
            document.getElementById('garnishmentAmountType').value = garnishment.amount_type;
            document.getElementById('garnishmentAmount').value = garnishment.amount_type === 'percent' 
                ? garnishment.percent_of_pay 
                : garnishment.amount;
            document.getElementById('garnishmentReason').value = garnishment.reason;
            document.getElementById('garnishmentStartDate').value = garnishment.start_date;
            document.getElementById('garnishmentEndDate').value = garnishment.end_date || '';
            
            // Trigger change event to update label
            garnishmentAmountType.dispatchEvent(new Event('change'));
            
            await loadEmployeeDropdown();
            addGarnishmentModal.style.display = 'block';
        } catch (error) {
            console.error('Error loading garnishment:', error);
            alert('Failed to load garnishment: ' + error.message);
        }
    };
    
    window.cancelGarnishment = async function(garnishmentId) {
        if (!confirm('Are you sure you want to cancel this garnishment?')) return;
        
        try {
            const result = await supabaseService.cancelGarnishment(garnishmentId);
            if (result.error) {
                alert(`❌ Failed to cancel: ${result.error}`);
                return;
            }
            alert('✅ Garnishment cancelled');
            await loadGarnishmentsList();
        } catch (error) {
            console.error('Error cancelling garnishment:', error);
            alert('Failed to cancel garnishment: ' + error.message);
        }
    };
    
    if (garnishmentForm) {
        garnishmentForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const employeeId = parseInt(document.getElementById('garnishmentEmployee').value);
            const amountType = document.getElementById('garnishmentAmountType').value;
            const amount = parseFloat(document.getElementById('garnishmentAmount').value);
            const reason = document.getElementById('garnishmentReason').value.trim();
            const startDate = document.getElementById('garnishmentStartDate').value;
            const endDate = document.getElementById('garnishmentEndDate').value || null;
            const garnishmentId = document.getElementById('garnishmentId').value;
            
            if (!employeeId || !amount || !reason || !startDate) {
                alert('Please fill in all required fields');
                return;
            }
            
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('saving garnishment');
            }
            
            try {
                let result;
                if (garnishmentId) {
                    // Update existing
                    result = await supabaseService.updateGarnishment(
                        parseInt(garnishmentId),
                        amountType,
                        amount,
                        reason,
                        startDate,
                        endDate
                    );
                } else {
                    // Create new
                    result = await supabaseService.createGarnishment(
                        employeeId,
                        amountType,
                        amount,
                        reason,
                        startDate,
                        endDate
                    );
                }
                
                if (result.error) {
                    alert(`❌ Failed to save: ${result.error}`);
                    return;
                }
                
                alert(`✅ Garnishment ${garnishmentId ? 'updated' : 'created'} successfully!`);
                addGarnishmentModal.style.display = 'none';
                garnishmentForm.reset();
                await loadGarnishmentsList();
            } catch (error) {
                console.error('Error saving garnishment:', error);
                alert(`❌ Failed to save: ${error.message}`);
            }
        });
    }
    
    // ==========================================
    // PAY RATE MANAGEMENT
    // ==========================================
    
    const payRateModal = document.getElementById('payRateModal');
    const managePayRatesBtn = document.getElementById('managePayRatesBtn');
    const closePayRateModal = document.getElementById('closePayRateModal');
    const cancelPayRateBtn = document.getElementById('cancelPayRateBtn');
    const savePayRatesBtn = document.getElementById('savePayRatesBtn');
    const randomizeAllBtn = document.getElementById('randomizeAllBtn');

    if (managePayRatesBtn) {
        managePayRatesBtn.addEventListener('click', async function() {
            payRateModal.style.display = 'block';
            await loadPayRatesUI();
        });
    }

    if (closePayRateModal) {
        closePayRateModal.addEventListener('click', function() {
            payRateModal.style.display = 'none';
        });
    }

    if (cancelPayRateBtn) {
        cancelPayRateBtn.addEventListener('click', function() {
            payRateModal.style.display = 'none';
        });
    }

    if (randomizeAllBtn) {
        randomizeAllBtn.addEventListener('click', function() {
            const inputs = document.querySelectorAll('#payRateList input[type="number"][data-employee-id]');
            inputs.forEach(input => {
                // Random rate between $15 and $60
                const randomRate = Math.floor(Math.random() * 45) + 15;
                input.value = randomRate;
            });
        });
    }

    if (savePayRatesBtn) {
        savePayRatesBtn.addEventListener('click', async function() {
            if (typeof showFormLoadingScreen !== 'undefined') {
                showFormLoadingScreen('pay rates');
            }

            try {
                const employees = await supabaseService.getEmployees() || [];
                const inputs = document.querySelectorAll('#payRateList input[type="number"][data-employee-id]');
                
                let savedCount = 0;
                for (const input of inputs) {
                    const employeeId = parseInt(input.getAttribute('data-employee-id'));
                    const hourlyRate = parseFloat(input.value);
                    const rateType = input.getAttribute('data-rate-type') || 'custom';

                    if (hourlyRate > 0) {
                        const result = await supabaseService.setEmployeePayRate(
                            employeeId,
                            hourlyRate,
                            rateType
                        );
                        if (!result.error) {
                            savedCount++;
                        }
                    }
                }

                alert(`✅ Saved pay rates for ${savedCount} employee(s)!`);
                payRateModal.style.display = 'none';
            } catch (error) {
                console.error('Error saving pay rates:', error);
                alert('❌ Failed to save pay rates: ' + error.message);
            }
        });
    }

    async function loadPayRatesUI() {
        const list = document.getElementById('payRateList');
        if (!list) return;

        list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">Loading employees...</div>';

        try {
            const employees = await supabaseService.getEmployees() || [];
            
            if (employees.length === 0) {
                list.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">No employees found</div>';
                return;
            }

            // Default hourly rates by role
            const defaultRates = {
                'Project Manager': 45,
                'Senior Developer': 55,
                'Developer': 40,
                'UX Designer': 42,
                'Designer': 35,
                'Administrator': 30,
                'Employee': 25
            };

            const htmlPromises = employees.map(async (emp) => {
                // Get current pay rate
                const payRates = await supabaseService.getEmployeePayRates(emp.id);
                const currentRate = payRates && payRates.length > 0 
                    ? parseFloat(payRates[0].hourly_rate) 
                    : (defaultRates[emp.role] || 25);
                
                const rateType = payRates && payRates.length > 0 
                    ? payRates[0].rate_type 
                    : 'standard';

                return `
                    <div style="display: flex; align-items: center; gap: 15px; padding: 15px; border-bottom: 1px solid var(--border-light, #e5e7eb);">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: var(--text-primary, #1f2937);">${emp.name}</div>
                            <div style="font-size: 12px; color: var(--text-secondary, #6b7280);">${emp.role}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <label style="font-size: 14px;">$</label>
                            <input type="number" 
                                   data-employee-id="${emp.id}" 
                                   data-rate-type="${rateType}"
                                   value="${currentRate}" 
                                   min="0" 
                                   step="0.01" 
                                   style="width: 100px; padding: 8px; border: 1px solid var(--border-light, #e5e7eb); border-radius: 4px;">
                            <span style="font-size: 14px; color: #6b7280;">/hr</span>
                        </div>
                    </div>
                `;
            });

            const htmlArray = await Promise.all(htmlPromises);
            list.innerHTML = htmlArray.join('');
        } catch (error) {
            console.error('Error loading pay rates UI:', error);
            list.innerHTML = '<div style="text-align: center; padding: 20px; color: #dc2626;">Error loading employees</div>';
        }
    }
});

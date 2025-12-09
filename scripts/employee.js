// Employee Dashboard Script with Supabase Integration
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'employee') {
        window.location.href = 'index.html';
        return;
    }
    
    // Initialize Gantt Chart in read-only mode first
    const gantt = new GanttChart('ganttChart', false);
    
    // Logout functionality - set this up FIRST before any async operations
    document.getElementById('logoutBtn').addEventListener('click', async function(e) {
        e.preventDefault();
        
        try {
            // Sign out from Supabase first
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
        await syncFromSupabase();
    }
    
    // Sync data from Supabase
    async function syncFromSupabase() {
        if (!supabaseService.isReady()) return;
        
        const currentUser = supabaseService.getCurrentUser();
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
            
            localStorage.setItem('ganttData', JSON.stringify(data));
            gantt.data = data;
            gantt.render();
            
            console.log(`📋 Loaded ${userTasks.length} task(s) for ${userEmployee.name}`);
        }
    }
    
    // Subscribe to real-time changes
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        supabaseService.subscribeToChanges(async (type, payload) => {
            console.log(`${type} changed, refreshing...`);
            await syncFromSupabase();
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
});

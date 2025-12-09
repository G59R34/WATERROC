// Admin Dashboard Script with Supabase Integration
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
    
    // Check Supabase authentication
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
            sessionStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        
        // Sync from Supabase
        await syncFromSupabase();
    }
    
    // Initialize Gantt Chart
    const gantt = new GanttChart('ganttChart', true);
    
    // Set up date inputs
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    startDateInput.valueAsDate = gantt.startDate;
    endDateInput.valueAsDate = gantt.endDate;
    
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
            
            localStorage.setItem('ganttData', JSON.stringify(data));
        }
    }
    
    // Logout functionality
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
    
    // Update date range
    document.getElementById('updateDateRange').addEventListener('click', function() {
        const newStart = new Date(startDateInput.value);
        const newEnd = new Date(endDateInput.value);
        
        if (newStart > newEnd) {
            alert('Start date must be before end date!');
            return;
        }
        
        gantt.setDateRange(newStart, newEnd);
        startDateInput.valueAsDate = gantt.startDate;
        endDateInput.valueAsDate = gantt.endDate;
    });
    
    // Reset view
    document.getElementById('resetViewBtn').addEventListener('click', function() {
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - 7);
        
        const end = new Date(today);
        end.setDate(today.getDate() + 23);
        
        gantt.setDateRange(start, end);
        startDateInput.valueAsDate = gantt.startDate;
        endDateInput.valueAsDate = gantt.endDate;
    });
    
    // Save data manually
    document.getElementById('saveDataBtn').addEventListener('click', function() {
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
    
    // Modal functionality
    const addEmployeeModal = document.getElementById('addEmployeeModal');
    const addTaskModal = document.getElementById('addTaskModal');
    const editTaskModal = document.getElementById('editTaskModal');
    
    const addEmployeeBtn = document.getElementById('addEmployeeBtn');
    const addTaskBtn = document.getElementById('addTaskBtn');
    
    const closeBtns = document.querySelectorAll('.close');
    
    // Open Add Employee Modal
    addEmployeeBtn.addEventListener('click', async function() {
        await loadUsersForEmployeeModal();
        addEmployeeModal.style.display = 'block';
    });
    
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
    addTaskBtn.addEventListener('click', function() {
        updateEmployeeDropdown();
        addTaskModal.style.display = 'block';
        
        // Set default dates
        const today = new Date();
        document.getElementById('taskStart').valueAsDate = today;
        
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        document.getElementById('taskEnd').valueAsDate = nextWeek;
        
        // Set default times
        document.getElementById('taskStartTime').value = '09:00';
        document.getElementById('taskEndTime').value = '17:00';
    });
    
    // Close modals
    closeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            addEmployeeModal.style.display = 'none';
            addTaskModal.style.display = 'none';
            editTaskModal.style.display = 'none';
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
    });
    
    // Add Employee Form
    document.getElementById('addEmployeeForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
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
        this.reset();
        
        const linkedMsg = userId ? ' and linked to user account' : '';
        alert(`Employee ${name} added successfully${linkedMsg}!`);
    });
    
    // Add Task Form
    document.getElementById('addTaskForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const employeeId = parseInt(document.getElementById('taskEmployee').value);
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
        
        // Add to local Gantt chart
        gantt.addTask(employeeId, name, startDate, endDate, status, startTime, endTime);
        
        // Sync to Supabase if enabled
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            await supabaseService.addTask(employeeId, name, startDate, endDate, startTime, endTime, status);
            
            // Refresh from database
            await syncFromSupabase();
        }
        
        addTaskModal.style.display = 'none';
        this.reset();
        
        alert(`Task "${name}" added successfully!`);
    });
    
    // Edit Task Form
    document.getElementById('editTaskForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
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
            const currentUser = supabaseService.getCurrentUser();
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
    });
    
    // Delete Task
    document.getElementById('deleteTaskBtn').addEventListener('click', async function() {
        const taskId = parseInt(document.getElementById('editTaskId').value);
        
        if (confirm('Are you sure you want to delete this task?')) {
            console.log('🗑️ Deleting task ID:', taskId);
            
            // Delete from Supabase first
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                const result = await supabaseService.deleteTask(taskId);
                console.log('Supabase delete result:', result);
                
                // Refresh from database
                await syncFromSupabase();
            }
            
            // Delete from local Gantt chart
            gantt.deleteTask(taskId);
            
            editTaskModal.style.display = 'none';
            document.getElementById('editTaskForm').reset();
            
            alert('Task deleted successfully!');
        }
    });
    
    // Override task click handler
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
        
        // Show modal
        editTaskModal.style.display = 'block';
    };
    
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
});

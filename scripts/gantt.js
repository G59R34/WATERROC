// Gantt Chart Core Logic
class GanttChart {
    constructor(containerId, isEditable = false) {
        this.container = document.getElementById(containerId);
        this.isEditable = isEditable;
        this.data = this.loadData();
        this.startDate = null;
        this.endDate = null;
        this.dayWidth = 120; // Increased for time slots
        this.showTimeSlots = true; // Show hourly breakdown
        
        this.init();
    }
    
    init() {
        // Set infinite scroll date range - from today to 1 year ahead
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        this.startDate = new Date(today);
        
        // Extend to 365 days in the future for infinite scroll
        this.endDate = new Date(today);
        this.endDate.setDate(today.getDate() + 365);
        
        this.render();
    }
    
    loadData() {
        const savedData = localStorage.getItem('ganttData');
        if (savedData) {
            return JSON.parse(savedData);
        }
        
        // Empty initial state - no default employees
        return {
            employees: [],
            tasks: [],
            nextEmployeeId: 1,
            nextTaskId: 1
        };
    }
    
    saveData() {
        localStorage.setItem('ganttData', JSON.stringify(this.data));
    }
    
    formatDate(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    getDaysBetween(start, end) {
        const oneDay = 24 * 60 * 60 * 1000;
        return Math.round(Math.abs((end - start) / oneDay)) + 1;
    }
    
    getDayOfWeek(date) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[date.getDay()];
    }
    
    isWeekend(date) {
        const day = date.getDay();
        return day === 0 || day === 6;
    }
    
    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }
    
    setDateRange(start, end) {
        this.startDate = new Date(start);
        this.endDate = new Date(end);
        this.render(); // render is now async but we don't await here for compatibility
    }
    
    async render() {
        if (!this.container) return;
        
        if (this.data.employees.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        this.container.innerHTML = '';
        
        // Create header
        const header = this.createHeader();
        this.container.appendChild(header);
        
        // Create body (now async to load time off data)
        const body = await this.createBody();
        this.container.appendChild(body);
        
        // Synchronize scroll between body and header timeline
        const timelineHeader = header.querySelector('.gantt-timeline-header');
        
        // Use requestAnimationFrame to prevent scroll fighting
        let isScrolling = false;
        body.addEventListener('scroll', () => {
            if (!isScrolling) {
                isScrolling = true;
                requestAnimationFrame(() => {
                    timelineHeader.scrollLeft = body.scrollLeft;
                    isScrolling = false;
                });
            }
        }, { passive: true });
    }
    
    renderEmptyState() {
        this.container.innerHTML = `
            <div class="gantt-empty-state">
                <h3>No Employees Added</h3>
                <p>Add employees to start scheduling tasks</p>
            </div>
        `;
    }
    
    createHeader() {
        const header = document.createElement('div');
        header.className = 'gantt-header';
        
        // Employee column header
        const employeeHeader = document.createElement('div');
        employeeHeader.className = 'gantt-employee-header';
        employeeHeader.textContent = 'Employee';
        header.appendChild(employeeHeader);
        
        // Timeline header
        const timelineHeader = document.createElement('div');
        timelineHeader.className = 'gantt-timeline-header';
        
        const days = this.getDaysBetween(this.startDate, this.endDate);
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(this.startDate);
            currentDate.setDate(this.startDate.getDate() + i);
            
            const dayHeader = document.createElement('div');
            dayHeader.className = 'gantt-day-header';
            dayHeader.dataset.date = this.formatDate(currentDate);
            dayHeader.style.cursor = 'pointer';
            dayHeader.title = 'Click to view hourly schedule';
            
            if (this.isWeekend(currentDate)) {
                dayHeader.classList.add('weekend');
            }
            
            if (this.isToday(currentDate)) {
                dayHeader.classList.add('today');
            }
            
            dayHeader.innerHTML = `
                <span class="day-name">${this.getDayOfWeek(currentDate)}</span>
                <span class="day-date">${currentDate.getDate()}</span>
                <span class="day-time">0000-2359</span>
            `;
            
            timelineHeader.appendChild(dayHeader);
        }
        
        header.appendChild(timelineHeader);
        return header;
    }
    
    async createBody() {
        const body = document.createElement('div');
        body.className = 'gantt-body';
        
        // Create rows asynchronously to load time off data
        const rowPromises = this.data.employees.map(employee => this.createEmployeeRow(employee));
        const rows = await Promise.all(rowPromises);
        
        rows.forEach(row => {
            body.appendChild(row);
        });
        
        return body;
    }
    
    async createEmployeeRow(employee) {
        const row = document.createElement('div');
        row.className = 'gantt-row';
        row.dataset.employeeId = employee.id;
        
        // Employee cell
        const employeeCell = document.createElement('div');
        employeeCell.className = 'gantt-employee-cell';
        employeeCell.innerHTML = `
            <div class="employee-name">${employee.name}</div>
            <div class="employee-role">${employee.role}</div>
        `;
        row.appendChild(employeeCell);
        
        // Timeline cell
        const timelineCell = document.createElement('div');
        timelineCell.className = 'gantt-timeline-cell';
        
        const days = this.getDaysBetween(this.startDate, this.endDate);
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(this.startDate);
            currentDate.setDate(this.startDate.getDate() + i);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-day-cell';
            
            if (this.isWeekend(currentDate)) {
                dayCell.classList.add('weekend');
            }
            
            if (this.isToday(currentDate)) {
                dayCell.classList.add('today');
            }
            
            timelineCell.appendChild(dayCell);
        }
        
        // Load time off periods for this employee
        let timeOffPeriods = [];
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            const startDateStr = this.formatDate(this.startDate);
            const endDateStr = this.formatDate(this.endDate);
            timeOffPeriods = await supabaseService.getApprovedTimeOff(employee.id, startDateStr, endDateStr) || [];
        }
        
        // Add time off periods first (so they appear behind tasks)
        timeOffPeriods.forEach(timeOff => {
            const timeOffElement = this.createTimeOffElement(timeOff, employee.id);
            if (timeOffElement) {
                timelineCell.appendChild(timeOffElement);
            }
        });
        
        // Add tasks for this employee
        const employeeTasks = this.data.tasks.filter(task => task.employeeId === employee.id);
        
        // Sort tasks by start date for proper stacking
        employeeTasks.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        
        // Track task lanes for collision detection
        const taskLanes = [];
        
        employeeTasks.forEach(task => {
            const taskElement = this.createTaskElement(task, taskLanes);
            timelineCell.appendChild(taskElement);
        });
        
        row.appendChild(timelineCell);
        return row;
    }
    
    createTimeOffElement(timeOff, employeeId) {
        const timeOffDiv = document.createElement('div');
        timeOffDiv.className = 'gantt-time-off';
        timeOffDiv.dataset.employeeId = employeeId;
        timeOffDiv.title = `Time Off: ${timeOff.reason || 'Approved time off'}`;
        
        const startDate = new Date(timeOff.start_date);
        const endDate = new Date(timeOff.end_date);
        
        // Calculate position
        const daysFromStart = this.getDaysBetween(this.startDate, startDate) - 1;
        const duration = this.getDaysBetween(startDate, endDate);
        
        const left = daysFromStart * this.dayWidth + 4;
        const width = duration * this.dayWidth - 8;
        
        timeOffDiv.style.cssText = `
            position: absolute;
            left: ${left}px;
            width: ${width}px;
            height: 60px;
            top: 50%;
            transform: translateY(-50%);
            background: repeating-linear-gradient(
                45deg,
                rgba(16, 185, 129, 0.15),
                rgba(16, 185, 129, 0.15) 10px,
                rgba(16, 185, 129, 0.25) 10px,
                rgba(16, 185, 129, 0.25) 20px
            );
            border: 2px dashed #10b981;
            border-radius: 6px;
            z-index: 1;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #059669;
            font-weight: 600;
            font-size: 0.85rem;
        `;
        
        timeOffDiv.textContent = '🏖️ Time Off';
        
        return timeOffDiv;
    }
    
    createTaskElement(task, taskLanes = []) {
        const taskDiv = document.createElement('div');
        taskDiv.className = `gantt-task status-${task.status}`;
        taskDiv.dataset.taskId = task.id;
        
        if (this.isEditable) {
            taskDiv.classList.add('editable');
        }
        
        const taskStart = new Date(task.startDate);
        const taskEnd = new Date(task.endDate);
        
        // Calculate position
        const daysFromStart = this.getDaysBetween(this.startDate, taskStart) - 1;
        const taskDuration = this.getDaysBetween(taskStart, taskEnd);
        
        const left = daysFromStart * this.dayWidth + 4;
        const width = taskDuration * this.dayWidth - 8;
        
        // Find which lane this task should be in (collision detection)
        const taskHeight = 70; // Task height + margin
        let lane = 0;
        let collision = true;
        
        while (collision) {
            collision = false;
            for (let i = 0; i < taskLanes.length; i++) {
                const existingTask = taskLanes[i];
                if (existingTask.lane === lane) {
                    // Check if tasks overlap horizontally
                    const existingLeft = existingTask.left;
                    const existingRight = existingTask.left + existingTask.width;
                    const taskRight = left + width;
                    
                    if (!(taskRight < existingLeft || left > existingRight)) {
                        collision = true;
                        lane++;
                        break;
                    }
                }
            }
        }
        
        // Store this task's position for future collision checks
        taskLanes.push({ left, width, lane });
        
        // Calculate vertical position based on lane
        const topOffset = lane * taskHeight;
        
        taskDiv.style.left = `${left}px`;
        taskDiv.style.width = `${width}px`;
        taskDiv.style.top = `${topOffset + 20}px`; // Base offset + lane offset
        taskDiv.style.transform = 'none'; // Remove the centered transform
        
        // Format time display
        const startTime = task.startTime || '0000';
        const endTime = task.endTime || '2359';
        const timeDisplay = `${this.formatTime(startTime)}-${this.formatTime(endTime)}`;
        
        taskDiv.innerHTML = `
            <span class="task-name">${task.name}</span>
            <span class="task-dates">${this.formatDisplayDate(taskStart)} - ${this.formatDisplayDate(taskEnd)}</span>
            <span class="task-time">${timeDisplay}</span>
        `;
        
        // Add click event
        taskDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onTaskClick(task);
        });
        
        return taskDiv;
    }
    
    formatDisplayDate(date) {
        const d = new Date(date);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${month}/${day}`;
    }
    
    formatTime(timeStr) {
        // Convert HHMM to HH:MM
        if (!timeStr || timeStr.length !== 4) return '00:00';
        return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
    }
    
    onTaskClick(task) {
        // To be implemented by admin or employee scripts
        console.log('Task clicked:', task);
    }
    
    addEmployee(name, role) {
        const newEmployee = {
            id: this.data.nextEmployeeId++,
            name: name,
            role: role
        };
        
        this.data.employees.push(newEmployee);
        this.saveData();
        this.render();
        
        return newEmployee;
    }
    
    addTask(employeeId, name, startDate, endDate, status, startTime = '0000', endTime = '2359') {
        const newTask = {
            id: this.data.nextTaskId++,
            employeeId: parseInt(employeeId),
            name: name,
            startDate: startDate,
            endDate: endDate,
            startTime: startTime,
            endTime: endTime,
            status: status
        };
        
        this.data.tasks.push(newTask);
        this.saveData();
        this.render();
        
        return newTask;
    }
    
    updateTask(taskId, updates) {
        const taskIndex = this.data.tasks.findIndex(t => t.id === parseInt(taskId));
        if (taskIndex !== -1) {
            this.data.tasks[taskIndex] = { ...this.data.tasks[taskIndex], ...updates };
            this.saveData();
            this.render();
            return true;
        }
        return false;
    }
    
    deleteTask(taskId) {
        const taskIndex = this.data.tasks.findIndex(t => t.id === parseInt(taskId));
        if (taskIndex !== -1) {
            this.data.tasks.splice(taskIndex, 1);
            this.saveData();
            this.render();
            return true;
        }
        return false;
    }
    
    getEmployees() {
        return this.data.employees;
    }
    
    getTask(taskId) {
        return this.data.tasks.find(t => t.id === parseInt(taskId));
    }
}

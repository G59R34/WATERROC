// Hourly Gantt Chart for detailed day view
class HourlyGanttChart {
    constructor(containerId, selectedDate, isEditable = false) {
        this.container = document.getElementById(containerId);
        this.selectedDate = new Date(selectedDate);
        this.isEditable = isEditable;
        this.data = this.loadData();
        this.hourWidth = 80; // Width per hour
        this.timeIndicatorInterval = null;
        this.workAreas = ['day-off', 'free', 'united', 'autozone'];
        
        this.init();
    }
    
    init() {
        this.render();
        this.startTimeIndicator();
    }
    
    destroy() {
        if (this.timeIndicatorInterval) {
            clearInterval(this.timeIndicatorInterval);
        }
    }
    
    startTimeIndicator() {
        // Update current time indicator every second
        this.updateTimeIndicator();
        this.timeIndicatorInterval = setInterval(() => {
            this.updateTimeIndicator();
        }, 1000);
    }
    
    updateTimeIndicator() {
        const now = new Date();
        const selectedDateStr = this.formatDate(this.selectedDate);
        const todayStr = this.formatDate(now);
        
        // Only show indicator if viewing today
        if (selectedDateStr !== todayStr) {
            const indicators = document.querySelectorAll('.hourly-gantt-current-time');
            indicators.forEach(el => el.remove());
            return;
        }
        
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        
        // Calculate exact position (hours + minutes/60 + seconds/3600)
        const timePosition = (hours + minutes / 60 + seconds / 3600) * this.hourWidth;
        
        // Get scroll container to account for horizontal scroll
        const bodyScroll = this.container.querySelector('.hourly-gantt-body-scroll');
        const scrollLeft = bodyScroll ? bodyScroll.scrollLeft : 0;
        
        // Position = 180px (name column) + time position - scroll offset
        const exactPosition = 180 + timePosition - scrollLeft;
        
        // Update all time indicators
        const indicators = document.querySelectorAll('.hourly-gantt-current-time');
         indicators.forEach(indicator => {
            indicator.style.left = `${exactPosition}px`;
        });
    }
    
    loadData() {
        const savedData = localStorage.getItem('hourlyGanttData');
        if (savedData) {
            const data = JSON.parse(savedData);
            // Ensure workAreas exists for backward compatibility
            if (!data.workAreas) {
                data.workAreas = {};
            }
            return data;
        }
        
        return {
            tasks: {}, // Organized by date: { 'YYYY-MM-DD': [tasks] }
            workAreas: {}, // Organized by date and employee: { 'YYYY-MM-DD': { employeeId: 'area' } }
            nextTaskId: 1
        };
    }
    
    saveData() {
        localStorage.setItem('hourlyGanttData', JSON.stringify(this.data));
    }
    
    getEmployeeWorkArea(employeeId, dateKey) {
        if (!this.data.workAreas[dateKey]) {
            return null;
        }
        return this.data.workAreas[dateKey][employeeId] || null;
    }
    
    setEmployeeWorkArea(employeeId, dateKey, area) {
        if (!this.data.workAreas[dateKey]) {
            this.data.workAreas[dateKey] = {};
        }
        
        // Toggle: if clicking the same area, deselect it
        if (this.data.workAreas[dateKey][employeeId] === area) {
            delete this.data.workAreas[dateKey][employeeId];
        } else {
            this.data.workAreas[dateKey][employeeId] = area;
        }
        
        this.saveData();
    }
    
    getEmployees() {
        // Get employees from main gantt data
        const ganttData = localStorage.getItem('ganttData');
        if (ganttData) {
            const data = JSON.parse(ganttData);
            return data.employees || [];
        }
        return [];
    }
    
    async getEmployeeShift(employeeId, date) {
        // Get shift data from Supabase
        // Try both window.supabaseService and global supabaseService
        const service = window.supabaseService || (typeof supabaseService !== 'undefined' ? supabaseService : null);
        
        if (!service) {
            console.error('No supabaseService available - make sure Supabase is initialized');
            return null;
        }
        
        if (!service.isReady || !service.isReady()) {
            console.error('supabaseService is not ready');
            return null;
        }
        
        try {
            const dateStr = this.formatDate(date);
            console.log(`Fetching shift for employee ${employeeId} on ${dateStr}`);
            const shifts = await service.getEmployeeShifts(dateStr, dateStr);
            console.log('All shifts returned:', shifts);
            const shift = shifts.find(shift => shift.employee_id === employeeId);
            console.log(`Shift found for employee ${employeeId}:`, shift);
            return shift;
        } catch (error) {
            console.error('Error fetching shift:', error);
            return null;
        }
    }
    
    getTasksForDate(date) {
        const dateKey = this.formatDate(date);
        return this.data.tasks[dateKey] || [];
    }
    
    formatDate(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    formatDateDisplay(date) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }
    
    timeToMinutes(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }
    
    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }
    
    async render() {
        if (!this.container) return;
        
        const employees = this.getEmployees();
        
        if (employees.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        // Fetch shift data for all employees
        console.log('Fetching shifts for date:', this.formatDate(this.selectedDate));
        const employeesWithShifts = await Promise.all(
            employees.map(async (emp) => {
                const shift = await this.getEmployeeShift(emp.id, this.selectedDate);
                console.log(`Employee ${emp.name} (ID: ${emp.id}) shift:`, shift);
                return {
                    ...emp,
                    shift: shift
                };
            })
        );
        console.log('Employees with shifts:', employeesWithShifts);
        
        this.container.innerHTML = '';
        
        // Create header
        const header = this.createHeader();
        this.container.appendChild(header);
        
        // Create body
        const body = this.createBody(employeesWithShifts);
        this.container.appendChild(body);
        
        // Synchronize scroll
        const timelineHeader = header.querySelector('.hourly-gantt-timeline-header');
        const bodyTimeline = body.querySelector('.hourly-gantt-body-scroll');
        
        bodyTimeline.addEventListener('scroll', () => {
            timelineHeader.scrollLeft = bodyTimeline.scrollLeft;
            // Update time indicator position on scroll
            this.updateTimeIndicator();
        });
    }
    
    createHeader() {
        const header = document.createElement('div');
        header.className = 'hourly-gantt-header';
        
        // Employee column header
        const employeeHeader = document.createElement('div');
        employeeHeader.className = 'hourly-gantt-employee-header';
        employeeHeader.innerHTML = '<strong>Employee</strong>';
        header.appendChild(employeeHeader);
        
        // Timeline header (24 hours)
        const timelineHeader = document.createElement('div');
        timelineHeader.className = 'hourly-gantt-timeline-header';
        
        for (let hour = 0; hour < 24; hour++) {
            const hourHeader = document.createElement('div');
            hourHeader.className = 'hourly-gantt-hour-header';
            
            const displayHour = hour === 0 ? '12 AM' : 
                               hour < 12 ? `${hour} AM` :
                               hour === 12 ? '12 PM' : 
                               `${hour - 12} PM`;
            
            hourHeader.textContent = displayHour;
            hourHeader.style.width = `${this.hourWidth}px`;
            timelineHeader.appendChild(hourHeader);
        }
        
        header.appendChild(timelineHeader);
        
        return header;
    }
    
    createBody(employees) {
        const body = document.createElement('div');
        body.className = 'hourly-gantt-body';
        
        const bodyScroll = document.createElement('div');
        bodyScroll.className = 'hourly-gantt-body-scroll';
        
        const dateKey = this.formatDate(this.selectedDate);
        const tasksForDate = this.getTasksForDate(this.selectedDate);
        
        const workAreaLabels = {
            'day-off': 'Day Off',
            'free': 'Free',
            'united': 'United',
            'autozone': 'AutoZone'
        };
        
        employees.forEach(employee => {
            const employeeSection = document.createElement('div');
            employeeSection.className = 'hourly-gantt-employee-section';
            
            // Employee name cell (spans all 4 work area rows)
            const employeeNameCell = document.createElement('div');
            employeeNameCell.className = 'hourly-gantt-employee-name-cell';
            employeeNameCell.textContent = employee.name;
            employeeNameCell.style.gridRow = 'span 4';
            employeeSection.appendChild(employeeNameCell);
            
            // Create a row for each work area
            this.workAreas.forEach((area, index) => {
                const areaRow = document.createElement('div');
                areaRow.className = 'hourly-gantt-area-row';
                areaRow.dataset.area = area;
                areaRow.dataset.employeeId = employee.id;
                
                // Timeline area (hours) - just a thin color-coded line
                const timelineArea = document.createElement('div');
                timelineArea.className = `hourly-gantt-timeline-area area-${area}`;
                timelineArea.style.width = `${this.hourWidth * 24}px`;
                timelineArea.style.position = 'relative';
                
                // Draw work time bar ONLY if employee has a real shift
                if (employee.shift) {
                    console.log('Drawing work bar for', employee.name, area, employee.shift);
                    const workBar = this.createWorkBar(employee.shift, area, employee);
                    timelineArea.appendChild(workBar);
                } else {
                    console.log('No shift for', employee.name, '- no bar drawn');
                }
                
                // Make timeline clickable for adding tasks
                if (this.isEditable) {
                    timelineArea.addEventListener('click', (e) => {
                        // Check if employee has a shift first
                        if (!employee.shift) {
                            alert(`⚠️ ${employee.name} has no shift scheduled for this date. Please create a shift first.`);
                            return;
                        }
                        
                        const rect = timelineArea.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const hour = Math.floor(clickX / this.hourWidth);
                        
                        // Check if click is within work hours
                        const startHour = parseInt(employee.shift.start_time.split(':')[0]);
                        const endHour = parseInt(employee.shift.end_time.split(':')[0]);
                        
                        if (hour < startHour || hour >= endHour) {
                            alert(`⚠️ Cannot assign tasks outside work hours (${employee.shift.start_time.substring(0,5)} - ${employee.shift.end_time.substring(0,5)})`);
                            return;
                        }
                        
                        if (hour >= 0 && hour < 24 && window.openHourlyTaskModal) {
                            window.openHourlyTaskModal(employee.id, hour, area);
                        }
                    });
                }
                
                // Draw tasks for this employee and work area
                const employeeTasks = tasksForDate.filter(task => 
                    task.employeeId === employee.id && task.workArea === area
                );
                
                employeeTasks.forEach(task => {
                    const taskBar = this.createTaskBar(task);
                    timelineArea.appendChild(taskBar);
                });
                
                areaRow.appendChild(timelineArea);
                employeeSection.appendChild(areaRow);
            });
            
            bodyScroll.appendChild(employeeSection);
        });
        
        // Add single time indicator that spans all rows
        const timeIndicator = document.createElement('div');
        timeIndicator.className = 'hourly-gantt-current-time';
        bodyScroll.appendChild(timeIndicator);
        
        body.appendChild(bodyScroll);
        
        return body;
    }
    
    createWorkBar(shift, area, employee) {
        // Create a thick colored bar showing when the employee is working for this area
        const workBar = document.createElement('div');
        workBar.className = `hourly-gantt-work-bar work-bar-${area}`;
        
        const startTime = shift.start_time.substring(0, 5); // "HH:MM"
        const endTime = shift.end_time.substring(0, 5);
        
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);
        const durationMinutes = endMinutes - startMinutes;
        
        const leftPosition = (startMinutes / 60) * this.hourWidth;
        const width = (durationMinutes / 60) * this.hourWidth;
        
        workBar.style.left = `${leftPosition}px`;
        workBar.style.width = `${width}px`;
        workBar.style.position = 'absolute';
        workBar.title = `Work hours: ${startTime} - ${endTime}\nClick to edit shift times`;
        workBar.style.cursor = 'pointer';
        workBar.style.pointerEvents = 'auto';
        
        // Make clickable to edit shift
        if (this.isEditable) {
            workBar.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.openEditShiftModal) {
                    window.openEditShiftModal(employee.id, employee.name, shift, this.formatDate(this.selectedDate));
                }
            });
        }
        
        console.log('Work bar created:', {
            area,
            startTime,
            endTime,
            leftPosition,
            width,
            className: workBar.className
        });
        
        return workBar;
    }
    
    createTaskBar(task) {
        const taskBar = document.createElement('div');
        taskBar.className = `hourly-gantt-task status-${task.status}`;
        
        const startMinutes = this.timeToMinutes(task.startTime);
        const endMinutes = this.timeToMinutes(task.endTime);
        const durationMinutes = endMinutes - startMinutes;
        
        const leftPosition = (startMinutes / 60) * this.hourWidth;
        const width = (durationMinutes / 60) * this.hourWidth;
        
        taskBar.style.left = `${leftPosition}px`;
        taskBar.style.width = `${width}px`;
        
        const taskContent = document.createElement('div');
        taskContent.className = 'hourly-gantt-task-content';
        
        // Add acknowledged badge if task is acknowledged
        const acknowledgedBadge = task.acknowledged 
            ? `<span class="acknowledged-icon" title="Acknowledged by ${task.acknowledgedBy || 'employee'} at ${task.acknowledgedAt ? new Date(task.acknowledgedAt).toLocaleTimeString() : 'unknown time'}">✓</span>`
            : '';
        
        taskContent.innerHTML = `
            ${acknowledgedBadge}
            <strong>${this.escapeHtml(task.name)}</strong>
            <span>${task.startTime} - ${task.endTime}</span>
        `;
        taskBar.appendChild(taskContent);
        
        // Add acknowledged class for styling
        if (task.acknowledged) {
            taskBar.classList.add('acknowledged');
        }
        
        // Add click handler for editing
        if (this.isEditable) {
            taskBar.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editTask(task);
            });
        }
        
        return taskBar;
    }
    
    renderEmptyState() {
        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <h3>No Employees Found</h3>
                <p>Add employees to the daily schedule first.</p>
            </div>
        `;
    }
    
    openAddTaskModal(employeeId, hour) {
        // This will be called from admin.js
        if (window.openHourlyTaskModal) {
            window.openHourlyTaskModal(employeeId, hour);
        }
    }
    
    editTask(task) {
        // This will be called from admin.js for editing
        if (window.editHourlyTask) {
            window.editHourlyTask(task);
        }
    }
    
    addTask(employeeId, taskName, startTime, endTime, status = 'pending', workArea = 'free') {
        const dateKey = this.formatDate(this.selectedDate);
        
        if (!this.data.tasks[dateKey]) {
            this.data.tasks[dateKey] = [];
        }
        
        // Get employee name from gantt data
        const ganttData = JSON.parse(localStorage.getItem('ganttData') || '{"employees":[]}');
        const employee = ganttData.employees.find(emp => emp.id === employeeId);
        const employeeName = employee ? employee.name : 'Unknown';
        
        const newTask = {
            id: this.data.nextTaskId++,
            employeeId: employeeId,
            employeeName: employeeName,
            name: taskName,
            startTime: startTime,
            endTime: endTime,
            status: status,
            workArea: workArea,
            date: dateKey,
            createdAt: new Date().toISOString()
        };
        
        this.data.tasks[dateKey].push(newTask);
        this.saveData();
        this.render();
        
        // Log the task creation
        if (typeof taskLogger !== 'undefined') {
            taskLogger.logEvent('created', newTask);
        }
        
        return newTask;
    }
    
    deleteTask(taskId) {
        const dateKey = this.formatDate(this.selectedDate);
        
        if (this.data.tasks[dateKey]) {
            // Find the task before deleting to log it
            const task = this.data.tasks[dateKey].find(t => t.id === taskId);
            
            if (task && typeof taskLogger !== 'undefined') {
                taskLogger.logEvent('deleted', task, { deletedAt: new Date().toISOString() });
            }
            
            this.data.tasks[dateKey] = this.data.tasks[dateKey].filter(task => task.id !== taskId);
            this.saveData();
            this.render();
        }
    }
    
    updateTask(taskId, updates) {
        const dateKey = this.formatDate(this.selectedDate);
        
        if (this.data.tasks[dateKey]) {
            const task = this.data.tasks[dateKey].find(t => t.id === taskId);
            if (task) {
                Object.assign(task, updates);
                this.saveData();
                this.render();
            }
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global instance for access from admin.js
let currentHourlyGantt = null;

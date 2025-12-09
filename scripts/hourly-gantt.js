// Hourly Gantt Chart for detailed day view
class HourlyGanttChart {
    constructor(containerId, selectedDate, isEditable = false) {
        this.container = document.getElementById(containerId);
        this.selectedDate = new Date(selectedDate);
        this.isEditable = isEditable;
        this.hourWidth = 80; // Width per hour
        this.timeIndicatorInterval = null;
        this.workAreas = ['music-prod', 'video-creation', 'administrative', 'other', 'note-other'];
        this.tasks = [];
        
        this.init();
    }
    
    async init() {
        await this.render();
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
    
    async getEmployees() {
        // Get employees from Supabase
        if (!supabaseService || !supabaseService.isReady()) {
            console.error('Supabase not available');
            return [];
        }
        
        const employees = await supabaseService.getEmployees();
        return employees || [];
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
        
        const employees = await this.getEmployees();
        
        if (employees.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        // Fetch tasks from Supabase
        const dateStr = this.formatDate(this.selectedDate);
        console.log('Fetching tasks for date:', dateStr);
        
        if (supabaseService && supabaseService.isReady()) {
            this.tasks = await supabaseService.getHourlyTasks(dateStr, dateStr) || [];
            console.log('Loaded tasks from Supabase:', this.tasks);
            
            // Load exceptions for this date
            this.exceptions = await supabaseService.getExceptionLogs({
                date: dateStr
            }) || [];
            console.log('Loaded exceptions from Supabase:', this.exceptions);
        } else {
            console.warn('Supabase not available, no tasks loaded');
            this.tasks = [];
            this.exceptions = [];
        }
        
        // Fetch shift data for all employees
        const employeesWithShifts = await Promise.all(
            employees.map(async (emp) => {
                const shift = await this.getEmployeeShift(emp.id, this.selectedDate);
                const empExceptions = this.exceptions.filter(exc => exc.employee_id === emp.id);
                console.log(`Employee ${emp.name} (ID: ${emp.id}) shift:`, shift, 'exceptions:', empExceptions);
                return {
                    ...emp,
                    shift: shift,
                    exceptions: empExceptions
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
        
        // Tasks are already loaded in this.tasks from render()
        
        const workAreaLabels = {
            'music-prod': 'Music Prod.',
            'video-creation': 'Video Creation',
            'administrative': 'Administrative',
            'other': 'Other',
            'note-other': 'Note - Other'
        };
        
        employees.forEach(employee => {
            const employeeSection = document.createElement('div');
            employeeSection.className = 'hourly-gantt-employee-section';
            
            // Employee name cell (spans all 4 work area rows)
            const employeeNameCell = document.createElement('div');
            employeeNameCell.className = 'hourly-gantt-employee-name-cell';
            
            // Add employee name
            const nameSpan = document.createElement('div');
            nameSpan.textContent = employee.name;
            nameSpan.style.fontWeight = '600';
            employeeNameCell.appendChild(nameSpan);
            
            // Add exception badges if any
            if (employee.exceptions && employee.exceptions.length > 0) {
                const exceptionColors = {
                    'VAUT': '#10b981',
                    'DO': '#3b82f6',
                    'UAEO': '#ef4444'
                };
                
                employee.exceptions.forEach(exc => {
                    const badge = document.createElement('div');
                    badge.style.cssText = `
                        background: ${exceptionColors[exc.exception_code] || '#64748b'};
                        color: white;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 600;
                        margin-top: 6px;
                        text-align: center;
                    `;
                    badge.textContent = exc.exception_code;
                    badge.title = exc.reason || exc.exception_code;
                    employeeNameCell.appendChild(badge);
                });
            }
            
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
                const employeeTasks = this.tasks.filter(task => 
                    task.employee_id === employee.id && task.work_area === area
                );
                
                console.log(`Tasks for ${employee.name} in ${area}:`, employeeTasks);
                
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
        console.log('Creating task bar for:', task);
        const taskBar = document.createElement('div');
        taskBar.className = `hourly-gantt-task status-${task.status}`;
        
        // Handle both Supabase format (start_time) and old format (startTime)
        const startTime = task.start_time || task.startTime;
        const endTime = task.end_time || task.endTime;
        
        console.log('Task times:', startTime, endTime);
        
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);
        const durationMinutes = endMinutes - startMinutes;
        
        const leftPosition = (startMinutes / 60) * this.hourWidth;
        const width = (durationMinutes / 60) * this.hourWidth;
        
        console.log('Task bar position:', { left: leftPosition, width: width });
        
        taskBar.style.left = `${leftPosition}px`;
        taskBar.style.width = `${width}px`;
        
        const taskContent = document.createElement('div');
        taskContent.className = 'hourly-gantt-task-content';
        
        // Add acknowledged badge if task is acknowledged
        const acknowledgedBy = task.acknowledged_by || task.acknowledgedBy;
        const acknowledgedAt = task.acknowledged_at || task.acknowledgedAt;
        const acknowledgedBadge = task.acknowledged 
            ? `<span class="acknowledged-icon" title="Acknowledged by ${acknowledgedBy || 'employee'} at ${acknowledgedAt ? new Date(acknowledgedAt).toLocaleTimeString() : 'unknown time'}">✓</span>`
            : '';
        
        taskContent.innerHTML = `
            ${acknowledgedBadge}
            <strong>${this.escapeHtml(task.name)}</strong>
            <span>${startTime.substring(0,5)} - ${endTime.substring(0,5)}</span>
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
    
    async addTask(employeeId, taskName, startTime, endTime, status = 'pending', workArea = 'other') {
        const dateKey = this.formatDate(this.selectedDate);
        
        // Get employee name from Supabase
        const employees = await supabaseService.getEmployees();
        const employee = employees.find(emp => emp.id === employeeId);
        const employeeName = employee ? employee.name : 'Unknown';
        
        const taskData = {
            employee_id: employeeId,
            employee_name: employeeName,
            name: taskName,
            start_time: startTime,
            end_time: endTime,
            status: status,
            work_area: workArea,
            task_date: dateKey
        };
        
        console.log('Creating task with data:', taskData);
        const newTask = await supabaseService.createHourlyTask(taskData);
        console.log('Task created:', newTask);
        
        // Re-render to show the new task
        await this.render();
        
        return newTask;
    }
    
    async deleteTask(taskId) {
        await supabaseService.deleteHourlyTask(taskId);
        
        // Re-render to show the task removed
        await this.render();
    }
    
    async updateTask(taskId, updates) {
        // Convert camelCase keys to snake_case if needed
        const snakeCaseUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (key === 'startTime') snakeCaseUpdates.start_time = value;
            else if (key === 'endTime') snakeCaseUpdates.end_time = value;
            else if (key === 'employeeId') snakeCaseUpdates.employee_id = value;
            else if (key === 'employeeName') snakeCaseUpdates.employee_name = value;
            else if (key === 'workArea') snakeCaseUpdates.work_area = value;
            else if (key === 'taskDate') snakeCaseUpdates.task_date = value;
            else snakeCaseUpdates[key] = value;
        }
        
        await supabaseService.updateHourlyTask(taskId, snakeCaseUpdates);
        
        // Re-render to show the updates
        await this.render();
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global instance for access from admin.js
let currentHourlyGantt = null;

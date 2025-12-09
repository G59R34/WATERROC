// Supabase Integration for Waterstream
// ===================================
// This file handles all database operations with Supabase

class SupabaseService {
    constructor() {
        this.supabaseUrl = null;
        this.supabaseKey = null;
        this.client = null;
        this.isInitialized = false;
        this.currentUser = null;
    }
    
    /**
     * Initialize Supabase client
     * @param {string} url - Your Supabase project URL
     * @param {string} key - Your Supabase anon/public key
     */
    async init(url, key) {
        this.supabaseUrl = url;
        this.supabaseKey = key;
        
        // Initialize Supabase client (requires @supabase/supabase-js library)
        if (typeof supabase !== 'undefined') {
            this.client = supabase.createClient(url, key);
            this.isInitialized = true;
            
            // Check for existing session
            const { data: { session } } = await this.client.auth.getSession();
            if (session) {
                await this.loadCurrentUser();
            }
            
            console.log('✅ Supabase initialized successfully');
        } else {
            console.error('❌ Supabase library not loaded. Please include the Supabase JS library.');
        }
    }
    
    /**
     * Check if Supabase is configured and ready
     */
    isReady() {
        return this.isInitialized && this.client !== null;
    }
    
    // ==========================================
    // AUTHENTICATION OPERATIONS
    // ==========================================
    
    /**
     * Sign up a new user
     */
    async signUp(email, password, username, fullName) {
        if (!this.isReady()) return { error: 'Supabase not initialized' };
        
        try {
            const { data, error } = await this.client.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        username: username,
                        full_name: fullName
                    }
                }
            });
            
            if (error) throw error;
            
            if (data.user) {
                await this.loadCurrentUser();
            }
            
            console.log('✅ User signed up successfully');
            return { data, error: null };
        } catch (error) {
            console.error('Error signing up:', error);
            return { data: null, error: error.message };
        }
    }
    
    /**
     * Sign in existing user
     */
    async signIn(email, password) {
        if (!this.isReady()) return { error: 'Supabase not initialized' };
        
        try {
            const { data, error } = await this.client.auth.signInWithPassword({
                email: email,
                password: password
            });
            
            if (error) throw error;
            
            if (data.user) {
                await this.loadCurrentUser();
            }
            
            console.log('✅ User signed in successfully');
            return { data, error: null };
        } catch (error) {
            console.error('Error signing in:', error);
            return { data: null, error: error.message };
        }
    }
    
    /**
     * Sign out current user
     */
    async signOut() {
        if (!this.isReady()) return { error: 'Supabase not initialized' };
        
        try {
            const { error } = await this.client.auth.signOut();
            if (error) throw error;
            
            this.currentUser = null;
            console.log('✅ User signed out');
            return { error: null };
        } catch (error) {
            console.error('Error signing out:', error);
            return { error: error.message };
        }
    }
    
    /**
     * Get current session
     */
    async getSession() {
        if (!this.isReady()) return null;
        
        const { data: { session } } = await this.client.auth.getSession();
        return session;
    }
    
    /**
     * Load user profile from database
     */
    async loadCurrentUser() {
        if (!this.isReady()) return null;
        
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) return null;
        
        console.log('🔍 Loading user profile for auth_id:', user.id);
        
        const { data, error } = await this.client
            .from('users')
            .select('*')
            .eq('auth_id', user.id)
            .single();
        
        if (error) {
            console.error('Error loading user profile:', error);
            return null;
        }
        
        console.log('👤 User profile loaded:', {
            username: data.username,
            email: data.email,
            is_admin: data.is_admin,
            role: data.role
        });
        
        this.currentUser = data;
        return data;
    }
    
    /**
     * Check if current user is admin
     */
    isAdmin() {
        return this.currentUser && this.currentUser.is_admin === true;
    }
    
    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    }
    
    /**
     * Get all users (for admin purposes)
     */
    async getAllUsers() {
        if (!this.isReady()) return null;
        
        try {
            const { data, error } = await this.client
                .from('users')
                .select('id, username, email, full_name, is_admin, role')
                .order('username');
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching users:', error);
            return null;
        }
    }
    
    // ==========================================
    // EMPLOYEE OPERATIONS
    // ==========================================
    
    /**
     * Fetch all employees from Supabase
     * Includes user information if employee is linked to a user account
     */
    async getEmployees() {
        if (!this.isReady()) {
            console.warn('Supabase not initialized, using local storage');
            return null;
        }
        
        try {
            const { data, error } = await this.client
                .from('employees')
                .select(`
                    *,
                    user:user_id (
                        id,
                        username,
                        email,
                        is_admin
                    )
                `)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching employees:', error);
            return null;
        }
    }
    
    /**
     * Add a new employee to Supabase
     * @param {string} name - Employee name
     * @param {string} role - Employee role
     * @param {string} user_id - Optional: UUID of the user from users table to link this employee to
     */
    async addEmployee(name, role, user_id = null) {
        if (!this.isReady()) {
            console.warn('Supabase not initialized, using local storage');
            return null;
        }
        
        try {
            const employeeData = { 
                name: name, 
                role: role
            };
            
            // Add user_id if provided
            if (user_id) {
                employeeData.user_id = user_id;
            }
            
            const { data, error } = await this.client
                .from('employees')
                .insert([employeeData])
                .select();
            
            if (error) throw error;
            console.log('✅ Employee added to Supabase', user_id ? `(linked to user ${user_id})` : '');
            return data[0];
        } catch (error) {
            console.error('Error adding employee:', error);
            return null;
        }
    }
    
    /**
     * Update an existing employee
     */
    async updateEmployee(id, updates) {
        if (!this.isReady()) return null;
        
        try {
            const { data, error } = await this.client
                .from('employees')
                .update(updates)
                .eq('id', id)
                .select();
            
            if (error) throw error;
            console.log('✅ Employee updated');
            return data[0];
        } catch (error) {
            console.error('Error updating employee:', error);
            return null;
        }
    }
    
    /**
     * Delete an employee
     */
    async deleteEmployee(id) {
        if (!this.isReady()) return false;
        
        try {
            const { error } = await this.client
                .from('employees')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            console.log('✅ Employee deleted');
            return true;
        } catch (error) {
            console.error('Error deleting employee:', error);
            return false;
        }
    }
    
    // ==========================================
    // TASK OPERATIONS
    // ==========================================
    
    /**
     * Fetch all tasks from Supabase
     */
    async getTasks() {
        if (!this.isReady()) {
            console.warn('Supabase not initialized, using local storage');
            return null;
        }
        
        try {
            const { data, error } = await this.client
                .from('tasks')
                .select('*')
                .order('start_date', { ascending: true });
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching tasks:', error);
            return null;
        }
    }
    
    /**
     * Add a new task to Supabase
     */
    async addTask(employeeId, name, startDate, endDate, startTime, endTime, status) {
        if (!this.isReady()) {
            console.warn('Supabase not initialized, using local storage');
            return null;
        }
        
        try {
            const userId = this.currentUser ? this.currentUser.id : null;
            
            const { data, error } = await this.client
                .from('tasks')
                .insert([
                    {
                        employee_id: employeeId,
                        name: name,
                        start_date: startDate,
                        end_date: endDate,
                        start_time: startTime,
                        end_time: endTime,
                        status: status,
                        created_by: userId,
                        updated_by: userId
                    }
                ])
                .select();
            
            if (error) throw error;
            console.log('✅ Task added to Supabase');
            return data[0];
        } catch (error) {
            console.error('Error adding task:', error);
            return null;
        }
    }
    
    /**
     * Update an existing task
     */
    async updateTask(id, updates) {
        if (!this.isReady()) return null;
        
        try {
            const userId = this.currentUser ? this.currentUser.id : null;
            updates.updated_by = userId;
            
            const { data, error } = await this.client
                .from('tasks')
                .update(updates)
                .eq('id', id)
                .select();
            
            if (error) throw error;
            console.log('✅ Task updated');
            return data[0];
        } catch (error) {
            console.error('Error updating task:', error);
            return null;
        }
    }
    
    /**
     * Delete a task
     */
    async deleteTask(id) {
        if (!this.isReady()) return false;
        
        try {
            console.log('🗑️ Deleting task from Supabase, ID:', id);
            
            const { data, error } = await this.client
                .from('tasks')
                .delete()
                .eq('id', id)
                .select(); // Add select to see what was deleted
            
            if (error) throw error;
            
            console.log('✅ Task deleted from Supabase:', data);
            return true;
        } catch (error) {
            console.error('❌ Error deleting task:', error);
            return false;
        }
    }
    
    // ==========================================
    // TASK ACKNOWLEDGEMENT OPERATIONS
    // ==========================================
    
    /**
     * Acknowledge a task
     */
    async acknowledgeTask(taskId, notes = null) {
        if (!this.isReady()) return null;
        
        try {
            const userId = this.currentUser ? this.currentUser.id : null;
            if (!userId) throw new Error('User not authenticated');
            
            const { data, error } = await this.client
                .from('task_acknowledgements')
                .insert([
                    {
                        task_id: taskId,
                        user_id: userId,
                        notes: notes
                    }
                ])
                .select();
            
            if (error) throw error;
            console.log('✅ Task acknowledged');
            return data[0];
        } catch (error) {
            console.error('Error acknowledging task:', error);
            return null;
        }
    }
    
    /**
     * Remove task acknowledgement
     */
    async unacknowledgeTask(taskId) {
        if (!this.isReady()) return false;
        
        try {
            const userId = this.currentUser ? this.currentUser.id : null;
            if (!userId) throw new Error('User not authenticated');
            
            const { error } = await this.client
                .from('task_acknowledgements')
                .delete()
                .eq('task_id', taskId)
                .eq('user_id', userId);
            
            if (error) throw error;
            console.log('✅ Task acknowledgement removed');
            return true;
        } catch (error) {
            console.error('Error removing acknowledgement:', error);
            return false;
        }
    }
    
    /**
     * Get all acknowledgements for a task
     */
    async getTaskAcknowledgements(taskId) {
        if (!this.isReady()) return null;
        
        try {
            const { data, error } = await this.client
                .from('task_acknowledgements')
                .select(`
                    *,
                    user:users(id, username, full_name, email)
                `)
                .eq('task_id', taskId);
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching acknowledgements:', error);
            return null;
        }
    }
    
    /**
     * Check if current user has acknowledged a task
     */
    async hasAcknowledgedTask(taskId) {
        if (!this.isReady()) return false;
        
        try {
            const userId = this.currentUser ? this.currentUser.id : null;
            if (!userId) return false;
            
            const { data, error } = await this.client
                .from('task_acknowledgements')
                .select('id')
                .eq('task_id', taskId)
                .eq('user_id', userId)
                .single();
            
            return data !== null;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Get all tasks with acknowledgement status
     */
    async getTasksWithAcknowledgements() {
        if (!this.isReady()) return null;
        
        try {
            const { data, error } = await this.client
                .from('tasks')
                .select(`
                    *,
                    acknowledgements:task_acknowledgements(
                        id,
                        acknowledged_at,
                        notes,
                        user:users(id, username, full_name)
                    )
                `)
                .order('start_date', { ascending: true });
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching tasks with acknowledgements:', error);
            return null;
        }
    }
    
    // ==========================================
    // TASK MESSAGING OPERATIONS
    // ==========================================
    
    /**
     * Send a message about a task
     */
    async sendTaskMessage(taskId, message, isFromAdmin = false) {
        if (!this.isReady() || !this.currentUser) return false;
        
        try {
            const { data, error } = await this.client
                .from('task_messages')
                .insert({
                    task_id: taskId,
                    user_id: this.currentUser.id,
                    message: message,
                    is_from_admin: isFromAdmin,
                    is_read: false
                })
                .select()
                .single();
            
            if (error) throw error;
            console.log('✅ Message sent successfully');
            return data;
        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }
    
    /**
     * Get all messages for a task
     */
    async getTaskMessages(taskId) {
        if (!this.isReady()) return null;
        
        try {
            const { data, error } = await this.client
                .from('task_messages')
                .select(`
                    *,
                    user:users(
                        full_name,
                        username,
                        is_admin
                    )
                `)
                .eq('task_id', taskId)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching messages:', error);
            return null;
        }
    }
    
    /**
     * Mark messages as read
     */
    async markMessagesAsRead(taskId) {
        if (!this.isReady() || !this.currentUser) return false;
        
        try {
            const { error } = await this.client
                .from('task_messages')
                .update({ is_read: true })
                .eq('task_id', taskId)
                .neq('user_id', this.currentUser.id); // Don't mark own messages as read
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error marking messages as read:', error);
            return false;
        }
    }
    
    /**
     * Get unread message count for admin
     */
    async getUnreadMessageCount() {
        if (!this.isReady() || !this.currentUser) return 0;
        
        try {
            const { count, error } = await this.client
                .from('task_messages')
                .select('*', { count: 'exact', head: true })
                .eq('is_read', false)
                .eq('is_from_admin', false); // Messages from employees to admin
            
            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error fetching unread message count:', error);
            return 0;
        }
    }
    
    // ==========================================
    // ANNOUNCEMENT OPERATIONS
    // ==========================================
    
    /**
     * Create a new announcement
     */
    async createAnnouncement(title, message, priority = 'normal') {
        if (!this.isReady() || !this.currentUser) return false;
        
        try {
            const { data, error } = await this.client
                .from('announcements')
                .insert({
                    title: title,
                    message: message,
                    priority: priority,
                    created_by: this.currentUser.id
                })
                .select()
                .single();
            
            if (error) throw error;
            console.log('✅ Announcement created successfully');
            return data;
        } catch (error) {
            console.error('Error creating announcement:', error);
            return false;
        }
    }
    
    /**
     * Get all announcements (ordered by newest first)
     */
    async getAnnouncements(limit = 50) {
        if (!this.isReady()) return null;
        
        try {
            const { data, error } = await this.client
                .from('announcements')
                .select(`
                    *,
                    creator:users!created_by(
                        full_name,
                        username
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(limit);
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching announcements:', error);
            return null;
        }
    }
    
    /**
     * Get unread announcements for current user
     */
    async getUnreadAnnouncements() {
        if (!this.isReady() || !this.currentUser) return null;
        
        try {
            const { data, error } = await this.client
                .from('announcements')
                .select(`
                    *,
                    creator:users!created_by(
                        full_name,
                        username
                    ),
                    reads:announcement_reads(user_id)
                `)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            // Filter out announcements that current user has read
            const unread = data.filter(announcement => {
                const hasRead = announcement.reads?.some(
                    read => read.user_id === this.currentUser.id
                );
                return !hasRead;
            });
            
            return unread;
        } catch (error) {
            console.error('Error fetching unread announcements:', error);
            return null;
        }
    }
    
    /**
     * Mark announcement as read
     */
    async markAnnouncementAsRead(announcementId) {
        if (!this.isReady() || !this.currentUser) return false;
        
        try {
            const { error } = await this.client
                .from('announcement_reads')
                .insert({
                    announcement_id: announcementId,
                    user_id: this.currentUser.id
                });
            
            if (error) throw error;
            return true;
        } catch (error) {
            // Ignore duplicate key errors (already marked as read)
            if (error.code === '23505') {
                return true;
            }
            console.error('Error marking announcement as read:', error);
            return false;
        }
    }
    
    /**
     * Delete an announcement (admin only)
     */
    async deleteAnnouncement(announcementId) {
        if (!this.isReady() || !this.isAdmin()) return false;
        
        try {
            const { error } = await this.client
                .from('announcements')
                .delete()
                .eq('id', announcementId);
            
            if (error) throw error;
            console.log('✅ Announcement deleted successfully');
            return true;
        } catch (error) {
            console.error('Error deleting announcement:', error);
            return false;
        }
    }
    
    // ==========================================
    // SYNC OPERATIONS
    // ==========================================
    
    /**
     * Sync all data from Supabase to local storage
     */
    async syncFromSupabase() {
        if (!this.isReady()) return false;
        
        try {
            const employees = await this.getEmployees();
            const tasks = await this.getTasks();
            
            if (employees && tasks) {
                const data = {
                    employees: employees,
                    tasks: tasks,
                    nextEmployeeId: Math.max(...employees.map(e => e.id), 0) + 1,
                    nextTaskId: Math.max(...tasks.map(t => t.id), 0) + 1
                };
                
                localStorage.setItem('ganttData', JSON.stringify(data));
                console.log('✅ Data synced from Supabase');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error syncing from Supabase:', error);
            return false;
        }
    }
    
    /**
     * Subscribe to real-time changes
     */
    subscribeToChanges(callback) {
        if (!this.isReady()) return null;
        
        // Subscribe to employee changes
        const employeeSubscription = this.client
            .channel('employees-channel')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'employees' },
                (payload) => {
                    console.log('Employee change detected:', payload);
                    callback('employee', payload);
                }
            )
            .subscribe();
        
        // Subscribe to task changes
        const taskSubscription = this.client
            .channel('tasks-channel')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'tasks' },
                (payload) => {
                    console.log('Task change detected:', payload);
                    callback('task', payload);
                }
            )
            .subscribe();
        
        return { employeeSubscription, taskSubscription };
    }

    // ==========================================
    // EMPLOYEE PROFILES
    // ==========================================

    async getEmployeeProfile(employeeId) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('employee_profiles')
            .select('*')
            .eq('employee_id', employeeId)
            .single();

        if (error) {
            console.error('Error fetching employee profile:', error);
            return null;
        }

        return data;
    }

    async createOrUpdateEmployeeProfile(employeeId, profileData) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('employee_profiles')
            .upsert({
                employee_id: employeeId,
                ...profileData,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'employee_id'
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating/updating employee profile:', error);
            return null;
        }

        console.log('✅ Employee profile saved');
        return data;
    }

    async getAllEmployeeProfiles() {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('employee_profiles')
            .select(`
                *,
                employees:employee_id (
                    id,
                    name,
                    role
                )
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching employee profiles:', error);
            return null;
        }

        return data;
    }

    // ==========================================
    // SHIFT SCHEDULING
    // ==========================================

    async getShiftTemplates() {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('shift_templates')
            .select('*')
            .order('start_time', { ascending: true });

        if (error) {
            console.error('Error fetching shift templates:', error);
            return null;
        }

        return data;
    }

    async createShiftTemplate(templateData) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('shift_templates')
            .insert(templateData)
            .select()
            .single();

        if (error) {
            console.error('Error creating shift template:', error);
            return null;
        }

        console.log('✅ Shift template created');
        return data;
    }

    async getEmployeeShifts(startDate, endDate) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('employee_shifts')
            .select(`
                *,
                employees:employee_id (
                    id,
                    name,
                    role
                ),
                shift_templates:shift_template_id (
                    name,
                    color
                )
            `)
            .gte('shift_date', startDate)
            .lte('shift_date', endDate)
            .order('shift_date', { ascending: true });

        if (error) {
            console.error('Error fetching employee shifts:', error);
            return null;
        }

        return data;
    }

    async createEmployeeShift(shiftData) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('employee_shifts')
            .insert({
                ...shiftData,
                created_by: this.currentUser?.id
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating employee shift:', error);
            return null;
        }

        console.log('✅ Shift assigned');
        return data;
    }

    async updateEmployeeShift(shiftId, updates) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('employee_shifts')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', shiftId)
            .select()
            .single();

        if (error) {
            console.error('Error updating shift:', error);
            return null;
        }

        console.log('✅ Shift updated');
        return data;
    }

    async deleteEmployeeShift(shiftId) {
        if (!this.isReady()) return null;

        const { error } = await this.client
            .from('employee_shifts')
            .delete()
            .eq('id', shiftId);

        if (error) {
            console.error('Error deleting shift:', error);
            return false;
        }

        console.log('✅ Shift deleted');
        return true;
    }

    // ==========================================
    // HOURLY TASKS
    // ==========================================

    /**
     * Get hourly tasks for a specific date range
     */
    async getHourlyTasks(startDate, endDate, employeeId = null) {
        if (!this.isReady()) return null;

        let query = this.client
            .from('hourly_tasks')
            .select(`
                *,
                employees:employee_id (
                    id,
                    name
                )
            `)
            .gte('task_date', startDate)
            .lte('task_date', endDate)
            .order('task_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (employeeId) {
            query = query.eq('employee_id', employeeId);
        }

        const { data, error} = await query;

        if (error) {
            console.error('Error fetching hourly tasks:', error);
            return null;
        }

        return data;
    }

    /**
     * Create a new hourly task
     */
    async createHourlyTask(taskData) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('hourly_tasks')
            .insert([{
                employee_id: taskData.employee_id,
                task_date: taskData.task_date,
                name: taskData.name,
                start_time: taskData.start_time,
                end_time: taskData.end_time,
                work_area: taskData.work_area,
                status: taskData.status || 'pending',
                created_by: taskData.created_by
            }])
            .select()
            .single();

        if (error) {
            console.error('Error creating hourly task:', error);
            return null;
        }

        console.log('✅ Hourly task created:', data);
        return data;
    }

    /**
     * Update an existing hourly task
     */
    async updateHourlyTask(taskId, updates) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('hourly_tasks')
            .update(updates)
            .eq('id', taskId)
            .select()
            .single();

        if (error) {
            console.error('Error updating hourly task:', error);
            return null;
        }

        console.log('✅ Hourly task updated:', data);
        return data;
    }

    /**
     * Delete an hourly task
     */
    async deleteHourlyTask(taskId) {
        if (!this.isReady()) return false;

        const { error } = await this.client
            .from('hourly_tasks')
            .delete()
            .eq('id', taskId);

        if (error) {
            console.error('Error deleting hourly task:', error);
            return false;
        }

        console.log('✅ Hourly task deleted');
        return true;
    }

    /**
     * Acknowledge a task (employee action)
     */
    async acknowledgeTask(taskId, employeeName) {
        if (!this.isReady()) return null;

        return await this.updateHourlyTask(taskId, {
            acknowledged: true,
            acknowledged_at: new Date().toISOString(),
            acknowledged_by: employeeName
        });
    }

    /**
     * Get task logs with optional filtering
     */
    async getTaskLogs(filters = {}) {
        if (!this.isReady()) return null;

        let query = this.client
            .from('task_logs')
            .select('*')
            .order('timestamp', { ascending: false });

        if (filters.action) query = query.eq('action', filters.action);
        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.workArea) query = query.eq('work_area', filters.workArea);
        if (filters.startDate) query = query.gte('task_date', filters.startDate);
        if (filters.endDate) query = query.lte('task_date', filters.endDate);
        if (filters.limit) query = query.limit(filters.limit);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching task logs:', error);
            return null;
        }

        return data;
    }

    /**
     * Get task statistics for an employee
     */
    async getTaskStatistics(employeeId, startDate = null, endDate = null) {
        if (!this.isReady()) return null;

        let query = this.client
            .from('task_statistics')
            .select('*')
            .eq('employee_id', employeeId)
            .order('date', { ascending: false });

        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching task statistics:', error);
            return null;
        }

        return data;
    }

    /**
     * Get all employee task statistics for leaderboard
     */
    async getAllEmployeeStatistics(date = null) {
        if (!this.isReady()) return null;

        let query = this.client
            .from('task_statistics')
            .select(`
                *,
                employees:employee_id (
                    id,
                    name
                )
            `)
            .order('completion_rate', { ascending: false });

        if (date) {
            query = query.eq('date', date);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching all employee statistics:', error);
            return null;
        }

        return data;
    }

    // ==========================================
    // TIME OFF REQUESTS
    // ==========================================

    async getTimeOffRequests(employeeId = null) {
        if (!this.isReady()) return null;

        let query = this.client
            .from('time_off_requests')
            .select(`
                *,
                employees:employee_id (
                    id,
                    name
                )
            `)
            .order('requested_at', { ascending: false });

        if (employeeId) {
            query = query.eq('employee_id', employeeId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching time off requests:', error);
            return null;
        }

        return data;
    }

    async createTimeOffRequest(requestData) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('time_off_requests')
            .insert(requestData)
            .select()
            .single();

        if (error) {
            console.error('Error creating time off request:', error);
            return null;
        }

        console.log('✅ Time off request submitted');
        return data;
    }

    async updateTimeOffRequest(requestId, updates) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('time_off_requests')
            .update({
                ...updates,
                reviewed_by: this.currentUser?.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', requestId)
            .select()
            .single();

        if (error) {
            console.error('Error updating time off request:', error);
            return null;
        }

        console.log('✅ Time off request updated');
        return data;
    }

    // ==========================================
    // ANALYTICS & TIME TRACKING
    // ==========================================

    async getTaskTimeLogs(taskId) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('task_time_logs')
            .select(`
                *,
                employees:employee_id (
                    name
                )
            `)
            .eq('task_id', taskId)
            .order('clock_in', { ascending: false });

        if (error) {
            console.error('Error fetching task time logs:', error);
            return null;
        }

        return data;
    }

    async clockIn(taskId, employeeId, notes = '') {
        if (!this.isReady()) return null;

        // Check if already clocked in
        const { data: existing } = await this.client
            .from('task_time_logs')
            .select('*')
            .eq('task_id', taskId)
            .eq('employee_id', employeeId)
            .is('clock_out', null)
            .single();

        if (existing) {
            console.warn('Already clocked in');
            return existing;
        }

        const { data, error } = await this.client
            .from('task_time_logs')
            .insert({
                task_id: taskId,
                employee_id: employeeId,
                clock_in: new Date().toISOString(),
                notes
            })
            .select()
            .single();

        if (error) {
            console.error('Error clocking in:', error);
            return null;
        }

        console.log('✅ Clocked in');
        return data;
    }

    async clockOut(timeLogId, notes = '') {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('task_time_logs')
            .update({
                clock_out: new Date().toISOString(),
                notes: notes || undefined
            })
            .eq('id', timeLogId)
            .select()
            .single();

        if (error) {
            console.error('Error clocking out:', error);
            return null;
        }

        console.log('✅ Clocked out');
        return data;
    }

    async getActiveTimeLog(taskId, employeeId) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('task_time_logs')
            .select('*')
            .eq('task_id', taskId)
            .eq('employee_id', employeeId)
            .is('clock_out', null)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Error fetching active time log:', error);
            return null;
        }

        return data;
    }

    async getTaskMetrics(taskId) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('task_metrics')
            .select('*')
            .eq('task_id', taskId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching task metrics:', error);
            return null;
        }

        return data;
    }

    async getEmployeeWorkload(startDate, endDate) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .rpc('get_employee_workload', {
                start_date_param: startDate,
                end_date_param: endDate
            });

        if (error) {
            console.error('Error fetching employee workload:', error);
            return null;
        }

        return data;
    }

    async getAnalyticsSummary(startDate, endDate) {
        if (!this.isReady()) return null;

        // Get tasks in date range
        const { data: tasks, error: tasksError } = await this.client
            .from('tasks')
            .select(`
                *,
                task_metrics (
                    actual_hours,
                    completed_on_time
                )
            `)
            .gte('date', startDate)
            .lte('date', endDate);

        if (tasksError) {
            console.error('Error fetching analytics:', tasksError);
            return null;
        }

        // Calculate summary statistics
        const summary = {
            total_tasks: tasks.length,
            completed_tasks: tasks.filter(t => t.status === 'completed').length,
            in_progress_tasks: tasks.filter(t => t.status === 'in-progress').length,
            pending_tasks: tasks.filter(t => t.status === 'pending').length,
            overdue_tasks: tasks.filter(t => t.status === 'overdue').length,
            on_time_completion_rate: 0,
            total_hours_logged: 0,
            avg_hours_per_task: 0
        };

        const completedWithMetrics = tasks.filter(t => 
            t.status === 'completed' && t.task_metrics?.length > 0
        );

        if (completedWithMetrics.length > 0) {
            const onTimeCount = completedWithMetrics.filter(t => 
                t.task_metrics[0]?.completed_on_time
            ).length;
            
            summary.on_time_completion_rate = (onTimeCount / completedWithMetrics.length) * 100;
            
            summary.total_hours_logged = completedWithMetrics.reduce((sum, t) => 
                sum + (t.task_metrics[0]?.actual_hours || 0), 0
            );
            
            summary.avg_hours_per_task = summary.total_hours_logged / completedWithMetrics.length;
        }

        return summary;
    }
}

// Create global instance
const supabaseService = new SupabaseService();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseService;
}


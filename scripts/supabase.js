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
}

// Create global instance
const supabaseService = new SupabaseService();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseService;
}

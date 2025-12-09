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

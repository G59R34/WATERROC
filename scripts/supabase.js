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
     * Get user by ID (UUID)
     * @param {string} userId - User UUID
     * @returns {Promise<Object|null>}
     */
    async getUserById(userId) {
        if (!this.isReady()) return null;

        try {
            const { data, error } = await this.client
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Error getting user by ID:', error);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Error getting user by ID:', error);
            return null;
        }
    }

    /**
     * Get current employee record based on logged-in user
     * @returns {Promise<Object|null>} Employee record or null
     */
    async getCurrentEmployee() {
        if (!this.isReady()) return null;

        try {
            const user = await this.getCurrentUser();
            if (!user) return null;

            const { data, error } = await this.client
                .from('employees')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle(); // Use maybeSingle() instead of single() to avoid errors when no record exists

            if (error) {
                // Only log non-PGRST116 errors (PGRST116 = no rows found, which is acceptable)
                if (error.code !== 'PGRST116') {
                    console.error('Error getting current employee:', error);
                }
                return null;
            }

            return data;
        } catch (error) {
            // Only log if it's not a "no rows" error
            if (error.code !== 'PGRST116') {
                console.error('Error getting current employee:', error);
            }
            return null;
        }
    }
    
    /**
     * Get current user (loads if not already loaded)
     */
    async getCurrentUser() {
        if (!this.currentUser) {
            await this.loadCurrentUser();
        }
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
     * Get employees with their profiles including employment type
     */
    async getEmployeesWithProfiles() {
        if (!this.isReady()) return null;

        try {
            // Fetch employees and profiles separately to avoid relationship ambiguity
            const { data: employees, error: empError } = await this.client
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

            if (empError) throw empError;

            // Fetch all profiles
            const { data: profiles, error: profileError } = await this.client
                .from('employee_profiles')
                .select('id, employee_id, employment_type, employment_status');

            if (profileError) throw profileError;

            // Create a map of employee_id -> profile
            const profileMap = new Map();
            if (profiles) {
                profiles.forEach(profile => {
                    profileMap.set(profile.employee_id, profile);
                });
            }

            // Combine employees with their profiles
            const employeesWithProfiles = (employees || []).map(emp => {
                const profile = profileMap.get(emp.id);
                return {
                    ...emp,
                    employee_profiles: profile || null
                };
            });

            // Filter to only active employees with profiles
            return employeesWithProfiles.filter(emp => {
                const profile = emp.employee_profiles;
                return profile && profile.employment_status === 'active';
            });
        } catch (error) {
            console.error('Error fetching employees with profiles:', error);
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
     * Delete an employee (admin only)
     * This will delete the employee profile first, then the employee record
     * Cascading deletes will handle related records (tasks, shifts, etc.)
     * @param {number} id - Employee ID to delete
     * @returns {Promise<boolean>} True if successful, false otherwise
     */
    async deleteEmployee(id) {
        if (!this.isReady()) return false;

        // Check if user is admin
        const isAdmin = await this.isAdmin();
        if (!isAdmin) {
            console.error('Only admins can delete employees');
            return false;
        }

        try {
            // Get employee info for confirmation
            const { data: employee, error: fetchError } = await this.client
                .from('employees')
                .select('id, name, role')
                .eq('id', id)
                .single();

            if (fetchError || !employee) {
                console.error('Error fetching employee:', fetchError);
                return false;
            }

            // Step 1: Delete task_logs first (if they exist)
            // This ensures logs are deleted before the employee, avoiding trigger issues
            const { error: logsError } = await this.client
                .from('task_logs')
                .delete()
                .eq('employee_id', id);
            
            if (logsError) {
                // If logs don't exist or error, that's okay - continue
                if (logsError.code !== 'PGRST116') { // PGRST116 = no rows found
                    console.warn('Warning deleting task logs:', logsError);
                }
            } else {
                console.log(`✅ Deleted task logs for employee ${id}`);
            }

            // Step 2: Delete employee profile first (if it exists)
            // This handles the foreign key constraint from employee_profiles
            const { error: profileError } = await this.client
                .from('employee_profiles')
                .delete()
                .eq('employee_id', id);
            
            if (profileError) {
                // If profile doesn't exist, that's okay - continue with employee deletion
                if (profileError.code !== 'PGRST116') { // PGRST116 = no rows found
                    console.warn('Warning deleting employee profile:', profileError);
                    // Continue anyway - profile might not exist
                }
            } else {
                console.log(`✅ Deleted employee profile for employee ${id}`);
            }

            // Step 3: Delete the employee (cascading deletes will handle other related records)
            const { error } = await this.client
                .from('employees')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            console.log(`✅ Employee deleted: ${employee.name} (ID: ${id})`);
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
            // Get current user ID, but don't fail if no user/employee record exists
            let userId = null;
            try {
                const user = await this.getCurrentUser();
                userId = user ? user.id : null;
            } catch (error) {
                // User might not have employee record (e.g., admin), that's okay
                console.log('ℹ️ No user/employee record found, creating task without created_by');
            }
            
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
            // If status is being set to 'overdue', get task details first to create NSFT exception
            // But only if task has started and hasn't been acknowledged
            let taskData = null;
            if (updates.status === 'overdue') {
                const { data: task } = await this.client
                    .from('tasks')
                    .select('*')
                    .eq('id', id)
                    .single();
                
                if (task) {
                    // Check if task has been acknowledged
                    const { data: acknowledgements } = await this.client
                        .from('task_acknowledgements')
                        .select('id')
                        .eq('task_id', id)
                        .limit(1);

                    // Check if task has started
                    const now = new Date();
                    const today = now.toISOString().split('T')[0];
                    const taskStartDate = new Date(task.start_date);
                    taskStartDate.setHours(0, 0, 0, 0);
                    const todayDate = new Date(today);
                    todayDate.setHours(0, 0, 0, 0);

                    const timeToMinutes = (timeStr) => {
                        if (!timeStr) return 0;
                        if (timeStr.includes(':')) {
                            const [hours, minutes] = timeStr.split(':').map(Number);
                            return hours * 60 + minutes;
                        }
                        const hours = parseInt(timeStr.substring(0, 2));
                        const minutes = parseInt(timeStr.substring(2, 4));
                        return hours * 60 + minutes;
                    };

                    const taskStartMinutes = timeToMinutes(task.start_time);
                    const currentMinutes = now.getHours() * 60 + now.getMinutes();

                    const startDatePassed = taskStartDate < todayDate;
                    const startTimePassed = taskStartDate.getTime() === todayDate.getTime() && currentMinutes >= taskStartMinutes;

                    // Only create NSFT if task has started and is not acknowledged
                    if ((startDatePassed || startTimePassed) && (!acknowledgements || acknowledgements.length === 0)) {
                        taskData = task;
                    }
                }
            }
            
            const userId = this.currentUser ? this.currentUser.id : null;
            updates.updated_by = userId;
            
            const { data, error } = await this.client
                .from('tasks')
                .update(updates)
                .eq('id', id)
                .select();
            
            if (error) throw error;
            
            // If status was set to 'overdue', create NSFT exception (only if task has started and not acknowledged)
            if (updates.status === 'overdue' && taskData) {
                await this.createNSFTExceptionForTask(taskData);
            }
            
            console.log('✅ Task updated');
            return data[0];
        } catch (error) {
            console.error('Error updating task:', error);
            return null;
        }
    }
    
    /**
     * Create an NSFT exception for a specific task
     * Only creates if task has started and hasn't been acknowledged
     * @param {Object} task - The task object
     */
    async createNSFTExceptionForTask(task) {
        if (!this.isReady()) return false;

        try {
            // Check if task has been acknowledged
            const { data: acknowledgements } = await this.client
                .from('task_acknowledgements')
                .select('id')
                .eq('task_id', task.id)
                .limit(1);

            if (acknowledgements && acknowledgements.length > 0) {
                console.log(`Task ${task.id} has been acknowledged, skipping NSFT exception`);
                return false;
            }

            // Check if task has started (current time >= task start time on task date)
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const taskStartDate = new Date(task.start_date);
            taskStartDate.setHours(0, 0, 0, 0);
            const todayDate = new Date(today);
            todayDate.setHours(0, 0, 0, 0);

            // Helper to convert time to minutes
            const timeToMinutes = (timeStr) => {
                if (!timeStr) return 0;
                if (timeStr.includes(':')) {
                    const [hours, minutes] = timeStr.split(':').map(Number);
                    return hours * 60 + minutes;
                }
                const hours = parseInt(timeStr.substring(0, 2));
                const minutes = parseInt(timeStr.substring(2, 4));
                return hours * 60 + minutes;
            };

            const taskStartMinutes = timeToMinutes(task.start_time);
            const currentMinutes = now.getHours() * 60 + now.getMinutes();

            // Check if task has started
            const datePassed = taskStartDate < todayDate;
            const timePassed = taskStartDate.getTime() === todayDate.getTime() && currentMinutes >= taskStartMinutes;

            if (!datePassed && !timePassed) {
                console.log(`Task ${task.id} has not started yet, skipping NSFT exception`);
                return false;
            }

            // Get employee name
            const { data: employee } = await this.client
                .from('employees')
                .select('name')
                .eq('id', task.employee_id)
                .single();

            const employeeName = employee?.name || 'Unknown';

            // Convert time format (HHMM) to HH:MM:SS for database
            const formatTime = (timeStr) => {
                if (!timeStr) return '00:00:00';
                if (timeStr.includes(':')) return timeStr.length === 5 ? timeStr + ':00' : timeStr;
                // Format HHMM to HH:MM:SS
                const hours = timeStr.substring(0, 2);
                const minutes = timeStr.substring(2, 4);
                return `${hours}:${minutes}:00`;
            };

            // Use start_date for the exception date (when task should have started)
            const exceptionDate = task.start_date;

            // Check if NSFT exception already exists for this task
            const { data: existingException } = await this.client
                .from('exception_logs')
                .select('id')
                .eq('employee_id', task.employee_id)
                .eq('exception_code', 'NSFT')
                .eq('exception_date', exceptionDate)
                .eq('task_id', task.id)
                .single();

            if (existingException) {
                console.log(`NSFT exception already exists for task ${task.id}`);
                return true;
            }

            // Create NSFT exception log
            const { error: createError } = await this.client
                .from('exception_logs')
                .insert({
                    employee_id: task.employee_id,
                    employee_name: employeeName,
                    exception_code: 'NSFT',
                    exception_date: exceptionDate,
                    start_time: formatTime(task.start_time),
                    end_time: formatTime(task.end_time),
                    reason: `Task not acknowledged: ${task.name}`,
                    approved_by: 'SYSTEM',
                    approved_at: new Date().toISOString(),
                    task_id: task.id,
                    additional_data: {
                        task_name: task.name,
                        task_start_date: task.start_date,
                        task_end_date: task.end_date,
                        task_start_time: task.start_time,
                        task_end_time: task.end_time
                    }
                });

            if (createError) {
                console.error('Error creating NSFT exception for task:', createError);
                return false;
            }

            console.log(`✅ Created NSFT exception for unacknowledged task: ${task.name} (Employee: ${employeeName})`);
            return true;
        } catch (error) {
            console.error('Error creating NSFT exception for task:', error);
            return false;
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
     * Acknowledge a task (regular daily task)
     */
    async acknowledgeTask(taskId, notes = null) {
        if (!this.isReady()) return null;
        
        try {
            const userId = this.currentUser ? this.currentUser.id : null;
            if (!userId) throw new Error('User not authenticated');
            
            console.log('Acknowledging regular task:', taskId, 'for user:', userId);
            
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
            
            if (error) {
                console.error('Error in acknowledgement:', error);
                throw error;
            }
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
     * Check for overdue tasks and automatically mark them as overdue, creating NSFT exceptions
     * This should be called periodically to catch tasks that have passed their end time
     */
    async checkAndMarkOverdueTasks() {
        if (!this.isReady()) return { marked: 0, exceptions: 0 };

        try {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            
            // Get all tasks that are not completed and not already overdue
            const { data: tasks, error: tasksError } = await this.client
                .from('tasks')
                .select('*')
                .in('status', ['pending', 'in-progress', 'on-hold'])
                .lte('end_date', today); // Tasks that have ended on or before today

            if (tasksError) {
                console.error('Error fetching tasks for overdue check:', tasksError);
                return { marked: 0, exceptions: 0 };
            }

            if (!tasks || tasks.length === 0) {
                return { marked: 0, exceptions: 0 };
            }

            let markedCount = 0;
            let exceptionCount = 0;

            // Helper function to convert HHMM to minutes
            const timeToMinutes = (timeStr) => {
                if (!timeStr) return 1439; // 23:59
                if (timeStr.includes(':')) {
                    const [hours, minutes] = timeStr.split(':').map(Number);
                    return hours * 60 + minutes;
                }
                // Format HHMM
                const hours = parseInt(timeStr.substring(0, 2));
                const minutes = parseInt(timeStr.substring(2, 4));
                return hours * 60 + minutes;
            };

            // Check each task
            for (const task of tasks) {
                // First check if task has been acknowledged - if so, skip NSFT
                const { data: acknowledgements } = await this.client
                    .from('task_acknowledgements')
                    .select('id')
                    .eq('task_id', task.id)
                    .limit(1);

                if (acknowledgements && acknowledgements.length > 0) {
                    // Task has been acknowledged, skip NSFT but still mark as overdue if needed
                    const taskEndDate = new Date(task.end_date);
                    taskEndDate.setHours(0, 0, 0, 0);
                    const todayDate = new Date(today);
                    todayDate.setHours(0, 0, 0, 0);

                    const datePassed = taskEndDate < todayDate;
                    const taskEndMinutes = timeToMinutes(task.end_time);
                    const currentMinutes = now.getHours() * 60 + now.getMinutes();
                    const timePassed = taskEndDate.getTime() === todayDate.getTime() && currentMinutes > taskEndMinutes;

                    if (datePassed || timePassed) {
                        // Mark as overdue but don't create NSFT (already acknowledged)
                        const { error: updateError } = await this.client
                            .from('tasks')
                            .update({ status: 'overdue' })
                            .eq('id', task.id);

                        if (!updateError) {
                            markedCount++;
                        }
                    }
                    continue;
                }

                // Check if task has started (current time >= task start time on task date)
                const taskStartDate = new Date(task.start_date);
                taskStartDate.setHours(0, 0, 0, 0);
                const todayDate = new Date(today);
                todayDate.setHours(0, 0, 0, 0);

                const taskStartMinutes = timeToMinutes(task.start_time);
                const currentMinutes = now.getHours() * 60 + now.getMinutes();

                const startDatePassed = taskStartDate < todayDate;
                const startTimePassed = taskStartDate.getTime() === todayDate.getTime() && currentMinutes >= taskStartMinutes;

                // Only create NSFT if task has started and is not acknowledged
                if (startDatePassed || startTimePassed) {
                    // Check if task end date/time has passed for overdue status
                    const taskEndDate = new Date(task.end_date);
                    taskEndDate.setHours(0, 0, 0, 0);
                    const datePassed = taskEndDate < todayDate;
                    const taskEndMinutes = timeToMinutes(task.end_time);
                    const timePassed = taskEndDate.getTime() === todayDate.getTime() && currentMinutes > taskEndMinutes;

                    if (datePassed || timePassed) {
                        // Mark task as overdue
                        const { error: updateError } = await this.client
                            .from('tasks')
                            .update({ status: 'overdue' })
                            .eq('id', task.id);

                        if (updateError) {
                            console.error(`Error marking task ${task.id} as overdue:`, updateError);
                            continue;
                        }

                        markedCount++;
                    }

                    // Create NSFT exception (task has started and is not acknowledged)
                    const exceptionCreated = await this.createNSFTExceptionForTask(task);
                    if (exceptionCreated) {
                        exceptionCount++;
                    }
                }
            }

            if (markedCount > 0) {
                console.log(`✅ Marked ${markedCount} task(s) as overdue and created ${exceptionCount} NSFT exception(s)`);
            }

            return { marked: markedCount, exceptions: exceptionCount };
        } catch (error) {
            console.error('Error checking for overdue tasks:', error);
            return { marked: 0, exceptions: 0 };
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

    /**
     * Check if employee should be restored to active status
     * (if they have no approved time off that would keep them on extended leave)
     * @param {number} employeeId - The employee ID
     * @returns {Promise<boolean>} True if status was restored, false otherwise
     */
    async checkAndRestoreEmployeeStatus(employeeId) {
        if (!this.isReady()) return false;

        try {
            // Get employee's current profile status
            const { data: profile } = await this.client
                .from('employee_profiles')
                .select('employment_status')
                .eq('employee_id', employeeId)
                .maybeSingle();

            // Only check if employee is currently on extended leave
            if (!profile || profile.employment_status !== 'extended_leave') {
                return false;
            }

            // Check if employee has any approved time off that exceeds 6 days
            const today = new Date().toISOString().split('T')[0];
            const { data: approvedTimeOff } = await this.client
                .from('time_off_requests')
                .select('start_date, end_date')
                .eq('employee_id', employeeId)
                .eq('status', 'approved')
                .gte('end_date', today); // Only future or current time off

            if (!approvedTimeOff || approvedTimeOff.length === 0) {
                // No approved time off, restore to active
                console.log(`🔄 No approved time off found for employee ${employeeId}, restoring to active status`);
                return await this.setEmployeeActive(employeeId, 'Time off ended or was removed');
            }

            // Check if any approved time off exceeds 6 days
            let hasExtendedLeave = false;
            for (const timeOff of approvedTimeOff) {
                const startDateObj = new Date(timeOff.start_date);
                const endDateObj = new Date(timeOff.end_date);
                const daysDiff = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1;
                
                if (daysDiff > 6) {
                    hasExtendedLeave = true;
                    break;
                }
            }

            if (!hasExtendedLeave) {
                // No time off exceeds 6 days, restore to active
                console.log(`🔄 No extended time off found for employee ${employeeId}, restoring to active status`);
                return await this.setEmployeeActive(employeeId, 'Time off no longer qualifies for extended leave');
            }

            return false;
        } catch (error) {
            console.error('Error checking employee status:', error);
            return false;
        }
    }

    /**
     * Set employee back to active status
     * @param {number} employeeId - The employee ID
     * @param {string} reason - Reason for status change
     * @returns {Promise<Object|null>} Updated profile or null on error
     */
    async setEmployeeActive(employeeId, reason = 'Status restored to active') {
        if (!this.isReady()) {
            console.error('❌ Supabase not ready for setEmployeeActive');
            return null;
        }

        try {
            console.log(`🔄 Setting employee ${employeeId} back to active status...`);

            // Get the current user's employee ID (not the user UUID)
            let changedByEmployeeId = null;
            if (this.currentUser?.id) {
                const { data: currentEmployee } = await this.client
                    .from('employees')
                    .select('id')
                    .eq('user_id', this.currentUser.id)
                    .maybeSingle();
                
                if (currentEmployee) {
                    changedByEmployeeId = currentEmployee.id;
                }
            }

            const updateData = {
                employment_status: 'active',
                status_reason: reason,
                status_changed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            if (changedByEmployeeId) {
                updateData.status_changed_by = changedByEmployeeId;
            }

            const { data, error } = await this.client
                .from('employee_profiles')
                .update(updateData)
                .eq('employee_id', employeeId)
                .select()
                .single();

            if (error) {
                console.error('❌ Error setting employee to active:', error);
                return null;
            }

            if (!data) {
                console.error('❌ Update returned no data');
                return null;
            }

            console.log(`✅ Employee ${employeeId} restored to active status:`, data);
            return data;
        } catch (error) {
            console.error('❌ Error setting employee to active:', error);
            return null;
        }
    }

    /**
     * Check for expired time off and restore employees to active status
     * This should be called periodically or on page load
     * @returns {Promise<number>} Number of employees restored
     */
    async checkExpiredTimeOff() {
        if (!this.isReady()) return 0;

        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Get all employees on extended leave
            const { data: extendedLeaveEmployees } = await this.client
                .from('employee_profiles')
                .select('employee_id')
                .eq('employment_status', 'extended_leave');

            if (!extendedLeaveEmployees || extendedLeaveEmployees.length === 0) {
                return 0;
            }

            let restoredCount = 0;
            
            // Check each employee
            for (const profile of extendedLeaveEmployees) {
                const restored = await this.checkAndRestoreEmployeeStatus(profile.employee_id);
                if (restored) {
                    restoredCount++;
                }
            }

            if (restoredCount > 0) {
                console.log(`✅ Restored ${restoredCount} employee(s) to active status after checking expired time off`);
            }

            return restoredCount;
        } catch (error) {
            console.error('Error checking expired time off:', error);
            return 0;
        }
    }

    /**
     * Set employee to extended leave status
     * @param {number} employeeId - The employee ID
     * @param {string} expectedReturnDate - Expected return date (YYYY-MM-DD)
     * @returns {Promise<Object|null>} Updated profile or null on error
     */
    async setEmployeeExtendedLeave(employeeId, expectedReturnDate = null) {
        if (!this.isReady()) {
            console.error('❌ Supabase not ready for setEmployeeExtendedLeave');
            return null;
        }

        try {
            const reason = `Automatic extended leave due to time off exceeding 6 days${expectedReturnDate ? ` (Expected return: ${expectedReturnDate})` : ''}`;
            
            console.log(`🔄 Setting employee ${employeeId} to extended leave...`);

            // First, check if profile exists
            const { data: existingProfile, error: checkError } = await this.client
                .from('employee_profiles')
                .select('id, employment_status')
                .eq('employee_id', employeeId)
                .maybeSingle();

            if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" which is fine
                console.error('❌ Error checking existing profile:', checkError);
            }

            let result;
            if (existingProfile) {
                // Update existing profile
                console.log(`📝 Updating existing profile for employee ${employeeId} (current status: ${existingProfile.employment_status})`);
                
                // Get the current user's employee ID (not the user UUID)
                let changedByEmployeeId = null;
                if (this.currentUser?.id) {
                    const { data: currentEmployee } = await this.client
                        .from('employees')
                        .select('id')
                        .eq('user_id', this.currentUser.id)
                        .maybeSingle();
                    
                    if (currentEmployee) {
                        changedByEmployeeId = currentEmployee.id;
                    }
                }
                
                const updateData = {
                    employment_status: 'extended_leave',
                    status_reason: reason,
                    status_changed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                // Only add status_changed_by if we have an employee ID (bigint, not UUID)
                if (changedByEmployeeId) {
                    updateData.status_changed_by = changedByEmployeeId;
                }
                
                const { data, error } = await this.client
                    .from('employee_profiles')
                    .update(updateData)
                    .eq('employee_id', employeeId)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Error updating employee profile to extended leave:', error);
                    console.error('   Update data:', updateData);
                    console.error('   Employee ID:', employeeId);
                    console.error('   Current user:', this.currentUser);
                    return null;
                }
                
                if (!data) {
                    console.error('❌ Update returned no data');
                    return null;
                }
                
                console.log(`✅ Profile updated successfully. New status: ${data.employment_status}`);
                result = data;
            } else {
                // Create new profile
                console.log(`➕ Creating new profile for employee ${employeeId}`);
                
                // Get the current user's employee ID (not the user UUID)
                let changedByEmployeeId = null;
                if (this.currentUser?.id) {
                    const { data: currentEmployee } = await this.client
                        .from('employees')
                        .select('id')
                        .eq('user_id', this.currentUser.id)
                        .maybeSingle();
                    
                    if (currentEmployee) {
                        changedByEmployeeId = currentEmployee.id;
                    }
                }
                
                const insertData = {
                    employee_id: employeeId,
                    employment_status: 'extended_leave',
                    status_reason: reason,
                    status_changed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                // Only add status_changed_by if we have an employee ID (bigint, not UUID)
                if (changedByEmployeeId) {
                    insertData.status_changed_by = changedByEmployeeId;
                }
                
                const { data, error } = await this.client
                    .from('employee_profiles')
                    .insert(insertData)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Error creating employee profile with extended leave:', error);
                    console.error('   Insert data:', insertData);
                    console.error('   Employee ID:', employeeId);
                    console.error('   Current user:', this.currentUser);
                    return null;
                }
                
                if (!data) {
                    console.error('❌ Insert returned no data');
                    return null;
                }
                
                console.log(`✅ Profile created successfully. Status: ${data.employment_status}`);
                result = data;
            }

            console.log(`✅ Employee ${employeeId} set to extended leave status:`, result);
            return result;
        } catch (error) {
            console.error('❌ Error setting employee to extended leave:', error);
            return null;
        }
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

        // Remove DO exception for this employee on this date (if it exists)
        if (shiftData.employee_id && shiftData.shift_date) {
            await this.removeDOExceptionForDate(shiftData.employee_id, shiftData.shift_date);
        }

        console.log('✅ Shift assigned');
        return data;
    }

    async updateEmployeeShift(shiftId, updates) {
        if (!this.isReady()) return null;

        // Get the current shift to check if date or employee changed
        const { data: currentShift } = await this.client
            .from('employee_shifts')
            .select('employee_id, shift_date')
            .eq('id', shiftId)
            .single();

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

        // Remove DO exception for the updated date (if date or employee changed)
        const employeeId = updates.employee_id || currentShift?.employee_id;
        const shiftDate = updates.shift_date || currentShift?.shift_date;
        
        if (employeeId && shiftDate) {
            await this.removeDOExceptionForDate(employeeId, shiftDate);
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
        if (!this.isReady()) {
            throw new Error('Supabase client not initialized');
        }

        console.log('🗑️ Deleting hourly task:', taskId);

        const { error } = await this.client
            .from('hourly_tasks')
            .delete()
            .eq('id', taskId);

        if (error) {
            console.error('❌ Error deleting hourly task:', error);
            throw error;
        }

        console.log('✅ Hourly task deleted:', taskId);
        return true;
    }

    /**
     * Acknowledge an hourly task (employee action for hourly tasks)
     */
    async acknowledgeHourlyTask(taskId, employeeName) {
        if (!this.isReady()) return null;

        try {
            // First get the task to verify it exists
            const { data: task, error: fetchError } = await this.client
                .from('hourly_tasks')
                .select('*')
                .eq('id', taskId)
                .single();

            if (fetchError || !task) {
                console.error('Task not found or error fetching:', fetchError);
                return null;
            }

            console.log('Found hourly task to acknowledge:', task);

            // Now update it
            const { data, error } = await this.client
                .from('hourly_tasks')
                .update({
                    acknowledged: true,
                    acknowledged_at: new Date().toISOString(),
                    acknowledged_by: employeeName
                })
                .eq('id', taskId)
                .select()
                .single();

            if (error) {
                console.error('Error acknowledging hourly task:', error);
                return null;
            }

            console.log('✅ Hourly task acknowledged:', data);
            return data;
        } catch (error) {
            console.error('Error in acknowledgeHourlyTask:', error);
            return null;
        }
    }

    /**
     * Mark an hourly task as completed and create admin notification
     */
    async markHourlyTaskAsCompleted(taskId, employeeId, employeeName) {
        if (!this.isReady()) return null;

        try {
            // First get the task to verify it exists and get details
            const { data: task, error: fetchError } = await this.client
                .from('hourly_tasks')
                .select('*')
                .eq('id', taskId)
                .single();

            if (fetchError || !task) {
                console.error('Task not found or error fetching:', fetchError);
                return null;
            }

            console.log('Found hourly task to mark as completed:', task);

            // Update task status to completed
            const { data: updatedTask, error: updateError } = await this.client
                .from('hourly_tasks')
                .update({
                    status: 'completed',
                    modified_at: new Date().toISOString()
                })
                .eq('id', taskId)
                .select()
                .single();

            if (updateError) {
                console.error('Error updating hourly task to completed:', updateError);
                return null;
            }

            // Create admin notification
            const { data: notification, error: notifError } = await this.client
                .from('task_completion_notifications')
                .insert({
                    task_id: taskId,
                    employee_id: employeeId,
                    employee_name: employeeName,
                    task_name: task.name,
                    task_date: task.task_date,
                    status: 'pending'
                })
                .select()
                .single();

            if (notifError) {
                console.error('Error creating completion notification:', notifError);
                // Task is still marked as completed, so return success
                console.warn('Task marked as completed but notification failed');
            } else {
                console.log('✅ Admin notification created:', notification);
            }

            console.log('✅ Hourly task marked as completed:', updatedTask);
            return updatedTask;
        } catch (error) {
            console.error('Error in markHourlyTaskAsCompleted:', error);
            return null;
        }
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

    /**
     * Admin function: Directly assign time off to an employee (auto-approved)
     * This bypasses the request/approval process and immediately:
     * - Creates an approved time off request
     * - Deletes all tasks and shifts during the period
     * - Creates VATO exception logs
     * @param {number} employeeId - The employee ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {string} reason - Reason for time off
     * @returns {Promise<Object|null>} The created time off request or null on error
     */
    async assignTimeOffToEmployee(employeeId, startDate, endDate, reason = 'Admin assigned time off') {
        if (!this.isReady()) return null;

        try {
            // First, delete all tasks and shifts for this period
            await this.deleteTasksForTimeOff(employeeId, startDate, endDate);
            await this.deleteShiftsForTimeOff(employeeId, startDate, endDate);

            // Create the time off request with approved status
            const requestData = {
                employee_id: employeeId,
                start_date: startDate,
                end_date: endDate,
                reason: reason,
                status: 'approved',
                requested_at: new Date().toISOString(),
                reviewed_by: this.currentUser?.id,
                reviewed_at: new Date().toISOString()
            };

            const { data, error } = await this.client
                .from('time_off_requests')
                .insert([requestData])
                .select()
                .single();

            if (error) {
                console.error('Error creating admin-assigned time off:', error);
                return null;
            }

            // Create VATO exception logs for each day
            await this.createTimeOffExceptions(data);

            // Check if time off is more than 6 days, if so set extended_leave status
            const startDateObj = new Date(startDate);
            const endDateObj = new Date(endDate);
            const daysDiff = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
            
            console.log(`📅 Time off duration: ${daysDiff} days (start: ${startDate}, end: ${endDate})`);
            
            if (daysDiff > 6) {
                console.log(`⏰ Time off exceeds 6 days (${daysDiff} days), setting employee to extended leave...`);
                const result = await this.setEmployeeExtendedLeave(employeeId, endDate);
                if (result) {
                    console.log(`✅ Successfully set employee ${employeeId} to extended leave:`, result);
                } else {
                    console.error(`❌ Failed to set employee ${employeeId} to extended leave`);
                }
            } else {
                console.log(`ℹ️ Time off is ${daysDiff} days (≤6 days), not setting extended leave`);
            }

            console.log(`✅ Time off assigned to employee ${employeeId} from ${startDate} to ${endDate}`);
            return data;
        } catch (error) {
            console.error('Error assigning time off to employee:', error);
            return null;
        }
    }

    async updateTimeOffRequest(requestId, updates) {
        if (!this.isReady()) return null;

        // If approving, first get the request details
        let requestData = null;
        if (updates.status === 'approved') {
            const { data: reqData } = await this.client
                .from('time_off_requests')
                .select('*')
                .eq('id', requestId)
                .single();
            
            if (reqData) {
                requestData = reqData;
            }
        }

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

        // If approved, delete existing tasks and shifts, then create exception logs
        if (updates.status === 'approved' && requestData) {
            // Delete all tasks for this employee within the time off period
            await this.deleteTasksForTimeOff(requestData.employee_id, requestData.start_date, requestData.end_date);
            
            // Delete all shifts for this employee within the time off period
            await this.deleteShiftsForTimeOff(requestData.employee_id, requestData.start_date, requestData.end_date);
            
            // Create exception logs for each day
            await this.createTimeOffExceptions(requestData);

            // Check if time off is more than 6 days, if so set extended_leave status
            const startDateObj = new Date(requestData.start_date);
            const endDateObj = new Date(requestData.end_date);
            const daysDiff = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
            
            console.log(`📅 Time off duration: ${daysDiff} days (start: ${requestData.start_date}, end: ${requestData.end_date})`);
            
            if (daysDiff > 6) {
                console.log(`⏰ Time off exceeds 6 days (${daysDiff} days), setting employee to extended leave...`);
                const result = await this.setEmployeeExtendedLeave(requestData.employee_id, requestData.end_date);
                if (result) {
                    console.log(`✅ Successfully set employee ${requestData.employee_id} to extended leave:`, result);
                } else {
                    console.error(`❌ Failed to set employee ${requestData.employee_id} to extended leave`);
                }
            } else {
                console.log(`ℹ️ Time off is ${daysDiff} days (≤6 days), not setting extended leave`);
            }
        }

        console.log('✅ Time off request updated');
        return data;
    }

    /**
     * Delete a time off request and associated exception logs
     * @param {number} requestId - The ID of the time off request to delete
     */
    async deleteTimeOffRequest(requestId) {
        if (!this.isReady()) return false;

        try {
            // First, get the request to check if it was approved
            const { data: request, error: fetchError } = await this.client
                .from('time_off_requests')
                .select('*')
                .eq('id', requestId)
                .single();

            if (fetchError) {
                console.error('Error fetching time off request:', fetchError);
                return false;
            }

            // If the request was approved, delete associated VATO exception logs
            if (request.status === 'approved') {
                const employeeId = request.employee_id;

                // Delete exception logs that match this time off request
                // We'll match by employee_id, date range, and VATO code
                // The additional_data should contain the time_off_request_id
                // Note: We delete all VATO exceptions for this employee in this date range
                // since they should all be from this time off request
                const { error: deleteExceptionsError } = await this.client
                    .from('exception_logs')
                    .delete()
                    .eq('employee_id', employeeId)
                    .eq('exception_code', 'VATO')
                    .gte('exception_date', request.start_date)
                    .lte('exception_date', request.end_date);

                if (deleteExceptionsError) {
                    console.error('Error deleting exception logs:', deleteExceptionsError);
                    // Continue with deleting the request even if exception deletion fails
                } else {
                    console.log(`✅ Deleted exception logs for time off request ${requestId}`);
                }

                // Check if employee should be set back to active
                await this.checkAndRestoreEmployeeStatus(employeeId);
            }

            // Delete the time off request
            const { error: deleteError } = await this.client
                .from('time_off_requests')
                .delete()
                .eq('id', requestId);

            if (deleteError) {
                console.error('Error deleting time off request:', deleteError);
                return false;
            }

            console.log(`✅ Time off request ${requestId} deleted successfully`);
            return true;
        } catch (error) {
            console.error('Error deleting time off request:', error);
            return false;
        }
    }

    /**
     * Delete all tasks for an employee within a time off period
     * @param {number} employeeId - The employee ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     */
    async deleteTasksForTimeOff(employeeId, startDate, endDate) {
        if (!this.isReady()) return { deleted: 0, error: null };

        try {
            // Delete tasks where the task date range overlaps with the time off period
            // A task overlaps if: task.start_date <= endDate AND task.end_date >= startDate
            const { data: deletedTasks, error } = await this.client
                .from('tasks')
                .delete()
                .eq('employee_id', employeeId)
                .lte('start_date', endDate)
                .gte('end_date', startDate)
                .select('id');

            if (error) {
                console.error('Error deleting tasks for time off:', error);
                return { deleted: 0, error };
            }

            const deletedCount = deletedTasks?.length || 0;
            if (deletedCount > 0) {
                console.log(`✅ Deleted ${deletedCount} task(s) for employee ${employeeId} during time off period`);
            }
            return { deleted: deletedCount, error: null };
        } catch (error) {
            console.error('Error deleting tasks for time off:', error);
            return { deleted: 0, error };
        }
    }

    /**
     * Delete all shifts for an employee within a time off period
     * @param {number} employeeId - The employee ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     */
    async deleteShiftsForTimeOff(employeeId, startDate, endDate) {
        if (!this.isReady()) return { deleted: 0, error: null };

        try {
            // Delete shifts where the shift_date falls within the time off period
            const { data: deletedShifts, error } = await this.client
                .from('employee_shifts')
                .delete()
                .eq('employee_id', employeeId)
                .gte('shift_date', startDate)
                .lte('shift_date', endDate)
                .select('id');

            if (error) {
                console.error('Error deleting shifts for time off:', error);
                return { deleted: 0, error };
            }

            const deletedCount = deletedShifts?.length || 0;
            if (deletedCount > 0) {
                console.log(`✅ Deleted ${deletedCount} shift(s) for employee ${employeeId} during time off period`);
            }
            return { deleted: deletedCount, error: null };
        } catch (error) {
            console.error('Error deleting shifts for time off:', error);
            return { deleted: 0, error };
        }
    }

    /**
     * Create exception logs for approved time off
     * @param {Object} timeOffRequest - The approved time off request
     */
    async createTimeOffExceptions(timeOffRequest) {
        if (!this.isReady()) return;

        const startDate = new Date(timeOffRequest.start_date);
        const endDate = new Date(timeOffRequest.end_date);
        const employeeId = timeOffRequest.employee_id;

        // Get employee name
        const { data: employee } = await this.client
            .from('employees')
            .select('name')
            .eq('id', employeeId)
            .single();

        const employeeName = employee?.name || 'Unknown';

        // Create exception log for each day
        const exceptions = [];
        const currentDate = new Date(startDate);
        
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            
            exceptions.push({
                employee_id: employeeId,
                employee_name: employeeName,
                exception_code: 'VATO',
                exception_date: dateStr,
                start_time: '00:00:00',
                end_time: '23:59:59',
                reason: `Time Off: ${timeOffRequest.reason || 'Approved time off'}`,
                approved_by: this.currentUser?.full_name || this.currentUser?.username || 'Admin',
                approved_at: new Date().toISOString(),
                additional_data: {
                    time_off_request_id: timeOffRequest.id
                }
            });

            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Insert all exceptions
        if (exceptions.length > 0) {
            const { error } = await this.client
                .from('exception_logs')
                .insert(exceptions);

            if (error) {
                console.error('Error creating time off exceptions:', error);
            } else {
                console.log(`✅ Created ${exceptions.length} exception log(s) for time off`);
            }
        }
    }

    /**
     * Get approved time off periods for an employee
     * @param {number} employeeId - Employee ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Array of approved time off periods
     */
    async getApprovedTimeOff(employeeId, startDate = null, endDate = null) {
        if (!this.isReady()) return [];

        let query = this.client
            .from('time_off_requests')
            .select('*')
            .eq('employee_id', employeeId)
            .eq('status', 'approved');

        if (startDate && endDate) {
            query = query.or(`start_date.lte.${endDate},end_date.gte.${startDate}`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching approved time off:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Check if an employee has approved time off on a specific date
     * @param {number} employeeId - Employee ID
     * @param {string} date - Date to check (YYYY-MM-DD)
     * @returns {Promise<boolean>} True if employee has time off on that date
     */
    async hasTimeOffOnDate(employeeId, date) {
        if (!this.isReady()) return false;

        const { data, error } = await this.client
            .from('time_off_requests')
            .select('id')
            .eq('employee_id', employeeId)
            .eq('status', 'approved')
            .lte('start_date', date)
            .gte('end_date', date)
            .limit(1);

        if (error) {
            console.error('Error checking time off:', error);
            return false;
        }

        return data && data.length > 0;
    }

    /**
     * Check if an employee has approved time off that conflicts with a date range
     * @param {number} employeeId - Employee ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<boolean>} True if there's a conflict
     */
    async checkTimeOffConflict(employeeId, startDate, endDate) {
        if (!this.isReady()) return false;

        const { data, error } = await this.client
            .from('time_off_requests')
            .select('id, start_date, end_date')
            .eq('employee_id', employeeId)
            .eq('status', 'approved')
            .or(`start_date.lte.${endDate},end_date.gte.${startDate}`)
            .limit(1);

        if (error) {
            console.error('Error checking time off conflict:', error);
            return false;
        }

        return data && data.length > 0;
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

    /**
     * Exception Code Management
     */
    
    /**
     * Apply an exception code to an employee shift
     * @param {number} shiftId - The shift ID
     * @param {string} exceptionCode - VAUT, DO, UAEO, NSFT, VATO, or EMWM
     * @param {object} details - Exception details (reason, approvedBy, startTime, endTime)
     */
    async applyShiftException(shiftId, exceptionCode, details = {}) {
        if (!this.isReady()) {
            throw new Error('Supabase client not initialized');
        }

        const updates = {
            exception_code: exceptionCode,
            exception_reason: details.reason || null,
            exception_approved_by: details.approvedBy || null,
            exception_approved_at: details.approvedBy ? new Date().toISOString() : null,
            exception_start_time: details.startTime || null,
            exception_end_time: details.endTime || null
        };

        const { data, error } = await this.client
            .from('employee_shifts')
            .update(updates)
            .eq('id', shiftId)
            .select()
            .single();

        if (error) {
            console.error('Error applying shift exception:', error);
            throw error;
        }

        console.log('✅ Exception applied to shift:', data);
        return data;
    }

    /**
     * Apply an exception code to a task
     * @param {number} taskId - The task ID
     * @param {string} exceptionCode - VAUT, DO, or UAEO
     * @param {object} details - Exception details (reason, approvedBy)
     */
    async applyTaskException(taskId, exceptionCode, details = {}) {
        if (!this.isReady()) {
            throw new Error('Supabase client not initialized');
        }

        const updates = {
            exception_code: exceptionCode,
            exception_reason: details.reason || null,
            exception_approved_by: details.approvedBy || null,
            exception_approved_at: details.approvedBy ? new Date().toISOString() : null
        };

        const { data, error } = await this.client
            .from('hourly_tasks')
            .update(updates)
            .eq('id', taskId)
            .select()
            .single();

        if (error) {
            console.error('Error applying task exception:', error);
            throw error;
        }

        console.log('✅ Exception applied to task:', data);
        return data;
    }

    /**
     * Remove exception code from a shift
     * @param {number} shiftId - The shift ID
     */
    async removeShiftException(shiftId) {
        if (!this.isReady()) {
            throw new Error('Supabase client not initialized');
        }

        const { data, error} = await this.client
            .from('employee_shifts')
            .update({
                exception_code: null,
                exception_reason: null,
                exception_approved_by: null,
                exception_approved_at: null,
                exception_start_time: null,
                exception_end_time: null
            })
            .eq('id', shiftId)
            .select()
            .single();

        if (error) {
            console.error('Error removing shift exception:', error);
            throw error;
        }

        return data;
    }

    /**
     * Get all exception logs
     * @param {object} filters - Optional filters (employeeId, date, exceptionCode)
     */
    async getExceptionLogs(filters = {}) {
        if (!this.isReady()) return [];

        let query = this.client
            .from('exception_logs')
            .select('*')
            .order('exception_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (filters.employeeId) {
            query = query.eq('employee_id', filters.employeeId);
        }

        if (filters.date) {
            query = query.eq('exception_date', filters.date);
        }

        if (filters.exceptionCode) {
            query = query.eq('exception_code', filters.exceptionCode);
        }

        if (filters.startDate && filters.endDate) {
            query = query.gte('exception_date', filters.startDate)
                        .lte('exception_date', filters.endDate);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching exception logs:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            return [];
        }

        console.log(`✅ Fetched ${data?.length || 0} exception log(s)`, data);
        return data || [];
    }

    /**
     * Get exception summary for an employee
     * @param {number} employeeId - The employee ID (optional, null for all employees)
     */
    async getExceptionSummary(employeeId = null) {
        if (!this.isReady()) return [];

        let query = this.client
            .from('exception_summary')
            .select('*');

        if (employeeId) {
            query = query.eq('employee_id', employeeId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching exception summary:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Get daily exceptions report
     * @param {string} date - The date to get exceptions for (YYYY-MM-DD)
     */
    async getDailyExceptions(date = null) {
        if (!this.isReady()) return [];

        let query = this.client
            .from('daily_exceptions')
            .select('*');

        if (date) {
            query = query.eq('exception_date', date);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching daily exceptions:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Create a manual exception log entry
     * @param {object} exceptionData - Exception details
     */
    async createExceptionLog(exceptionData) {
        if (!this.isReady()) {
            throw new Error('Supabase client not initialized');
        }

        const { data, error } = await this.client
            .from('exception_logs')
            .insert({
                employee_id: exceptionData.employeeId,
                employee_name: exceptionData.employeeName,
                exception_code: exceptionData.exceptionCode,
                exception_date: exceptionData.date,
                start_time: exceptionData.startTime || null,
                end_time: exceptionData.endTime || null,
                reason: exceptionData.reason || null,
                approved_by: exceptionData.approvedBy || null,
                approved_at: exceptionData.approvedBy ? new Date().toISOString() : null,
                created_by: exceptionData.createdBy || null
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating exception log:', error);
            throw error;
        }

        console.log('✅ Exception log created:', data);
        return data;
    }

    /**
     * Remove DO exception for a specific employee and date
     * Called automatically when a shift is assigned
     * @param {number} employeeId - Employee ID
     * @param {string} date - Date string (YYYY-MM-DD)
     */
    async removeDOExceptionForDate(employeeId, date) {
        if (!this.isReady()) return;

        try {
            // Delete DO exceptions for this employee on this date
            // Only delete automatic DOs (created_by = 'SYSTEM')
            const { error } = await this.client
                .from('exception_logs')
                .delete()
                .eq('employee_id', employeeId)
                .eq('exception_date', date)
                .eq('exception_code', 'DO')
                .eq('created_by', 'SYSTEM');

            if (error) {
                // If error is "no rows found", that's fine - just means no DO to remove
                if (error.code !== 'PGRST116') {
                    console.warn('Warning removing DO exception:', error);
                }
            } else {
                console.log(`✅ Removed DO exception for employee ${employeeId} on ${date}`);
            }
        } catch (error) {
            console.warn('Error removing DO exception:', error);
            // Don't throw - this is a cleanup operation, shouldn't block shift creation
        }
    }

    /**
     * Ensure DO exceptions are applied for employees without shifts on a specific date
     * This is a JavaScript implementation that doesn't require SQL functions
     */
    async ensureDOExceptions(date) {
        if (!this.isReady()) {
            console.warn('Supabase not initialized');
            return null;
        }

        try {
            console.log('🔧 Checking for employees without shifts on:', date);
            
            // Get all active employees - simplified query
            const { data: employees, error: empError } = await this.client
                .from('employees')
                .select('id, name');
            
            if (empError) {
                console.error('❌ Error fetching employees:', empError);
                throw empError;
            }
            
            console.log(`📊 Found ${employees?.length || 0} employees:`, employees);
            
            if (!employees || employees.length === 0) {
                console.log('ℹ️ No active employees found');
                return [];
            }
            
            const createdDOs = [];
            
            // For each employee, check if they have a shift or DO exception
            for (const emp of employees) {
                console.log(`\n👤 Processing employee: ${emp.name} (ID: ${emp.id})`);
                
                // Check for existing shift
                const { data: shifts, error: shiftError } = await this.client
                    .from('employee_shifts')
                    .select('id')
                    .eq('employee_id', emp.id)
                    .eq('shift_date', date)
                    .limit(1);
                
                if (shiftError) {
                    console.error('  ❌ Error checking shifts:', shiftError);
                    continue;
                }
                
                console.log(`  📅 Shifts found: ${shifts?.length || 0}`);
                
                // If employee has a shift, skip
                if (shifts && shifts.length > 0) {
                    console.log(`  ⏭️ Skipping - employee has shift`);
                    continue;
                }
                
                // Check for existing DO exception
                const { data: exceptions, error: excError } = await this.client
                    .from('exception_logs')
                    .select('id')
                    .eq('employee_id', emp.id)
                    .eq('exception_date', date)
                    .eq('exception_code', 'DO')
                    .limit(1);
                
                if (excError) {
                    console.error('  ❌ Error checking exceptions:', excError);
                    continue;
                }
                
                console.log(`  📋 Existing DO exceptions: ${exceptions?.length || 0}`);
                
                // If DO already exists, skip
                if (exceptions && exceptions.length > 0) {
                    console.log(`  ⏭️ Skipping - DO already exists`);
                    continue;
                }
                
                // Create automatic DO exception
                console.log(`  🔨 Creating DO exception for ${emp.name}...`);
                const { data: newDO, error: createError } = await this.client
                    .from('exception_logs')
                    .insert({
                        employee_id: emp.id,
                        employee_name: emp.name,
                        exception_code: 'DO',
                        exception_date: date,
                        reason: 'Automatic Day Off - No shift scheduled',
                        approved_by: 'SYSTEM',
                        approved_at: new Date().toISOString(),
                        created_by: 'SYSTEM'
                    })
                    .select()
                    .single();
                
                if (createError) {
                    console.error('  ❌ Error creating DO:', createError);
                    continue;
                }
                
                console.log(`  ✅ Created DO for employee: ${emp.name}`);
                createdDOs.push({ employee_id: emp.id, employee_name: emp.name });
            }
            
            console.log('✅ DO exceptions ensured for date:', date, '→', createdDOs.length, 'DOs created');
            return createdDOs;
        } catch (error) {
            console.error('Error ensuring DO exceptions:', error);
            return [];
        }
    }

    /**
     * Backfill DO exceptions for a date range
     * JavaScript implementation - no SQL functions required
     */
    async backfillDOExceptions(startDate, endDate) {
        if (!this.isReady()) {
            console.warn('Supabase not initialized');
            return null;
        }

        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const totalCreated = [];
            
            console.log('🔧 Backfilling DO exceptions from', startDate, 'to', endDate);
            
            // Iterate through each date
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateStr = date.toISOString().split('T')[0];
                const created = await this.ensureDOExceptions(dateStr);
                if (created && created.length > 0) {
                    totalCreated.push(...created);
                }
            }
            
            console.log('✅ DO exceptions backfilled:', totalCreated.length, 'total DOs created');
            return totalCreated;
        } catch (error) {
            console.error('Error backfilling DO exceptions:', error);
            return [];
        }
    }

    /**
     * Manually run auto DO exceptions for current date
     */
    async autoApplyDOExceptions() {
        if (!this.isReady()) {
            console.warn('Supabase not initialized');
            return null;
        }

        try {
            const today = new Date().toISOString().split('T')[0];
            return await this.ensureDOExceptions(today);
        } catch (error) {
            console.error('Error auto-applying DO exceptions:', error);
            return [];
        }
    }

    // ==========================================
    // COMPANY CHAT
    // ==========================================

    /**
     * Get company chat messages (with user info)
     * @param {number} limit - Number of messages to fetch (default: 100)
     * @returns {Promise<Array>} Array of chat messages with user information
     */
    async getCompanyChatMessages(limit = 100) {
        if (!this.isReady()) return null;

        try {
            const { data, error } = await this.client
                .from('company_chat_messages')
                .select(`
                    *,
                    users:user_id (
                        id,
                        username,
                        full_name,
                        is_admin
                    )
                `)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            // Reverse to show oldest first (for chat display)
            // Map users to user for consistency
            if (data) {
                return data.map(msg => ({
                    ...msg,
                    user: msg.users || null
                })).reverse();
            }
            return [];
        } catch (error) {
            console.error('Error fetching company chat messages:', error);
            return null;
        }
    }

    /**
     * Send a company chat message
     * @param {string} message - The message text
     * @returns {Promise<Object|null>} The created message or null on error
     */
    async sendCompanyChatMessage(message) {
        if (!this.isReady()) {
            console.error('Supabase not ready');
            return null;
        }

        const currentUser = await this.getCurrentUser();
        if (!currentUser) {
            console.error('No current user found');
            return null;
        }

        console.log('Sending chat message for user:', currentUser.id, 'Message:', message);

        try {
            // Insert the message
            const { data: insertedData, error: insertError } = await this.client
                .from('company_chat_messages')
                .insert({
                    user_id: currentUser.id,
                    message: message.trim()
                })
                .select('*')
                .single();

            if (insertError) {
                console.error('Insert error:', insertError);
                console.error('Insert error code:', insertError.code);
                console.error('Insert error message:', insertError.message);
                console.error('Insert error details:', insertError.details);
                throw insertError;
            }

            console.log('Message inserted successfully:', insertedData);

            // Return with user info from currentUser (we already have it)
            return {
                ...insertedData,
                user: {
                    id: currentUser.id,
                    username: currentUser.username,
                    full_name: currentUser.full_name,
                    is_admin: currentUser.is_admin
                }
            };

        } catch (error) {
            console.error('Error sending company chat message:', error);
            console.error('Error message:', error.message);
            console.error('Error code:', error.code);
            console.error('Error details:', error.details);
            return null;
        }
    }

    /**
     * Update a company chat message (edit)
     * @param {number} messageId - The message ID
     * @param {string} newMessage - The updated message text
     * @returns {Promise<Object|null>} The updated message or null on error
     */
    async updateCompanyChatMessage(messageId, newMessage) {
        if (!this.isReady()) return null;

        const currentUser = await this.getCurrentUser();
        if (!currentUser) {
            console.error('No current user found');
            return null;
        }

        try {
            const { data, error } = await this.client
                .from('company_chat_messages')
                .update({
                    message: newMessage.trim(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', messageId)
                .eq('user_id', currentUser.id) // Ensure user owns the message
                .select(`
                    *,
                    users:user_id (
                        id,
                        username,
                        full_name,
                        is_admin
                    )
                `)
                .single();

            if (error) throw error;

            console.log('✅ Company chat message updated:', data);
            // Map users to user for consistency
            if (data && data.users) {
                return {
                    ...data,
                    user: data.users
                };
            }
            return data;
        } catch (error) {
            console.error('Error updating company chat message:', error);
            return null;
        }
    }

    /**
     * Delete a company chat message (soft delete)
     * @param {number} messageId - The message ID
     * @returns {Promise<boolean>} True if successful, false otherwise
     */
    async deleteCompanyChatMessage(messageId) {
        if (!this.isReady()) return false;

        const currentUser = await this.getCurrentUser();
        if (!currentUser) {
            console.error('No current user found');
            return false;
        }

        try {
            // Check if user is admin or owns the message
            const isAdmin = await this.isAdmin();
            
            let query = this.client
                .from('company_chat_messages')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', messageId);

            // If not admin, ensure user owns the message
            if (!isAdmin) {
                query = query.eq('user_id', currentUser.id);
            }

            const { error } = await query;

            if (error) throw error;

            console.log('✅ Company chat message deleted');
            return true;
        } catch (error) {
            console.error('Error deleting company chat message:', error);
            return false;
        }
    }

    /**
     * Clear all company chat messages (admin only)
     * @returns {Promise<boolean>} True if successful, false otherwise
     */
    async clearCompanyChat() {
        if (!this.isReady()) return false;

        const isAdmin = await this.isAdmin();
        if (!isAdmin) {
            console.error('Only admins can clear chat');
            return false;
        }

        try {
            const { error } = await this.client
                .from('company_chat_messages')
                .update({ deleted_at: new Date().toISOString() })
                .is('deleted_at', null);

            if (error) throw error;
            console.log('✅ Company chat cleared');
            return true;
        } catch (error) {
            console.error('Error clearing company chat:', error);
            return false;
        }
    }

    /**
     * Subscribe to company chat messages for real-time updates
     * @param {Function} callback - Callback function to handle new messages
     * @returns {Function} Unsubscribe function
     */
    subscribeToCompanyChat(callback) {
        if (!this.isReady()) {
            console.error('Supabase not ready for chat subscription');
            return () => {};
        }

        const channel = this.client
            .channel(`company-chat-${Date.now()}`)
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'company_chat_messages'
                },
                async (payload) => {
                    try {
                        // Pass the full payload with event type
                        const payloadWithEvent = {
                            eventType: payload.eventType,
                            new: payload.new,
                            old: payload.old
                        };

                        // For INSERT events, fetch full message with user info
                        if (payload.eventType === 'INSERT' && payload.new && !payload.new.deleted_at) {
                            const { data: message, error } = await this.client
                                .from('company_chat_messages')
                                .select(`
                                    *,
                                    users:user_id (
                                        id,
                                        username,
                                        full_name,
                                        is_admin
                                    )
                                `)
                                .eq('id', payload.new.id)
                                .single();

                            if (error) {
                                console.error('Error fetching message with user info:', error);
                                // Fallback: use payload data without user info
                                callback({
                                    ...payloadWithEvent,
                                    new: {
                                        ...payload.new,
                                        user: null
                                    }
                                });
                            } else if (message) {
                                // Map users to user for consistency
                                const mappedMessage = message.users ? {
                                    ...message,
                                    user: message.users
                                } : message;
                                callback({
                                    ...payloadWithEvent,
                                    new: mappedMessage
                                });
                            }
                        } else if (payload.eventType === 'UPDATE' && payload.new) {
                            // For UPDATE events, fetch full message with user info
                            const { data: message, error } = await this.client
                                .from('company_chat_messages')
                                .select(`
                                    *,
                                    users:user_id (
                                        id,
                                        username,
                                        full_name,
                                        is_admin
                                    )
                                `)
                                .eq('id', payload.new.id)
                                .single();

                            if (error) {
                                console.error('Error fetching updated message with user info:', error);
                                callback(payloadWithEvent);
                            } else if (message) {
                                const mappedMessage = message.users ? {
                                    ...message,
                                    user: message.users
                                } : message;
                                callback({
                                    ...payloadWithEvent,
                                    new: mappedMessage
                                });
                            }
                        } else {
                            // For DELETE events, just pass the payload
                            callback(payloadWithEvent);
                        }
                    } catch (error) {
                        console.error('Error in chat subscription callback:', error);
                    }
                }
            )
            .subscribe((status, err) => {
                if (err) {
                    console.error('❌ Company chat subscription error:', err);
                } else if (status === 'SUBSCRIBED') {
                    console.log('✅ Company chat subscription active');
                } else {
                    console.log('📡 Company chat subscription status:', status);
                }
            });

        // Return unsubscribe function
        return () => {
            this.client.removeChannel(channel);
        };
    }

    // ==========================================
    // VOIP CALL METHODS
    // ==========================================

    /**
     * Create a call log entry
     * @param {number} receiverId - The employee ID of the receiver
     * @param {string} callType - 'audio' or 'video'
     * @returns {Promise<Object|null>} Call log entry or null on error
     */
    async createCallLog(callerId, receiverId, callerName, receiverName, callType = 'audio') {
        if (!this.isReady()) return null;

        try {
            const { data, error } = await this.client
                .from('call_logs')
                .insert({
                    caller_id: callerId,
                    receiver_id: receiverId,
                    caller_name: callerName,
                    receiver_name: receiverName,
                    call_status: 'initiated',
                    call_type: callType
                })
                .select()
                .single();

            if (error) {
                console.error('Error creating call log:', error);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Error creating call log:', error);
            return null;
        }
    }

    /**
     * Update call log status
     * @param {number} callLogId - The call log ID
     * @param {string} status - New status
     * @param {number} durationSeconds - Call duration in seconds (optional)
     * @returns {Promise<Object|null>} Updated call log or null on error
     */
    async updateCallLog(callLogId, status, durationSeconds = null) {
        if (!this.isReady()) return null;

        try {
            const updateData = {
                call_status: status,
                updated_at: new Date().toISOString()
            };

            if (status === 'answered') {
                updateData.answered_at = new Date().toISOString();
            } else if (status === 'ended' || status === 'missed' || status === 'rejected') {
                updateData.ended_at = new Date().toISOString();
                if (durationSeconds !== null) {
                    updateData.duration_seconds = durationSeconds;
                }
            }

            const { data, error } = await this.client
                .from('call_logs')
                .update(updateData)
                .eq('id', callLogId)
                .select()
                .single();

            if (error) {
                console.error('Error updating call log:', error);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Error updating call log:', error);
            return null;
        }
    }

    /**
     * Get call logs for current employee
     * @param {number} limit - Number of logs to retrieve
     * @returns {Promise<Array>} Array of call logs
     */
    async getCallLogs(limit = 50) {
        if (!this.isReady()) return [];

        try {
            const employee = await this.getCurrentEmployee();
            if (!employee) return [];

            const { data, error } = await this.client
                .from('call_logs')
                .select('*')
                .or(`caller_id.eq.${employee.id},receiver_id.eq.${employee.id}`)
                .order('started_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('Error fetching call logs:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error fetching call logs:', error);
            return [];
        }
    }

    /**
     * Send WebRTC signaling data
     * @param {string} callId - Unique call identifier
     * @param {number} receiverId - Receiver employee ID
     * @param {string} signalType - Type of signal
     * @param {Object} signalData - Signal data (offer/answer/ICE candidate)
     * @returns {Promise<boolean>} Success status
     */
    async sendCallSignal(callId, receiverId, signalType, signalData) {
        if (!this.isReady()) {
            console.error('Supabase not ready for sending call signal');
            return false;
        }

        try {
            const employee = await this.getCurrentEmployee();
            if (!employee) {
                console.error('Could not get current employee for sending signal');
                return false;
            }

            console.log(`📤 Sending ${signalType} signal:`, {
                callId,
                callerId: employee.id,
                receiverId,
                signalType
            });

            const insertData = {
                call_id: callId,
                caller_id: employee.id,
                receiver_id: receiverId,
                signal_type: signalType,
                signal_data: signalData
            };

            let result;

            // For call-request, call-accept, call-reject, call-end - use upsert to handle duplicates
            // These should be unique per call_id
            if (['call-request', 'call-accept', 'call-reject', 'call-end'].includes(signalType)) {
                // Check if signal already exists
                const { data: existing } = await this.client
                    .from('call_signaling')
                    .select('id')
                    .eq('call_id', callId)
                    .eq('signal_type', signalType)
                    .maybeSingle();

                if (existing) {
                    // Update existing signal
                    result = await this.client
                        .from('call_signaling')
                        .update({
                            signal_data: signalData,
                            caller_id: employee.id,
                            receiver_id: receiverId,
                            created_at: new Date().toISOString()
                        })
                        .eq('id', existing.id)
                        .select()
                        .single();
                } else {
                    // Insert new signal
                    result = await this.client
                        .from('call_signaling')
                        .insert(insertData)
                        .select()
                        .single();
                }
            } else {
                // For ice-candidate and other signals, allow multiple per call_id
                // Just insert directly
                result = await this.client
                    .from('call_signaling')
                    .insert(insertData)
                    .select()
                    .single();
            }

            if (result.error) {
                // If it's a duplicate key error, that's okay for ice-candidates
                if (result.error.code === '23505' && signalType === 'ice-candidate') {
                    console.log('ℹ️ ICE candidate already exists, skipping');
                    return true;
                }
                console.error('❌ Error sending call signal:', result.error);
                console.error('   Signal data:', signalData);
                return false;
            }

            console.log('✅ Call signal sent successfully:', result.data?.id);
            return true;
        } catch (error) {
            console.error('❌ Exception sending call signal:', error);
            return false;
        }
    }

    /**
     * Subscribe to call signaling for a specific call
     * @param {string} callId - Call identifier
     * @param {Function} callback - Callback function for signals
     * @returns {Function} Unsubscribe function
     */
    subscribeToCallSignaling(callId, callback) {
        if (!this.isReady()) {
            console.error('Supabase not ready for call signaling subscription');
            return () => {};
        }

        console.log('📡 Subscribing to call signaling for call:', callId);

        const channel = this.client
            .channel(`call-signaling-${callId}-${Date.now()}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'call_signaling',
                filter: `call_id=eq.${callId}`
            }, (payload) => {
                console.log('📨 Received signaling payload for call:', callId, payload.new?.signal_type);
                callback(payload.new);
            })
            .subscribe((status, err) => {
                if (err) {
                    console.error('❌ Call signaling subscription error:', err);
                } else if (status === 'SUBSCRIBED') {
                    console.log('✅ Successfully subscribed to call signaling for:', callId);
                } else {
                    console.log('📡 Call signaling subscription status:', status);
                }
            });

        return () => {
            console.log('🔌 Unsubscribing from call signaling:', callId);
            this.client.removeChannel(channel);
        };
    }

    /**
     * Subscribe to incoming call requests
     * @param {number} employeeId - Current employee ID
     * @param {Function} callback - Callback function for incoming calls
     * @returns {Function} Unsubscribe function
     */
    subscribeToIncomingCalls(employeeId, callback) {
        if (!this.isReady()) {
            console.error('Supabase not ready for incoming calls subscription');
            return () => {};
        }

        console.log('📡 Setting up incoming calls subscription for employee:', employeeId);

        const channel = this.client
            .channel(`incoming-calls-${employeeId}-${Date.now()}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'call_signaling',
                filter: `receiver_id=eq.${employeeId}`
            }, (payload) => {
                console.log('📨 Received signaling payload:', payload);
                console.log('   Signal type:', payload.new?.signal_type);
                console.log('   Receiver ID:', payload.new?.receiver_id);
                console.log('   Caller ID:', payload.new?.caller_id);
                
                if (payload.new && payload.new.signal_type === 'call-request') {
                    console.log('✅ Incoming call request detected, calling callback');
                    callback(payload.new);
                } else {
                    console.log('ℹ️ Signal received but not a call-request:', payload.new?.signal_type);
                }
            })
            .subscribe((status, err) => {
                console.log('📡 Incoming calls subscription status:', status);
                if (err) {
                    console.error('❌ Subscription error:', err);
                }
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Successfully subscribed to incoming calls for employee:', employeeId);
                }
            });

        return () => {
            console.log('🔌 Unsubscribing from incoming calls');
            this.client.removeChannel(channel);
        };
    }

    /**
     * Delete call signaling data (cleanup)
     * @param {string} callId - Call identifier
     * @returns {Promise<boolean>} Success status
     */
    async deleteCallSignaling(callId) {
        if (!this.isReady()) return false;

        try {
            const { error } = await this.client
                .from('call_signaling')
                .delete()
                .eq('call_id', callId);

            if (error) {
                console.error('Error deleting call signaling:', error);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error deleting call signaling:', error);
            return false;
        }
    }

    // ==========================================
    // PAYROLL OPERATIONS
    // ==========================================

    /**
     * Set payroll hours for an employee for a pay period
     * @param {number} employeeId - Employee ID
     * @param {string} payPeriodStart - Pay period start date (YYYY-MM-DD)
     * @param {string} payPeriodEnd - Pay period end date (YYYY-MM-DD)
     * @param {number} hours - Hours worked
     * @param {number} hourlyRate - Optional hourly rate override
     * @param {string} notes - Optional notes
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async setPayrollHours(employeeId, payPeriodStart, payPeriodEnd, hours, hourlyRate = null, notes = null) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) {
                return { data: null, error: 'Not authenticated' };
            }

            const insertData = {
                employee_id: employeeId,
                pay_period_start: payPeriodStart,
                pay_period_end: payPeriodEnd,
                hours: hours,
                created_by: user.id
            };

            if (hourlyRate !== null) {
                insertData.hourly_rate = hourlyRate;
            }
            if (notes) {
                insertData.notes = notes;
            }

            const { data, error } = await this.client
                .from('payroll_hours')
                .upsert(insertData, {
                    onConflict: 'employee_id,pay_period_start,pay_period_end'
                })
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Payroll hours set successfully');
            return { data, error: null };
        } catch (error) {
            console.error('Error setting payroll hours:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get payroll hours for employees in a pay period
     * @param {string} payPeriodStart - Pay period start date (YYYY-MM-DD)
     * @param {string} payPeriodEnd - Pay period end date (YYYY-MM-DD)
     * @param {number} employeeId - Optional employee ID filter
     * @returns {Promise<Array>}
     */
    async getPayrollHours(payPeriodStart, payPeriodEnd, employeeId = null) {
        if (!this.isReady()) return [];

        try {
            let query = this.client
                .from('payroll_hours')
                .select(`
                    *,
                    employees (
                        id,
                        name,
                        role
                    )
                `)
                .eq('pay_period_start', payPeriodStart)
                .eq('pay_period_end', payPeriodEnd);

            if (employeeId) {
                query = query.eq('employee_id', employeeId);
            }

            const { data, error } = await query;

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting payroll hours:', error);
            return [];
        }
    }

    /**
     * Set accountant access for an employee
     * @param {number} employeeId - Employee ID
     * @param {boolean} canView - Can accountant view this employee
     * @param {boolean} canProcess - Can accountant process payroll for this employee
     * @param {string} notes - Optional notes
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async setAccountantAccess(employeeId, canView, canProcess, notes = null) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) {
                return { data: null, error: 'Not authenticated' };
            }

            const insertData = {
                employee_id: employeeId,
                can_view: canView,
                can_process: canProcess,
                created_by: user.id
            };

            if (notes) {
                insertData.notes = notes;
            }

            const { data, error } = await this.client
                .from('accountant_access')
                .upsert(insertData, {
                    onConflict: 'employee_id'
                })
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Accountant access set successfully');
            return { data, error: null };
        } catch (error) {
            console.error('Error setting accountant access:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get accountant access for all employees
     * @returns {Promise<Array>}
     */
    async getAccountantAccess() {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('accountant_access')
                .select(`
                    *,
                    employees (
                        id,
                        name,
                        role
                    )
                `)
                .order('employee_id');

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting accountant access:', error);
            return [];
        }
    }

    /**
     * Get employees that accountant has access to
     * @returns {Promise<Array>}
     */
    async getAccountantAccessibleEmployees() {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('accountant_access')
                .select(`
                    *,
                    employees (
                        id,
                        name,
                        role
                    )
                `)
                .eq('can_view', true)
                .order('employee_id');

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting accessible employees:', error);
            return [];
        }
    }

    /**
     * Save payroll processing history
     * @param {Object} payrollData - Payroll processing data
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async savePayrollHistory(payrollData) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) {
                return { data: null, error: 'Not authenticated' };
            }

            const insertData = {
                ...payrollData,
                processed_by: user.id
            };

            const { data, error } = await this.client
                .from('payroll_history')
                .insert(insertData)
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Payroll history saved');
            return { data, error: null };
        } catch (error) {
            console.error('Error saving payroll history:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get payroll history
     * @param {number} limit - Number of records to return
     * @returns {Promise<Array>}
     */
    async getPayrollHistory(limit = 50) {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('payroll_history')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting payroll history:', error);
            return [];
        }
    }

    /**
     * Get payroll history for a specific employee
     * @param {number} employeeId - Employee ID
     * @param {number} limit - Number of records to return
     * @returns {Promise<Array>}
     */
    async getEmployeePayrollHistory(employeeId, limit = 50) {
        if (!this.isReady()) return [];

        try {
            // Convert employeeId to number for comparison
            const empId = typeof employeeId === 'string' ? parseInt(employeeId) : employeeId;
            
            const { data, error } = await this.client
                .from('payroll_history')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            
            // Filter to only include payrolls where this employee is in payroll_details
            const employeePayrolls = (data || []).map(payroll => {
                if (!payroll.payroll_details || !Array.isArray(payroll.payroll_details)) {
                    return null;
                }
                
                // Find this employee's data in the payroll_details array
                // Try multiple ways to match the employee ID
                const employeeData = payroll.payroll_details.find(emp => {
                    if (!emp || !emp.employee) return false;
                    
                    // Try direct ID match (number or string)
                    const empEmployeeId = typeof emp.employee.id === 'string' 
                        ? parseInt(emp.employee.id) 
                        : emp.employee.id;
                    
                    return empEmployeeId === empId || 
                           emp.employee.id === employeeId ||
                           emp.employee.id === empId ||
                           String(emp.employee.id) === String(employeeId);
                });
                
                if (!employeeData) {
                    return null;
                }
                
                return {
                    ...payroll,
                    employeePayrollData: employeeData
                };
            }).filter(p => p !== null);

            console.log(`Found ${employeePayrolls.length} payroll records for employee ${employeeId}`);
            return employeePayrolls;
        } catch (error) {
            console.error('Error getting employee payroll history:', error);
            return [];
        }
    }

    /**
     * Send payroll email via Edge Function
     * @param {string} to - Recipient email
     * @param {string} subject - Email subject
     * @param {string} html - Email HTML content
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async sendPayrollEmail(to, subject, html) {
        if (!this.isReady()) return { success: false, error: 'Supabase not initialized' };

        try {
            // Check if functions are available
            if (!this.client.functions) {
                return { success: false, error: 'Edge Functions not available. Please configure the send-email Edge Function in Supabase.' };
            }

            // Call the Edge Function
            const { data, error } = await this.client.functions.invoke('send-email', {
                body: { to, subject, html }
            });

            if (error) {
                // Provide more helpful error message
                const errorMsg = error.message || 'Failed to send a request to the Edge Function';
                console.error('Edge Function error:', error);
                return { success: false, error: errorMsg };
            }

            console.log('✅ Payroll email sent successfully');
            return { success: true, error: null, data };
        } catch (error) {
            console.error('Error sending payroll email:', error);
            // Provide more specific error message
            let errorMessage = error.message || 'Unknown error';
            if (errorMessage.includes('Failed to send a request') || errorMessage.includes('Edge Function')) {
                errorMessage = 'Edge Function not configured. Please deploy the send-email Edge Function in Supabase.';
            }
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Log payroll email sent
     * @param {number} payrollHistoryId - Payroll history ID
     * @param {number} employeeId - Employee ID
     * @param {string} employeeEmail - Employee email
     * @param {string} subject - Email subject
     * @param {boolean} success - Whether email was sent successfully
     * @param {string} errorMessage - Error message if failed
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async logPayrollEmail(payrollHistoryId, employeeId, employeeEmail, subject, success, errorMessage = null) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const insertData = {
                payroll_history_id: payrollHistoryId,
                employee_id: employeeId,
                employee_email: employeeEmail,
                email_subject: subject,
                email_sent: success,
                email_sent_at: success ? new Date().toISOString() : null,
                error_message: errorMessage
            };

            const { data, error } = await this.client
                .from('payroll_emails')
                .insert(insertData)
                .select()
                .single();

            if (error) throw error;

            return { data, error: null };
        } catch (error) {
            console.error('Error logging payroll email:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Update payroll history email status
     * @param {number} payrollHistoryId - Payroll history ID
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async updatePayrollHistoryEmailStatus(payrollHistoryId) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data, error } = await this.client
                .from('payroll_history')
                .update({
                    email_sent: true,
                    email_sent_at: new Date().toISOString()
                })
                .eq('id', payrollHistoryId)
                .select()
                .single();

            if (error) throw error;

            return { data, error: null };
        } catch (error) {
            console.error('Error updating payroll history email status:', error);
            return { data: null, error: error.message };
        }
    }

    // ==========================================
    // ECONOMY SYSTEM OPERATIONS
    // ==========================================

    /**
     * Get employee wallet/balance
     * @param {number} employeeId - Employee ID
     * @returns {Promise<Object|null>}
     */
    async getEmployeeWallet(employeeId) {
        if (!this.isReady()) return null;

        try {
            // Try to get the wallet
            const { data, error } = await this.client
                .from('employee_wallets')
                .select('*')
                .eq('employee_id', employeeId)
                .maybeSingle(); // Use maybeSingle instead of single to avoid errors when no row exists

            // PGRST116 = no rows returned (wallet doesn't exist yet) - this is OK
            if (error) {
                if (error.code === 'PGRST116') {
                    // Wallet doesn't exist yet, return null (will be created on first update)
                    return null;
                } else if (error.code === '42P01' || error.message?.includes('does not exist')) {
                    // Table doesn't exist - user needs to run SQL migration
                    console.warn('⚠️ employee_wallets table does not exist. Please run add-economy-system.sql in Supabase.');
                    return null;
                } else if (error.code === '42501' || error.status === 406 || error.code === 'PGRST301') {
                    // RLS policy issue or Not Acceptable
                    console.warn('⚠️ Cannot access employee_wallets (RLS policy issue). Error:', error.message);
                    console.warn('⚠️ Please run fix-employee-wallets-rls-v2.sql in Supabase SQL Editor.');
                    return null;
                } else {
                    console.error('Error getting employee wallet:', error);
                    return null;
                }
            }
            return data;
        } catch (error) {
            console.error('Error getting employee wallet:', error);
            return null;
        }
    }

    /**
     * Update employee wallet balance
     * @param {number} employeeId - Employee ID
     * @param {number} amount - Amount to add (positive) or subtract (negative)
     * @param {string} transactionType - Type of transaction
     * @param {string} description - Transaction description
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async updateEmployeeWallet(employeeId, amount, transactionType, description) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            // Get current wallet
            let wallet = await this.getEmployeeWallet(employeeId);
            
            if (!wallet) {
                // Create wallet if it doesn't exist
                const { data: newWallet, error: createError } = await this.client
                    .from('employee_wallets')
                    .insert({
                        employee_id: employeeId,
                        balance: 0,
                        total_earned: amount > 0 ? amount : 0,
                        total_spent: amount < 0 ? Math.abs(amount) : 0
                    })
                    .select()
                    .single();
                
                if (createError) throw createError;
                wallet = newWallet;
            }

            // Update balance (ensure paycheck funds are added correctly)
            const currentBalance = parseFloat(wallet.balance || 0);
            const newBalance = currentBalance + amount;
            
            // Ensure balance doesn't go negative (unless it's a purchase)
            const finalBalance = newBalance < 0 && amount > 0 ? currentBalance : newBalance;
            
            const updateData = {
                balance: finalBalance,
                updated_at: new Date().toISOString()
            };

            if (amount > 0) {
                // Adding money (paycheck, etc.)
                updateData.total_earned = parseFloat(wallet.total_earned || 0) + amount;
                console.log(`💰 Adding $${amount.toFixed(2)} to wallet. Balance: $${currentBalance.toFixed(2)} → $${finalBalance.toFixed(2)}`);
            } else {
                // Spending money (purchase, etc.)
                updateData.total_spent = parseFloat(wallet.total_spent || 0) + Math.abs(amount);
                console.log(`💸 Deducting $${Math.abs(amount).toFixed(2)} from wallet. Balance: $${currentBalance.toFixed(2)} → $${finalBalance.toFixed(2)}`);
            }

            const { data, error } = await this.client
                .from('employee_wallets')
                .update(updateData)
                .eq('employee_id', employeeId)
                .select()
                .single();

            if (error) {
                console.error('Error updating wallet in database:', error);
                throw error;
            }

            // Log transaction (non-blocking - don't fail wallet update if transaction log fails)
            try {
                // Ensure employeeId is a number
                const id = typeof employeeId === 'string' ? parseInt(employeeId) : employeeId;
                console.log('Logging transaction:', { employee_id: id, type: transactionType, amount, description });
                
                const { data, error } = await this.client
                    .from('transactions')
                    .insert({
                        employee_id: id,
                        transaction_type: transactionType,
                        amount: amount,
                        description: description,
                        balance_after: finalBalance
                    })
                    .select();
                
                if (error) {
                    console.error('Transaction insert error:', error);
                    throw error;
                }
                
                console.log('Transaction logged successfully:', data);
            } catch (txError) {
                // Don't fail wallet update if transaction logging fails
                console.warn('Could not log transaction (non-critical):', txError);
            }

            return { data, error: null };
        } catch (error) {
            console.error('Error updating employee wallet:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get store items
     * @returns {Promise<Array>}
     */
    async getStoreItems() {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('store_items')
                .select('*')
                .eq('is_active', true)
                .order('category', { ascending: true })
                .order('name', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting store items:', error);
            return [];
        }
    }

    /**
     * Purchase store item
     * @param {number} employeeId - Employee ID
     * @param {number} itemId - Store item ID
     * @param {number} quantity - Quantity to purchase
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async purchaseStoreItem(employeeId, itemId, quantity = 1) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            // Get item details
            const { data: item, error: itemError } = await this.client
                .from('store_items')
                .select('*')
                .eq('id', itemId)
                .single();

            if (itemError) throw itemError;
            if (!item.is_active) {
                return { data: null, error: 'Item is not available' };
            }

            // Check stock
            if (item.stock !== -1 && item.stock < quantity) {
                return { data: null, error: 'Insufficient stock' };
            }

            // Get employee wallet
            const wallet = await this.getEmployeeWallet(employeeId);
            if (!wallet) {
                return { data: null, error: 'Wallet not found' };
            }

            const totalPrice = parseFloat(item.price) * quantity;

            // Check balance
            if (parseFloat(wallet.balance) < totalPrice) {
                return { data: null, error: 'Insufficient funds' };
            }

            // Deduct from wallet
            const walletResult = await this.updateEmployeeWallet(
                employeeId,
                -totalPrice,
                'purchase',
                `Purchased ${quantity}x ${item.name}`
            );

            if (walletResult.error) {
                return { data: null, error: walletResult.error };
            }

            // Create purchase record
            const { data: purchase, error: purchaseError } = await this.client
                .from('purchases')
                .insert({
                    employee_id: employeeId,
                    item_id: itemId,
                    quantity: quantity,
                    total_price: totalPrice,
                    status: 'completed'
                })
                .select()
                .single();

            if (purchaseError) throw purchaseError;

            // Update stock if not unlimited
            if (item.stock !== -1) {
                await this.client
                    .from('store_items')
                    .update({ stock: item.stock - quantity })
                    .eq('id', itemId);
            }

            return { data: purchase, error: null };
        } catch (error) {
            console.error('Error purchasing store item:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get employee purchases
     * @param {number} employeeId - Employee ID
     * @param {number} limit - Number of records
     * @returns {Promise<Array>}
     */
    async getEmployeePurchases(employeeId, limit = 50) {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('purchases')
                .select(`
                    *,
                    store_items (
                        id,
                        name,
                        description,
                        category
                    )
                `)
                .eq('employee_id', employeeId)
                .order('purchased_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting employee purchases:', error);
            return [];
        }
    }

    /**
     * Get stock market data
     * @returns {Promise<Array>}
     */
    async getStockMarket() {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('stock_market')
                .select('*')
                .order('symbol', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting stock market:', error);
            return [];
        }
    }

    /**
     * Update stock prices (random fluctuations)
     * @returns {Promise<boolean>}
     */
    async updateStockPrices() {
        if (!this.isReady()) return false;

        try {
            // Update simulated stocks via database function
            const { data, error } = await this.client.rpc('update_stock_prices');
            if (error) throw error;
            
            // Update real stocks from NYSE
            await this.updateRealStockPrices();
            
            return true;
        } catch (error) {
            console.error('Error updating stock prices:', error);
            return false;
        }
    }

    /**
     * Buy stock
     * @param {number} employeeId - Employee ID
     * @param {string} stockSymbol - Stock symbol
     * @param {number} shares - Number of shares to buy
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async buyStock(employeeId, stockSymbol, shares) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            // Get current stock price
            const { data: stock, error: stockError } = await this.client
                .from('stock_market')
                .select('*')
                .eq('symbol', stockSymbol)
                .single();

            if (stockError) throw stockError;

            const totalCost = parseFloat(stock.current_price) * shares;

            // Get employee wallet
            const wallet = await this.getEmployeeWallet(employeeId);
            if (!wallet || parseFloat(wallet.balance) < totalCost) {
                return { data: null, error: 'Insufficient funds' };
            }

            // Deduct from wallet
            const walletResult = await this.updateEmployeeWallet(
                employeeId,
                -totalCost,
                'stock_buy',
                `Bought ${shares} shares of ${stockSymbol}`
            );

            if (walletResult.error) {
                return { data: null, error: walletResult.error };
            }

            // Create investment record
            const { data: investment, error: investError } = await this.client
                .from('stock_investments')
                .insert({
                    employee_id: employeeId,
                    stock_symbol: stockSymbol,
                    shares: shares,
                    purchase_price: stock.current_price,
                    current_value: totalCost,
                    status: 'active'
                })
                .select()
                .single();

            if (investError) throw investError;

            return { data: investment, error: null };
        } catch (error) {
            console.error('Error buying stock:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Sell stock
     * @param {number} investmentId - Investment ID
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async sellStock(investmentId) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            // Get investment
            const { data: investment, error: investError } = await this.client
                .from('stock_investments')
                .select('*')
                .eq('id', investmentId)
                .single();

            if (investError) throw investError;
            if (investment.status !== 'active') {
                return { data: null, error: 'Investment is not active' };
            }

            // Get current stock price
            const { data: stock, error: stockError } = await this.client
                .from('stock_market')
                .select('*')
                .eq('symbol', investment.stock_symbol)
                .single();

            if (stockError) throw stockError;

            const shares = parseFloat(investment.shares);
            const currentPrice = parseFloat(stock.current_price);
            const purchasePrice = parseFloat(investment.purchase_price);
            const currentValue = currentPrice * shares;
            const purchaseValue = purchasePrice * shares;
            const profit = currentValue - purchaseValue;

            // Add to wallet (add the sale proceeds)
            const walletResult = await this.updateEmployeeWallet(
                investment.employee_id,
                currentValue,
                profit >= 0 ? 'stock_sell' : 'stock_loss',
                `Sold ${shares} shares of ${investment.stock_symbol} at $${currentPrice.toFixed(2)}`
            );

            if (walletResult.error) {
                return { data: null, error: walletResult.error };
            }

            // Update investment
            const { data: updated, error: updateError } = await this.client
                .from('stock_investments')
                .update({
                    status: 'sold',
                    sold_at: new Date().toISOString(),
                    current_value: currentValue
                })
                .eq('id', investmentId)
                .select()
                .single();

            if (updateError) throw updateError;

            return { data: updated, error: null };
        } catch (error) {
            console.error('Error selling stock:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get employee stock investments
     * @param {number} employeeId - Employee ID
     * @returns {Promise<Array>}
     */
    async getEmployeeInvestments(employeeId) {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('stock_investments')
                .select(`
                    *,
                    stock_market (
                        symbol,
                        company_name,
                        current_price,
                        change_percent
                    )
                `)
                .eq('employee_id', employeeId)
                .order('purchased_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting employee investments:', error);
            return [];
        }
    }

    /**
     * Create a wage garnishment
     * @param {number} employeeId - Employee ID
     * @param {string} amountType - 'fixed' or 'percent'
     * @param {number} amount - Amount or percentage
     * @param {string} reason - Reason for garnishment
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD) or null
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async createGarnishment(employeeId, amountType, amount, reason, startDate, endDate = null) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) {
                return { data: null, error: 'Not authenticated' };
            }

            const insertData = {
                employee_id: employeeId,
                amount_type: amountType,
                reason: reason,
                start_date: startDate,
                created_by: user.id
            };

            if (amountType === 'fixed') {
                insertData.amount = amount;
                insertData.percent_of_pay = null; // Explicitly set to null for fixed
            } else {
                insertData.percent_of_pay = amount;
                insertData.amount = null; // Explicitly set to null for percent
            }

            if (endDate) {
                insertData.end_date = endDate;
            }

            const { data, error } = await this.client
                .from('wage_garnishments')
                .insert(insertData)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error creating garnishment:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Update a wage garnishment
     * @param {number} garnishmentId - Garnishment ID
     * @param {string} amountType - 'fixed' or 'percent'
     * @param {number} amount - Amount or percentage
     * @param {string} reason - Reason for garnishment
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD) or null
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async updateGarnishment(garnishmentId, amountType, amount, reason, startDate, endDate = null) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const updateData = {
                amount_type: amountType,
                reason: reason,
                start_date: startDate
            };

            if (amountType === 'fixed') {
                updateData.amount = amount;
                updateData.percent_of_pay = null; // Explicitly set to null for fixed
            } else {
                updateData.percent_of_pay = amount;
                updateData.amount = null; // Explicitly set to null for percent
            }

            if (endDate) {
                updateData.end_date = endDate;
            } else {
                updateData.end_date = null;
            }

            const { data, error } = await this.client
                .from('wage_garnishments')
                .update(updateData)
                .eq('id', garnishmentId)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error updating garnishment:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Cancel a wage garnishment
     * @param {number} garnishmentId - Garnishment ID
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async cancelGarnishment(garnishmentId) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data, error } = await this.client
                .from('wage_garnishments')
                .update({ status: 'cancelled' })
                .eq('id', garnishmentId)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error cancelling garnishment:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get all wage garnishments
     * @returns {Promise<Array>}
     */
    async getGarnishments() {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('wage_garnishments')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting garnishments:', error);
            return [];
        }
    }

    /**
     * Get a specific garnishment
     * @param {number} garnishmentId - Garnishment ID
     * @returns {Promise<Object|null>}
     */
    async getGarnishment(garnishmentId) {
        if (!this.isReady()) return null;

        try {
            const { data, error } = await this.client
                .from('wage_garnishments')
                .select('*')
                .eq('id', garnishmentId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting garnishment:', error);
            return null;
        }
    }

    /**
     * Get active garnishments for an employee
     * @param {number} employeeId - Employee ID
     * @param {string} payPeriodStart - Pay period start date
     * @param {string} payPeriodEnd - Pay period end date
     * @returns {Promise<Array>}
     */
    async getEmployeeGarnishments(employeeId, payPeriodStart, payPeriodEnd) {
        if (!this.isReady()) return [];

        try {
            // Get all active garnishments for this employee
            const { data, error } = await this.client
                .from('wage_garnishments')
                .select('*')
                .eq('employee_id', employeeId)
                .eq('status', 'active')
                .lte('start_date', payPeriodEnd)
                .order('created_at', { ascending: true });

            if (error) throw error;
            
            // Filter in JavaScript to handle null end_date and date ranges
            const filtered = (data || []).filter(g => {
                // Must have started by or before the pay period end
                if (g.start_date > payPeriodEnd) return false;
                
                // If end_date is null, it's indefinite (active)
                if (!g.end_date) return true;
                
                // If end_date exists, must be on or after pay period start
                return g.end_date >= payPeriodStart;
            });
            
            return filtered;
        } catch (error) {
            console.error('Error getting employee garnishments:', error);
            return [];
        }
    }

    /**
     * Process garnishment deduction and log it
     * @param {number} garnishmentId - Garnishment ID
     * @param {number} employeeId - Employee ID
     * @param {string} payPeriodStart - Pay period start date
     * @param {string} payPeriodEnd - Pay period end date
     * @param {number} grossPay - Employee gross pay
     * @param {number} netPay - Employee net pay (before garnishment)
     * @param {number} amountGarnished - Amount to garnish
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async processGarnishment(garnishmentId, employeeId, payPeriodStart, payPeriodEnd, grossPay, netPay, amountGarnished) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            // Log garnishment history
            const { data: historyData, error: historyError } = await this.client
                .from('garnishment_history')
                .insert({
                    garnishment_id: garnishmentId,
                    pay_period_start: payPeriodStart,
                    pay_period_end: payPeriodEnd,
                    amount_garnished: amountGarnished,
                    employee_gross_pay: grossPay,
                    employee_net_pay: netPay
                })
                .select()
                .single();

            if (historyError) throw historyError;

            // Update total garnished amount
            const { data: garnishment } = await this.client
                .from('wage_garnishments')
                .select('total_garnished')
                .eq('id', garnishmentId)
                .single();

            const newTotal = parseFloat(garnishment.total_garnished || 0) + amountGarnished;

            await this.client
                .from('wage_garnishments')
                .update({ total_garnished: newTotal })
                .eq('id', garnishmentId);

            return { data: historyData, error: null };
        } catch (error) {
            console.error('Error processing garnishment:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get employee transaction history
     * @param {number} employeeId - Employee ID
     * @param {number} limit - Number of records to retrieve (default: 100)
     * @returns {Promise<Array>}
     */
    async getEmployeeTransactions(employeeId, limit = 100) {
        if (!this.isReady()) return [];

        try {
            // Ensure employeeId is a number
            const id = typeof employeeId === 'string' ? parseInt(employeeId) : employeeId;
            console.log('Fetching transactions for employee ID:', id, 'Type:', typeof id);
            
            const { data, error } = await this.client
                .from('transactions')
                .select('*')
                .eq('employee_id', id)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('Error fetching transactions:', error);
                throw error;
            }
            
            console.log('Fetched transactions:', data?.length || 0, data);
            return data || [];
        } catch (error) {
            console.error('Error getting employee transactions:', error);
            return [];
        }
    }

    /**
     * Deduct amount from employee wallet (for direct wallet garnishment)
     * @param {number} employeeId - Employee ID
     * @param {number} amount - Amount to deduct
     * @param {string} reason - Reason for deduction
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async deductFromWallet(employeeId, amount, reason) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            // Use negative amount to deduct
            const result = await this.updateEmployeeWallet(
                employeeId,
                -Math.abs(amount), // Ensure negative
                'garnishment',
                reason || 'Wage garnishment deduction'
            );

            return result;
        } catch (error) {
            console.error('Error deducting from wallet:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get stock price history for a specific stock
     * @param {number} stockId - Stock ID
     * @param {number} limit - Number of records to retrieve (default: 50)
     * @returns {Promise<Array>}
     */
    async getStockPriceHistory(stockId, limit = 50) {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('stock_price_history')
                .select('price, recorded_at')
                .eq('stock_id', stockId)
                .order('recorded_at', { ascending: true })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting stock price history:', error);
            return [];
        }
    }

    /**
     * Create a new stock
     * @param {string} symbol - Stock symbol
     * @param {string} companyName - Company name
     * @param {number} initialPrice - Initial stock price
     * @param {number} volatility - Volatility percentage
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async createStock(symbol, companyName, initialPrice, volatility = 10.00) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data, error } = await this.client.rpc('create_stock', {
                p_symbol: symbol.toUpperCase(),
                p_company_name: companyName,
                p_initial_price: initialPrice,
                p_volatility: volatility
            });

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error creating stock:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Fetch real stock data from NYSE and add to database
     * @param {string} symbol - Stock symbol (e.g., AAPL, MSFT)
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async addRealStock(symbol) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            // Fetch stock data from Yahoo Finance API via CORS proxy (free, no API key needed)
            // Using allorigins.win as a free CORS proxy
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`;
            
            let stockData;
            try {
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const proxyData = await response.json();
                
                // Parse the proxied response
                if (!proxyData.contents) {
                    throw new Error('Invalid response from proxy');
                }
                
                const data = JSON.parse(proxyData.contents);
                
                if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                    throw new Error('Stock symbol not found');
                }
                
                const result = data.chart.result[0];
                const meta = result.meta;
                const quote = result.indicators?.quote?.[0];
                
                if (!meta || !quote) {
                    throw new Error('Invalid stock data received');
                }
                
                const currentPrice = meta.regularMarketPrice || meta.previousClose || 0;
                const previousClose = meta.previousClose || currentPrice;
                const changePercent = ((currentPrice - previousClose) / previousClose) * 100;
                const companyName = meta.longName || meta.shortName || symbol;
                
                stockData = {
                    symbol: symbol.toUpperCase(),
                    companyName: companyName,
                    currentPrice: currentPrice,
                    previousPrice: previousClose,
                    changePercent: changePercent,
                    source: 'nyse'
                };
            } catch (apiError) {
                console.error('Error fetching from Yahoo Finance:', apiError);
                // Fallback: Try Alpha Vantage (requires free API key, but we'll try without)
                // Or use a simpler approach - just create the stock with a placeholder price
                throw new Error(`Failed to fetch stock data: ${apiError.message}. Please verify the symbol is correct.`);
            }
            
            // Use upsert to handle both new and existing stocks
            const { data, error } = await this.client
                .from('stock_market')
                .upsert({
                    symbol: stockData.symbol,
                    company_name: stockData.companyName,
                    current_price: stockData.currentPrice,
                    previous_price: stockData.previousPrice,
                    change_percent: stockData.changePercent,
                    volatility: 5.00, // Default volatility for real stocks
                    is_real_stock: true,
                    source: stockData.source,
                    last_updated: new Date().toISOString()
                }, {
                    onConflict: 'symbol',
                    ignoreDuplicates: false
                })
                .select()
                .single();
            
            if (error) {
                // If upsert fails, try update instead
                if (error.code === '23505' || error.message.includes('duplicate')) {
                    const { data: updated, error: updateError } = await this.client
                        .from('stock_market')
                        .update({
                            company_name: stockData.companyName,
                            current_price: stockData.currentPrice,
                            previous_price: stockData.previousPrice,
                            change_percent: stockData.changePercent,
                            is_real_stock: true,
                            source: stockData.source,
                            last_updated: new Date().toISOString()
                        })
                        .eq('symbol', stockData.symbol)
                        .select()
                        .single();
                    
                    if (updateError) throw updateError;
                    
                    // Price history will be created by trigger when price updates
                    return { data: updated, error: null };
                }
                throw error;
            }
            
            // Create initial price history entry only if it's a new stock
            // Check if history already exists
            const { data: existingHistory } = await this.client
                .from('stock_price_history')
                .select('id')
                .eq('stock_id', data.id)
                .limit(1)
                .maybeSingle();
            
            if (!existingHistory) {
                // Only insert if no history exists (new stock)
                // Note: This might fail due to RLS, but the trigger will handle it
                try {
                    await this.client
                        .from('stock_price_history')
                        .insert({
                            stock_id: data.id,
                            price: stockData.currentPrice,
                            recorded_at: new Date().toISOString()
                        });
                } catch (historyError) {
                    // Ignore RLS errors - the trigger will create history on next price update
                    console.warn('Could not create initial price history (RLS may block), trigger will handle it:', historyError);
                }
            }
            
            return { data, error: null };
        } catch (error) {
            console.error('Error adding real stock:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Update real stock prices from NYSE
     * @returns {Promise<boolean>}
     */
    async updateRealStockPrices() {
        if (!this.isReady()) return false;

        try {
            // Get all real stocks
            const { data: realStocks, error: fetchError } = await this.client
                .from('stock_market')
                .select('id, symbol')
                .eq('is_real_stock', true);
            
            if (fetchError) throw fetchError;
            if (!realStocks || realStocks.length === 0) return true; // No real stocks to update
            
            console.log(`📊 Updating ${realStocks.length} real stocks from NYSE...`);
            
            // Update each real stock (with rate limiting)
            for (let i = 0; i < realStocks.length; i++) {
                const stock = realStocks[i];
                
                try {
                    // Fetch current price from Yahoo Finance via CORS proxy
                    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?interval=1d&range=1d`;
                    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`;
                    const response = await fetch(proxyUrl);
                    
                    if (!response.ok) {
                        console.warn(`⚠️ Failed to fetch ${stock.symbol}: HTTP ${response.status}`);
                        continue;
                    }
                    
                    const proxyData = await response.json();
                    
                    // Parse the proxied response
                    if (!proxyData.contents) {
                        console.warn(`⚠️ Invalid response for ${stock.symbol}`);
                        continue;
                    }
                    
                    const data = JSON.parse(proxyData.contents);
                    
                    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                        console.warn(`⚠️ No data for ${stock.symbol}`);
                        continue;
                    }
                    
                    const result = data.chart.result[0];
                    const meta = result.meta;
                    
                    if (!meta) {
                        console.warn(`⚠️ Invalid data for ${stock.symbol}`);
                        continue;
                    }
                    
                    const currentPrice = meta.regularMarketPrice || meta.previousClose || 0;
                    const previousClose = meta.previousClose || currentPrice;
                    const changePercent = ((currentPrice - previousClose) / previousClose) * 100;
                    
                    // Get old price from database
                    const { data: stockData } = await this.client
                        .from('stock_market')
                        .select('current_price')
                        .eq('id', stock.id)
                        .single();
                    
                    const oldPrice = stockData?.current_price || currentPrice;
                    
                    // Update stock price
                    await this.client.rpc('update_real_stock_price', {
                        p_stock_id: stock.id,
                        p_new_price: currentPrice,
                        p_change_percent: changePercent
                    });
                    
                    console.log(`✅ Updated ${stock.symbol}: $${oldPrice.toFixed(2)} → $${currentPrice.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
                    
                    // Rate limiting: wait 200ms between requests to avoid hitting API limits
                    if (i < realStocks.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                } catch (error) {
                    console.error(`❌ Error updating ${stock.symbol}:`, error);
                    // Continue with next stock
                }
            }
            
            console.log('✅ Real stock price update complete');
            return true;
        } catch (error) {
            console.error('Error updating real stock prices:', error);
            return false;
        }
    }

    /**
     * Get employee 401k enrollment
     * @param {number} employeeId - Employee ID
     * @returns {Promise<Object|null>}
     */
    async getEmployee401k(employeeId) {
        if (!this.isReady()) return null;

        try {
            const { data, error } = await this.client
                .from('employee_401k')
                .select('*')
                .eq('employee_id', employeeId)
                .maybeSingle();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting employee 401k:', error);
            return null;
        }
    }

    /**
     * Enroll employee in 401k
     * @param {number} employeeId - Employee ID
     * @param {number} contributionPercent - Contribution percentage
     * @param {number} maxContribution - Optional max contribution
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async enroll401k(employeeId, contributionPercent, maxContribution = null) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data, error } = await this.client
                .from('employee_401k')
                .insert({
                    employee_id: employeeId,
                    contribution_percent: contributionPercent,
                    max_contribution: maxContribution,
                    status: 'active'
                })
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error enrolling in 401k:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Update 401k contribution
     * @param {number} employeeId - Employee ID
     * @param {number} contributionPercent - New contribution percentage
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async update401kContribution(employeeId, contributionPercent) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data, error } = await this.client
                .from('employee_401k')
                .update({ contribution_percent: contributionPercent })
                .eq('employee_id', employeeId)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error updating 401k contribution:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get 401k contribution history
     * @param {number} employee401kId - 401k account ID
     * @returns {Promise<Array>}
     */
    async get401kContributions(employee401kId) {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('employee_401k_contributions')
                .select('*')
                .eq('employee_401k_id', employee401kId)
                .order('contributed_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting 401k contributions:', error);
            return [];
        }
    }

    /**
     * Get employee SMP enrollment
     * @param {number} employeeId - Employee ID
     * @returns {Promise<Object|null>}
     */
    async getEmployeeSMP(employeeId) {
        if (!this.isReady()) return null;

        try {
            const { data, error } = await this.client
                .from('smp_enrollments')
                .select('*')
                .eq('employee_id', employeeId)
                .maybeSingle();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting employee SMP:', error);
            return null;
        }
    }

    /**
     * Enroll employee in SMP
     * @param {number} employeeId - Employee ID
     * @param {number} contributionPercent - Contribution percentage
     * @param {string} stockSymbol - Stock symbol to purchase
     * @param {number} maxContribution - Optional max contribution
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async enrollSMP(employeeId, contributionPercent, stockSymbol, maxContribution = null) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data, error } = await this.client
                .from('smp_enrollments')
                .insert({
                    employee_id: employeeId,
                    contribution_percent: contributionPercent,
                    stock_symbol: stockSymbol.toUpperCase(),
                    max_contribution: maxContribution,
                    status: 'active'
                })
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error enrolling in SMP:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Update SMP contribution
     * @param {number} employeeId - Employee ID
     * @param {number} contributionPercent - New contribution percentage
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async updateSMPContribution(employeeId, contributionPercent) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data, error } = await this.client
                .from('smp_enrollments')
                .update({ contribution_percent: contributionPercent })
                .eq('employee_id', employeeId)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error updating SMP contribution:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get SMP contribution history
     * @param {number} smpEnrollmentId - SMP enrollment ID
     * @returns {Promise<Array>}
     */
    async getSMPContributions(smpEnrollmentId) {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('smp_contributions')
                .select('*')
                .eq('smp_enrollment_id', smpEnrollmentId)
                .order('contributed_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting SMP contributions:', error);
            return [];
        }
    }

    /**
     * Get company debt
     * @returns {Promise<Array>}
     */
    async getCompanyDebt() {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('company_debt')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting company debt:', error);
            return [];
        }
    }

    /**
     * Add company debt
     * @param {Object} debtData - Debt information
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async addCompanyDebt(debtData) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data, error } = await this.client
                .from('company_debt')
                .insert(debtData)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error adding company debt:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Make debt payment
     * @param {number} debtId - Debt ID
     * @param {number} paymentAmount - Payment amount
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async makeDebtPayment(debtId, paymentAmount) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            // Get debt
            const { data: debt, error: debtError } = await this.client
                .from('company_debt')
                .select('*')
                .eq('id', debtId)
                .single();

            if (debtError) throw debtError;

            const interestAmount = parseFloat(debt.remaining_balance) * (parseFloat(debt.interest_rate) / 100 / 12);
            const principalAmount = paymentAmount - interestAmount;
            const newBalance = parseFloat(debt.remaining_balance) - principalAmount;

            // Record payment
            const { data: payment, error: paymentError } = await this.client
                .from('debt_payments')
                .insert({
                    debt_id: debtId,
                    payment_amount: paymentAmount,
                    payment_date: new Date().toISOString().split('T')[0],
                    principal_paid: principalAmount,
                    interest_paid: interestAmount,
                    remaining_balance: newBalance > 0 ? newBalance : 0
                })
                .select()
                .single();

            if (paymentError) throw paymentError;

            // Update debt
            const updateData = {
                remaining_balance: newBalance > 0 ? newBalance : 0,
                next_payment_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            };

            if (newBalance <= 0) {
                updateData.status = 'paid';
            }

            await this.client
                .from('company_debt')
                .update(updateData)
                .eq('id', debtId);

            return { data: payment, error: null };
        } catch (error) {
            console.error('Error making debt payment:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get employee pay rates
     * @param {number} employeeId - Employee ID
     * @returns {Promise<Array>}
     */
    async getEmployeePayRates(employeeId) {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('employee_pay_rates')
                .select('*')
                .eq('employee_id', employeeId)
                .order('effective_date', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting employee pay rates:', error);
            return [];
        }
    }

    /**
     * Set employee pay rate
     * @param {number} employeeId - Employee ID
     * @param {number} hourlyRate - Hourly rate
     * @param {string} rateType - Rate type (standard, random, custom, performance)
     * @param {Date} effectiveDate - Effective date
     * @param {string} notes - Optional notes
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async setEmployeePayRate(employeeId, hourlyRate, rateType = 'standard', effectiveDate = null, notes = null) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) {
                return { data: null, error: 'Not authenticated' };
            }

            const insertData = {
                employee_id: employeeId,
                hourly_rate: hourlyRate,
                rate_type: rateType,
                effective_date: effectiveDate || new Date().toISOString().split('T')[0],
                set_by: user.id
            };

            if (notes) {
                insertData.notes = notes;
            }

            const { data, error } = await this.client
                .from('employee_pay_rates')
                .upsert(insertData, {
                    onConflict: 'employee_id,effective_date'
                })
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error setting employee pay rate:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Send email
     * @param {string} toUserId - Recipient user ID (UUID)
     * @param {string} subject - Email subject
     * @param {string} body - Email body
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async sendEmail(toUserId, subject, body) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) {
                return { data: null, error: 'Not authenticated' };
            }

            const { data, error } = await this.client
                .from('emails')
                .insert({
                    from_user_id: user.id,
                    to_user_id: toUserId,
                    subject: subject,
                    body: body
                })
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error sending email:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get inbox emails
     * @param {number} limit - Number of emails
     * @returns {Promise<Array>}
     */
    async getInboxEmails(limit = 50) {
        if (!this.isReady()) return [];

        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) return [];

            const { data, error } = await this.client
                .from('emails')
                .select(`
                    *,
                    from_user:users!emails_from_user_id_fkey (
                        id,
                        username,
                        full_name,
                        email
                    ),
                    to_user:users!emails_to_user_id_fkey (
                        id,
                        username,
                        full_name,
                        email
                    )
                `)
                .eq('to_user_id', user.id)
                .eq('is_deleted', false)
                .order('sent_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting inbox emails:', error);
            return [];
        }
    }

    /**
     * Get sent emails
     * @param {number} limit - Number of emails
     * @returns {Promise<Array>}
     */
    async getSentEmails(limit = 50) {
        if (!this.isReady()) return [];

        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) return [];

            const { data, error } = await this.client
                .from('emails')
                .select(`
                    *,
                    from_user:users!emails_from_user_id_fkey (
                        id,
                        username,
                        full_name,
                        email
                    ),
                    to_user:users!emails_to_user_id_fkey (
                        id,
                        username,
                        full_name,
                        email
                    )
                `)
                .eq('from_user_id', user.id)
                .eq('is_deleted', false)
                .order('sent_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting sent emails:', error);
            return [];
        }
    }

    /**
     * Mark email as read
     * @param {number} emailId - Email ID
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async markEmailAsRead(emailId) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data, error } = await this.client
                .from('emails')
                .update({
                    is_read: true,
                    read_at: new Date().toISOString()
                })
                .eq('id', emailId)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error marking email as read:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Delete email
     * @param {number} emailId - Email ID
     * @returns {Promise<{data: any, error: string|null}>}
     */
    async deleteEmail(emailId) {
        if (!this.isReady()) return { data: null, error: 'Supabase not initialized' };

        try {
            const { data, error } = await this.client
                .from('emails')
                .update({ is_deleted: true })
                .eq('id', emailId)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error deleting email:', error);
            return { data: null, error: error.message };
        }
    }

    /**
     * Get unread email count
     * @returns {Promise<number>}
     */
    async getUnreadEmailCount() {
        if (!this.isReady()) return 0;

        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) return 0;

            const { count, error } = await this.client
                .from('emails')
                .select('*', { count: 'exact', head: true })
                .eq('to_user_id', user.id)
                .eq('is_read', false)
                .eq('is_deleted', false);

            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error getting unread email count:', error);
            return 0;
        }
    }

    /**
     * Get all users (for email compose)
     * @returns {Promise<Array>}
     */
    async getAllUsers() {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client
                .from('users')
                .select('id, username, full_name, email')
                .order('full_name', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    }

    // ==========================================
    // CREW SCHEDULING / ROUTE MANAGEMENT
    // ==========================================

    /**
     * Get all active airlines
     */
    async getAirlines() {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('airlines')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching airlines:', error);
            return null;
        }

        return data;
    }

    /**
     * Get all routes with schedules
     */
    async getRoutes(airlineId = null) {
        if (!this.isReady()) return null;

        let query = this.client
            .from('routes')
            .select(`
                *,
                airlines:airline_id (
                    id,
                    code,
                    name
                ),
                route_schedules (
                    id,
                    day_of_week,
                    departure_time,
                    is_active
                )
            `)
            .eq('is_active', true)
            .order('route_number', { ascending: true });

        if (airlineId) {
            query = query.eq('airline_id', airlineId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching routes:', error);
            return null;
        }

        return data;
    }

    /**
     * Create a new route
     */
    async createRoute(routeData) {
        if (!this.isReady()) return null;

        const { scheduleDays, ...routeInfo } = routeData;
        
        // Create route
        const { data: route, error: routeError } = await this.client
            .from('routes')
            .insert({
                ...routeInfo,
                created_by: this.currentUser?.id
            })
            .select(`
                *,
                airlines:airline_id (
                    id,
                    code,
                    name
                )
            `)
            .single();

        if (routeError) {
            console.error('Error creating route:', routeError);
            return null;
        }

        // Create route schedules
        if (scheduleDays && scheduleDays.length > 0) {
            const schedules = scheduleDays.map(day => ({
                route_id: route.id,
                day_of_week: parseInt(day),
                departure_time: routeInfo.default_departure_time,
                is_active: true
            }));

            const { error: scheduleError } = await this.client
                .from('route_schedules')
                .insert(schedules);

            if (scheduleError) {
                console.error('Error creating route schedules:', scheduleError);
                // Route was created, but schedules failed - still return route
            }
        }

        console.log('✅ Route created');
        return route;
    }

    /**
     * Update a route
     */
    async updateRoute(routeId, updates) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('routes')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', routeId)
            .select(`
                *,
                airlines:airline_id (
                    id,
                    code,
                    name
                )
            `)
            .single();

        if (error) {
            console.error('Error updating route:', error);
            return null;
        }

        return data;
    }

    /**
     * Delete a route
     */
    async deleteRoute(routeId) {
        if (!this.isReady()) return null;

        const { error } = await this.client
            .from('routes')
            .delete()
            .eq('id', routeId);

        if (error) {
            console.error('Error deleting route:', error);
            return false;
        }

        return true;
    }

    /**
     * Get trips (crew assignments) for an employee
     */
    async getEmployeeTrips(employeeId, startDate = null, endDate = null) {
        if (!this.isReady()) return null;

        let query = this.client
            .from('trips')
            .select(`
                *,
                routes:route_id (
                    *,
                    airlines:airline_id (
                        id,
                        code,
                        name
                    )
                ),
                employees:employee_id (
                    id,
                    name
                )
            `)
            .eq('employee_id', employeeId)
            .order('trip_date', { ascending: true })
            .order('departure_time', { ascending: true });

        if (startDate && endDate) {
            query = query
                .gte('trip_date', startDate)
                .lte('trip_date', endDate);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching employee trips:', error);
            return null;
        }

        return data;
    }

    /**
     * Get all trips for a date range (for crew schedulers)
     */
    async getAllTrips(startDate, endDate) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('trips')
            .select(`
                *,
                routes:route_id (
                    *,
                    airlines:airline_id (
                        id,
                        code,
                        name
                    )
                ),
                employees:employee_id (
                    id,
                    name
                )
            `)
            .gte('trip_date', startDate)
            .lte('trip_date', endDate)
            .order('trip_date', { ascending: true })
            .order('departure_time', { ascending: true });

        if (error) {
            console.error('Error fetching trips:', error);
            return null;
        }

        return data;
    }

    /**
     * Assign crew to a route (creates a trip)
     */
    async assignCrewToRoute(tripData) {
        if (!this.isReady()) return null;

        // Get route to calculate arrival time
        const { data: route, error: routeError } = await this.client
            .from('routes')
            .select('flight_duration_minutes, default_departure_time')
            .eq('id', tripData.route_id)
            .single();

        if (routeError) {
            console.error('Error fetching route:', routeError);
            return null;
        }

        // Calculate arrival time
        const departureTime = tripData.departure_time || route.default_departure_time;
        const durationMinutes = route.flight_duration_minutes;
        
        // Calculate arrival time (simple calculation)
        const [hours, minutes] = departureTime.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes + durationMinutes;
        const arrivalHours = Math.floor(totalMinutes / 60) % 24;
        const arrivalMins = totalMinutes % 60;
        const arrivalTime = `${String(arrivalHours).padStart(2, '0')}:${String(arrivalMins).padStart(2, '0')}:00`;

        const { data, error } = await this.client
            .from('trips')
            .insert({
                ...tripData,
                arrival_time: arrivalTime,
                assigned_by: this.currentUser?.id
            })
            .select(`
                *,
                routes:route_id (
                    *,
                    airlines:airline_id (
                        id,
                        code,
                        name
                    )
                ),
                employees:employee_id (
                    id,
                    name
                )
            `)
            .single();

        if (error) {
            console.error('Error assigning crew:', error);
            return null;
        }

        console.log('✅ Crew assigned to route');
        return data;
    }

    /**
     * Update trip status
     */
    async updateTrip(tripId, updates) {
        if (!this.isReady()) return null;

        const { data, error } = await this.client
            .from('trips')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', tripId)
            .select(`
                *,
                flights:flight_id (
                    *,
                    airlines:airline_id (
                        id,
                        code,
                        name
                    )
                ),
                employees:employee_id (
                    id,
                    name
                )
            `)
            .single();

        if (error) {
            console.error('Error updating trip:', error);
            return null;
        }

        return data;
    }

    /**
     * Remove crew assignment (delete trip)
     */
    async removeCrewAssignment(tripId) {
        if (!this.isReady()) return null;

        const { error } = await this.client
            .from('trips')
            .delete()
            .eq('id', tripId);

        if (error) {
            console.error('Error removing crew assignment:', error);
            return false;
        }

        return true;
    }
}

// Create global instance
const supabaseService = new SupabaseService();

// Also expose on window for scripts that check window.supabaseService
if (typeof window !== 'undefined') {
    window.supabaseService = supabaseService;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseService;
}


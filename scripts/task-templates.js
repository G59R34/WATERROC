// Task Templates Management Script
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    // Initialize notification system if available
    if (typeof notificationSystem !== 'undefined') {
        await notificationSystem.init();
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
    }

    let templates = [];
    let editingTemplateId = null;

    // DOM Elements
    const templatesList = document.getElementById('templatesList');
    const addTemplateBtn = document.getElementById('addTemplateBtn');
    const backBtn = document.getElementById('backBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const templateModal = document.getElementById('templateModal');
    const closeTemplateModal = document.getElementById('closeTemplateModal');
    const cancelTemplateBtn = document.getElementById('cancelTemplateBtn');
    const templateForm = document.getElementById('templateForm');
    const templateModalTitle = document.getElementById('templateModalTitle');

    // Load templates
    await loadTemplates();

    // Event Listeners
    addTemplateBtn.addEventListener('click', () => {
        editingTemplateId = null;
        templateModalTitle.textContent = 'Add Task Template';
        templateForm.reset();
        templateModal.style.display = 'flex';
    });

    backBtn.addEventListener('click', () => {
        if (typeof showPageLoadScreen !== 'undefined') {
            showPageLoadScreen();
        }
        window.location.href = 'admin.html';
    });

    logoutBtn.addEventListener('click', async () => {
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                await supabaseService.signOut();
            }
        } catch (error) {
            console.error('Error during logout:', error);
        }
        sessionStorage.clear();
        window.location.href = 'index.html';
    });

    closeTemplateModal.addEventListener('click', () => {
        templateModal.style.display = 'none';
        templateForm.reset();
    });

    cancelTemplateBtn.addEventListener('click', () => {
        templateModal.style.display = 'none';
        templateForm.reset();
    });

    templateModal.addEventListener('click', (e) => {
        if (e.target === templateModal) {
            templateModal.style.display = 'none';
            templateForm.reset();
        }
    });

    templateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (typeof showFormLoadingScreen !== 'undefined') {
            showFormLoadingScreen('template', async () => {
                await saveTemplate();
            });
        } else {
            await saveTemplate();
        }
    });

    // Load task templates
    async function loadTemplates() {
        if (!supabaseService.isReady()) {
            templatesList.innerHTML = '<div class="loading-message">Supabase connection required</div>';
            return;
        }

        try {
            const { data, error } = await supabaseService.client
                .from('task_templates')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            templates = data || [];
            renderTemplates();
        } catch (error) {
            console.error('Error loading templates:', error);
            templatesList.innerHTML = '<div class="loading-message">Error loading templates</div>';
        }
    }

    // Render templates list
    function renderTemplates() {
        if (!templates || templates.length === 0) {
            templatesList.innerHTML = `
                <div class="info-card">
                    <p>No task templates yet. Click "Add Task Template" to create one.</p>
                </div>
            `;
            return;
        }

        const priorityColors = {
            low: '#64748b',
            normal: '#2563eb',
            high: '#dc2626'
        };

        templatesList.innerHTML = templates.map(template => `
            <div class="time-off-item" style="border-left: 4px solid ${priorityColors[template.priority]};">
                <div class="time-off-info" style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                        <div>
                            <div style="font-weight: 600; font-size: 1.05rem; color: var(--text-primary); margin-bottom: 4px;">
                                ${escapeHtml(template.title)}
                            </div>
                            <div style="color: var(--text-secondary); font-size: 0.9rem;">
                                ${template.description ? escapeHtml(template.description) : 'No description'}
                            </div>
                        </div>
                        <span style="background: ${priorityColors[template.priority]}; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; white-space: nowrap;">
                            ${template.priority.toUpperCase()}
                        </span>
                    </div>
                    <div style="display: flex; gap: 20px; font-size: 0.85rem; color: var(--text-secondary); margin-top: 10px;">
                        <div>
                            <strong>Duration:</strong> ${template.duration_hours} hours
                        </div>
                        <div>
                            <strong>Auto-assign:</strong> ${template.auto_assign ? '✓ Yes' : '✗ No'}
                        </div>
                    </div>
                </div>
                <div class="time-off-actions" style="gap: 8px;">
                    <button class="btn-secondary" onclick="editTemplate(${template.id})">Edit</button>
                    <button class="btn-danger" onclick="deleteTemplate(${template.id})">Delete</button>
                </div>
            </div>
        `).join('');
    }

    // Save template
    async function saveTemplate() {
        if (!supabaseService.isReady()) {
            alert('Supabase connection required');
            return;
        }

        const templateData = {
            title: document.getElementById('templateTitle').value.trim(),
            description: document.getElementById('templateDescription').value.trim(),
            duration_hours: parseFloat(document.getElementById('templateDuration').value),
            priority: document.getElementById('templatePriority').value,
            auto_assign: document.getElementById('templateAutoAssign').checked,
            updated_at: new Date().toISOString()
        };

        try {
            let result;
            if (editingTemplateId) {
                // Update existing template
                result = await supabaseService.client
                    .from('task_templates')
                    .update(templateData)
                    .eq('id', editingTemplateId);
            } else {
                // Create new template
                result = await supabaseService.client
                    .from('task_templates')
                    .insert([templateData]);
            }

            if (result.error) throw result.error;

            alert(editingTemplateId ? 'Template updated successfully!' : 'Template created successfully!');
            templateModal.style.display = 'none';
            templateForm.reset();
            await loadTemplates();
        } catch (error) {
            console.error('Error saving template:', error);
            alert('Failed to save template: ' + error.message);
        }
    }

    // Edit template
    window.editTemplate = async function(templateId) {
        const template = templates.find(t => t.id === templateId);
        if (!template) return;

        editingTemplateId = templateId;
        templateModalTitle.textContent = 'Edit Task Template';
        
        document.getElementById('templateTitle').value = template.title;
        document.getElementById('templateDescription').value = template.description || '';
        document.getElementById('templateDuration').value = template.duration_hours;
        document.getElementById('templatePriority').value = template.priority;
        document.getElementById('templateAutoAssign').checked = template.auto_assign;
        
        templateModal.style.display = 'flex';
    };

    // Delete template
    window.deleteTemplate = async function(templateId) {
        if (!confirm('Are you sure you want to delete this task template?')) return;

        if (!supabaseService.isReady()) {
            alert('Supabase connection required');
            return;
        }

        try {
            const { error } = await supabaseService.client
                .from('task_templates')
                .delete()
                .eq('id', templateId);

            if (error) throw error;

            alert('Template deleted successfully!');
            await loadTemplates();
        } catch (error) {
            console.error('Error deleting template:', error);
            alert('Failed to delete template: ' + error.message);
        }
    };

    // Utility function
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

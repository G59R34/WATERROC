// Employee Profiles Script
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    let currentEmployeeId = null;
    let employees = [];
    let profiles = [];

    // Navigation
    document.getElementById('backToDashboard').addEventListener('click', function() {
        window.location.href = 'admin.html';
    });

    document.getElementById('logoutBtn').addEventListener('click', async function() {
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

    // Check Supabase connection
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
            window.location.href = 'index.html';
            return;
        }
    } else {
        alert('Employee Profiles requires Supabase connection');
        window.location.href = 'admin.html';
        return;
    }

    // Profile Modal
    const profileModal = document.getElementById('profileModal');
    const profileForm = document.getElementById('profileForm');
    const closeModal = profileModal.querySelector('.close');
    const cancelBtn = document.getElementById('cancelProfileBtn');

    closeModal.addEventListener('click', () => {
        profileModal.style.display = 'none';
    });

    cancelBtn.addEventListener('click', () => {
        profileModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === profileModal) {
            profileModal.style.display = 'none';
        }
    });

    // Refresh button
    document.getElementById('refreshProfilesBtn').addEventListener('click', loadProfiles);

    // Load profiles
    async function loadProfiles() {
        const grid = document.getElementById('profilesGrid');
        grid.innerHTML = '<div class="loading-message">Loading profiles...</div>';

        try {
            employees = await supabaseService.getEmployees();
            profiles = await supabaseService.getAllEmployeeProfiles();

            if (!employees || employees.length === 0) {
                grid.innerHTML = '<div class="no-data-message">No employees found. Add employees first.</div>';
                return;
            }

            // Create profile map for quick lookup
            const profileMap = {};
            if (profiles) {
                profiles.forEach(p => {
                    profileMap[p.employee_id] = p;
                });
            }

            // Render profile cards
            grid.innerHTML = employees.map(emp => {
                const profile = profileMap[emp.id] || {};
                const initials = emp.name.split(' ').map(n => n[0]).join('').toUpperCase();
                
                return `
                    <div class="profile-card" data-employee-id="${emp.id}">
                        <div class="profile-header">
                            <div class="profile-avatar">${initials}</div>
                            <div class="profile-info">
                                <h3 class="profile-name">${escapeHtml(emp.name)}</h3>
                                <p class="profile-role">${escapeHtml(emp.role)}</p>
                            </div>
                        </div>
                        
                        <div class="profile-details">
                            ${profile.phone ? `
                                <div class="profile-detail">
                                    <span class="profile-detail-icon">📞</span>
                                    <span class="profile-detail-label">Phone:</span>
                                    <span class="profile-detail-value">${escapeHtml(profile.phone)}</span>
                                </div>
                            ` : ''}
                            ${profile.email ? `
                                <div class="profile-detail">
                                    <span class="profile-detail-icon">📧</span>
                                    <span class="profile-detail-label">Email:</span>
                                    <span class="profile-detail-value">${escapeHtml(profile.email)}</span>
                                </div>
                            ` : ''}
                            ${profile.hire_date ? `
                                <div class="profile-detail">
                                    <span class="profile-detail-icon">📅</span>
                                    <span class="profile-detail-label">Hired:</span>
                                    <span class="profile-detail-value">${new Date(profile.hire_date).toLocaleDateString()}</span>
                                </div>
                            ` : ''}
                        </div>
                        
                        ${profile.skills && profile.skills.length > 0 ? `
                            <div class="profile-skills">
                                <div class="profile-skills-title">Skills</div>
                                <div class="skill-tags">
                                    ${profile.skills.map(skill => `<span class="skill-tag">${escapeHtml(skill)}</span>`).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${profile.certifications && profile.certifications.length > 0 ? `
                            <div class="profile-skills">
                                <div class="profile-skills-title">Certifications</div>
                                <div class="skill-tags">
                                    ${profile.certifications.map(cert => `<span class="cert-tag">${escapeHtml(cert)}</span>`).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="profile-actions">
                            <button class="btn-profile btn-edit-profile" data-employee-id="${emp.id}">
                                ✏️ Edit Profile
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Add click handlers to edit buttons
            document.querySelectorAll('.btn-edit-profile').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const employeeId = parseInt(btn.dataset.employeeId);
                    openProfileModal(employeeId);
                });
            });

        } catch (error) {
            console.error('Error loading profiles:', error);
            grid.innerHTML = '<div class="no-data-message">Error loading profiles. Please try again.</div>';
        }
    }

    function openProfileModal(employeeId) {
        currentEmployeeId = employeeId;
        const employee = employees.find(e => e.id === employeeId);
        const profile = profiles?.find(p => p.employee_id === employeeId) || {};

        // Populate form
        document.getElementById('profileEmployeeName').value = employee.name;
        document.getElementById('profileRole').value = employee.role;
        document.getElementById('profilePhone').value = profile.phone || '';
        document.getElementById('profileEmail').value = profile.email || '';
        document.getElementById('profileHireDate').value = profile.hire_date || '';
        document.getElementById('profileSkills').value = profile.skills ? profile.skills.join(', ') : '';
        document.getElementById('profileCertifications').value = profile.certifications ? profile.certifications.join(', ') : '';
        document.getElementById('profileNotes').value = profile.notes || '';

        profileModal.style.display = 'block';
    }

    // Save profile
    profileForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const profileData = {
            phone: document.getElementById('profilePhone').value.trim() || null,
            email: document.getElementById('profileEmail').value.trim() || null,
            hire_date: document.getElementById('profileHireDate').value || null,
            skills: document.getElementById('profileSkills').value
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0),
            certifications: document.getElementById('profileCertifications').value
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0),
            notes: document.getElementById('profileNotes').value.trim() || null
        };

        try {
            const result = await supabaseService.createOrUpdateEmployeeProfile(currentEmployeeId, profileData);
            
            if (result) {
                alert('✅ Profile saved successfully!');
                profileModal.style.display = 'none';
                await loadProfiles();
            } else {
                alert('❌ Failed to save profile. Please try again.');
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('❌ Error saving profile. Please try again.');
        }
    });

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initial load
    await loadProfiles();
});

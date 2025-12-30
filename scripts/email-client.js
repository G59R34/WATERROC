// Email Client Script
document.addEventListener('DOMContentLoaded', async function() {
    let currentFolder = 'inbox';
    let currentEmail = null;
    let users = [];
    
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (!userRole) {
        window.location.href = 'index.html';
        return;
    }
    
    // Load users for compose dropdown
    async function loadUsers() {
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            users = await supabaseService.getAllUsers() || [];
            updateComposeToDropdown();
        }
    }
    
    function updateComposeToDropdown() {
        const select = document.getElementById('composeTo');
        if (!select) return;
        
        const currentUser = supabaseService.currentUser;
        const otherUsers = users.filter(u => u.id !== currentUser?.id);
        
        select.innerHTML = '<option value="">Select recipient...</option>' +
            otherUsers.map(user => 
                `<option value="${user.id}">${user.full_name || user.username} (${user.email})</option>`
            ).join('');
    }
    
    // Load emails
    async function loadEmails(folder) {
        const list = document.getElementById('emailList');
        if (!list) return;
        
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('email data');
        }
        
        let emails = [];
        
        if (folder === 'inbox') {
            emails = await supabaseService.getInboxEmails(50);
            // Update badge
            const unreadCount = emails.filter(e => !e.is_read).length;
            document.getElementById('inboxBadge').textContent = unreadCount;
        } else if (folder === 'sent') {
            emails = await supabaseService.getSentEmails(50);
        }
        
        if (emails.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 40px; color: #64748b;">No emails</div>';
            return;
        }
        
        list.innerHTML = emails.map(email => {
            const fromUser = email.from_user || {};
            const toUser = email.to_user || {};
            const date = new Date(email.sent_at).toLocaleDateString();
            const unreadClass = !email.is_read ? 'unread' : '';
            const starClass = email.is_starred ? 'starred' : '';
            
            return `
                <div class="email-item ${unreadClass}" data-email-id="${email.id}">
                    <span class="email-item-star ${starClass}" data-email-id="${email.id}">${email.is_starred ? '⭐' : '☆'}</span>
                    <div class="email-sender">${fromUser.full_name || fromUser.username || 'Unknown'}</div>
                    <div class="email-subject">${email.subject || '(No Subject)'}</div>
                    <div class="email-date">${date}</div>
                </div>
            `;
        }).join('');
        
        // Add click listeners
        document.querySelectorAll('.email-item').forEach(item => {
            item.addEventListener('click', function(e) {
                if (e.target.classList.contains('email-item-star')) return;
                const emailId = parseInt(this.getAttribute('data-email-id'));
                viewEmail(emailId);
            });
        });
    }
    
    // View email
    async function viewEmail(emailId) {
        const emails = currentFolder === 'inbox' 
            ? await supabaseService.getInboxEmails(50)
            : await supabaseService.getSentEmails(50);
        
        currentEmail = emails.find(e => e.id === emailId);
        
        if (!currentEmail) return;
        
        // Mark as read if inbox
        if (currentFolder === 'inbox' && !currentEmail.is_read) {
            await supabaseService.markEmailAsRead(emailId);
        }
        
        // Show email view
        document.getElementById('emailListView').style.display = 'none';
        document.getElementById('emailView').classList.add('active');
        
        const fromUser = currentEmail.from_user || {};
        const toUser = currentEmail.to_user || {};
        const date = new Date(currentEmail.sent_at).toLocaleString();
        
        document.getElementById('emailViewSubject').textContent = currentEmail.subject || '(No Subject)';
        document.getElementById('emailViewFrom').textContent = `${fromUser.full_name || fromUser.username || 'Unknown'} (${fromUser.email || ''})`;
        document.getElementById('emailViewTo').textContent = `${toUser.full_name || toUser.username || 'Unknown'} (${toUser.email || ''})`;
        document.getElementById('emailViewDate').textContent = date;
        document.getElementById('emailViewBody').textContent = currentEmail.body || '';
        
        // Reload emails to update read status
        await loadEmails(currentFolder);
    }
    
    // Folder switching
    document.querySelectorAll('.email-folder').forEach(folder => {
        folder.addEventListener('click', function() {
            document.querySelectorAll('.email-folder').forEach(f => f.classList.remove('active'));
            this.classList.add('active');
            currentFolder = this.getAttribute('data-folder');
            document.getElementById('emailView').classList.remove('active');
            document.getElementById('emailListView').style.display = 'block';
            loadEmails(currentFolder);
        });
    });
    
    // Compose email
    const composeModal = document.getElementById('composeModal');
    const composeBtn = document.getElementById('composeBtn');
    const closeComposeModal = document.getElementById('closeComposeModal');
    const cancelComposeBtn = document.getElementById('cancelComposeBtn');
    const composeForm = document.getElementById('composeForm');
    
    composeBtn.addEventListener('click', () => {
        composeModal.style.display = 'block';
    });
    
    closeComposeModal.addEventListener('click', () => {
        composeModal.style.display = 'none';
    });
    
    cancelComposeBtn.addEventListener('click', () => {
        composeModal.style.display = 'none';
    });
    
    composeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (typeof showFormLoadingScreen !== 'undefined') {
            showFormLoadingScreen('sending email');
        }
        
        const toUserId = document.getElementById('composeTo').value;
        const subject = document.getElementById('composeSubject').value;
        const body = document.getElementById('composeBody').value;
        
        const result = await supabaseService.sendEmail(toUserId, subject, body);
        
        if (result.error) {
            alert(`❌ Failed to send email: ${result.error}`);
        } else {
            alert('✅ Email sent successfully!');
            composeModal.style.display = 'none';
            composeForm.reset();
            await loadEmails('sent');
        }
    });
    
    // Reply
    document.getElementById('replyBtn').addEventListener('click', () => {
        if (!currentEmail) return;
        
        const fromUser = currentEmail.from_user || {};
        document.getElementById('composeTo').value = fromUser.id || '';
        document.getElementById('composeSubject').value = `Re: ${currentEmail.subject || ''}`;
        document.getElementById('composeBody').value = `\n\n--- Original Message ---\n${currentEmail.body || ''}`;
        composeModal.style.display = 'block';
    });
    
    // Delete email
    document.getElementById('deleteEmailBtn').addEventListener('click', async () => {
        if (!currentEmail) return;
        
        if (!confirm('Delete this email?')) return;
        
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('deleting email');
        }
        
        const result = await supabaseService.deleteEmail(currentEmail.id);
        
        if (result.error) {
            alert(`❌ Failed to delete email: ${result.error}`);
        } else {
            alert('✅ Email deleted');
            document.getElementById('emailView').classList.remove('active');
            document.getElementById('emailListView').style.display = 'block';
            await loadEmails(currentFolder);
        }
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async function() {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('logout');
        }
        
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
    
    // Initialize
    await loadUsers();
    await loadEmails('inbox');
    
    // Auto-refresh emails every 10 seconds
    setInterval(async () => {
        await loadEmails(currentFolder);
    }, 10000);
});








// Company-Wide Chat System
// ========================

class CompanyChat {
    constructor() {
        this.isOpen = false;
        this.messages = [];
        this.subscription = null;
        this.currentUser = null;
        this.isAdmin = false;
        this.chatContainer = null;
        this.chatPanel = null;
        this.messageInput = null;
        this.messagesContainer = null;
        this.unreadCount = 0;
    }

    async init() {
        // Wait for Supabase to be ready
        if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
            console.log('Waiting for Supabase to initialize chat...');
            setTimeout(() => this.init(), 500);
            return;
        }

        // Get current user
        await supabaseService.loadCurrentUser();
        this.currentUser = await supabaseService.getCurrentUser();

        if (!this.currentUser) {
            console.error('Cannot initialize chat: no user found');
            return;
        }

        // Check if user is admin
        this.isAdmin = await supabaseService.isAdmin();

        // Create chat UI
        this.createChatUI();
        
        // Show/hide admin controls after UI is created
        if (this.clearChatBtn) {
            this.clearChatBtn.style.display = this.isAdmin ? 'block' : 'none';
        }
        
        // Load initial messages
        await this.loadMessages();
        
        // Subscribe to real-time updates
        this.subscribeToMessages();
        
        console.log('✅ Company chat initialized');
    }

    createChatUI() {
        // Create floating chat button
        const chatButton = document.createElement('button');
        chatButton.id = 'companyChatBtn';
        chatButton.innerHTML = '<span style="font-size: 18px; margin-right: 6px;">💬</span>Company Chat';
        chatButton.className = 'company-chat-btn';
        chatButton.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 90px;
            z-index: 99998;
            padding: 14px 20px;
            border: none;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 160px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white;
        `;
        
        chatButton.addEventListener('mouseenter', () => {
            chatButton.style.transform = 'translateY(-2px)';
            chatButton.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
        });
        
        chatButton.addEventListener('mouseleave', () => {
            chatButton.style.transform = 'translateY(0)';
            chatButton.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
        });

        chatButton.addEventListener('click', () => this.toggleChat());
        document.body.appendChild(chatButton);

        // Create chat panel
        this.chatPanel = document.createElement('div');
        this.chatPanel.id = 'companyChatPanel';
        this.chatPanel.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 160px;
            width: 400px;
            height: 600px;
            max-height: calc(100vh - 180px);
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            z-index: 99997;
            display: none;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            border: 1px solid #e2e8f0;
        `;

        // Chat header
        const chatHeader = document.createElement('div');
        chatHeader.style.cssText = `
            padding: 20px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white;
            border-radius: 16px 16px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        
        const headerTitle = document.createElement('h3');
        headerTitle.textContent = '💬 Company Chat';
        headerTitle.style.cssText = 'margin: 0; font-size: 1.25rem; font-weight: 700;';
        
        const headerActions = document.createElement('div');
        headerActions.style.cssText = 'display: flex; gap: 8px; align-items: center;';
        
        // Add Clear Chat button for admins (will be shown/hidden based on admin status)
        const clearChatBtn = document.createElement('button');
        clearChatBtn.id = 'clearChatBtn';
        clearChatBtn.innerHTML = '🗑️ Clear';
        clearChatBtn.title = 'Clear all messages (Admin only)';
        clearChatBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.875rem;
            font-weight: 600;
            transition: all 0.2s;
            display: none;
        `;
        clearChatBtn.addEventListener('mouseenter', () => {
            clearChatBtn.style.background = 'rgba(255, 255, 255, 0.3)';
        });
        clearChatBtn.addEventListener('mouseleave', () => {
            clearChatBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        });
        clearChatBtn.addEventListener('click', () => this.clearChat());
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1.25rem;
            transition: all 0.2s;
        `;
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
        });
        closeBtn.addEventListener('click', () => this.toggleChat());
        
        headerActions.appendChild(clearChatBtn);
        headerActions.appendChild(closeBtn);
        chatHeader.appendChild(headerTitle);
        chatHeader.appendChild(headerActions);
        this.chatPanel.appendChild(chatHeader);
        
        // Store reference to clear button
        this.clearChatBtn = clearChatBtn;

        // Messages container
        this.messagesContainer = document.createElement('div');
        this.messagesContainer.id = 'companyChatMessages';
        this.messagesContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #f8fafc;
        `;
        this.chatPanel.appendChild(this.messagesContainer);

        // Input area
        const inputArea = document.createElement('div');
        inputArea.style.cssText = `
            padding: 16px;
            background: white;
            border-top: 1px solid #e2e8f0;
            border-radius: 0 0 16px 16px;
            display: flex;
            gap: 8px;
        `;

        this.messageInput = document.createElement('textarea');
        this.messageInput.placeholder = 'Type a message...';
        this.messageInput.style.cssText = `
            flex: 1;
            padding: 12px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 14px;
            font-family: inherit;
            resize: none;
            min-height: 44px;
            max-height: 120px;
        `;
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        const sendBtn = document.createElement('button');
        sendBtn.textContent = 'Send';
        sendBtn.style.cssText = `
            padding: 12px 24px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        `;
        sendBtn.addEventListener('mouseenter', () => {
            sendBtn.style.transform = 'translateY(-1px)';
            sendBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
        });
        sendBtn.addEventListener('click', () => this.sendMessage());

        inputArea.appendChild(this.messageInput);
        inputArea.appendChild(sendBtn);
        this.chatPanel.appendChild(inputArea);

        document.body.appendChild(this.chatPanel);
        this.chatContainer = this.chatPanel;
    }

    async loadMessages() {
        if (!supabaseService || !supabaseService.isReady()) return;

        this.messages = await supabaseService.getCompanyChatMessages(100) || [];
        this.renderMessages();
    }

    renderMessages() {
        if (!this.messagesContainer) return;

        if (this.messages.length === 0) {
            this.messagesContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #64748b;">
                    <div style="font-size: 3rem; margin-bottom: 16px;">💬</div>
                    <p style="font-size: 1rem; margin: 0;">No messages yet. Start the conversation!</p>
                </div>
            `;
            return;
        }

        this.messagesContainer.innerHTML = this.messages.map(msg => {
            const isOwnMessage = msg.user_id === this.currentUser.id;
            const userName = msg.user?.full_name || msg.user?.username || 'Unknown';
            const msgUserIsAdmin = msg.user?.is_admin || false;
            const time = new Date(msg.created_at).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            // Show actions if user owns message OR if current user is admin
            const showActions = isOwnMessage || this.isAdmin;

            return `
                <div class="chat-message ${isOwnMessage ? 'own-message' : ''}" data-message-id="${msg.id}">
                    <div class="chat-message-header">
                        <span class="chat-message-author">${msgUserIsAdmin ? '👨‍💼 ' : '👤 '}${userName}</span>
                        <span class="chat-message-time">${time}</span>
                    </div>
                    <div class="chat-message-content">${this.escapeHtml(msg.message)}</div>
                    ${showActions ? `
                        <div class="chat-message-actions">
                            ${isOwnMessage ? `<button class="chat-edit-btn" onclick="companyChat.editMessage(${msg.id})">Edit</button>` : ''}
                            <button class="chat-delete-btn" onclick="companyChat.deleteMessage(${msg.id})" title="${this.isAdmin && !isOwnMessage ? 'Delete message (Admin)' : 'Delete message'}">Delete</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Scroll to bottom
        this.scrollToBottom();
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        if (!supabaseService || !supabaseService.isReady()) {
            alert('Chat is not available. Please check your connection.');
            return;
        }

        // Disable input while sending
        this.messageInput.disabled = true;
        const sendBtn = this.messageInput.nextElementSibling;
        const originalText = sendBtn.textContent;
        sendBtn.textContent = 'Sending...';
        sendBtn.disabled = true;

        try {
            console.log('Sending message:', message);
            const result = await supabaseService.sendCompanyChatMessage(message);
            console.log('Send result:', result);

            // Re-enable input
            this.messageInput.disabled = false;
            sendBtn.disabled = false;
            sendBtn.textContent = originalText;

            if (result) {
                this.messageInput.value = '';
                // Add message immediately to UI if subscription hasn't caught it yet
                if (!this.messages.find(m => m.id === result.id)) {
                    this.messages.push(result);
                    this.renderMessages();
                }
            } else {
                alert('Failed to send message. Please check the console for errors.');
            }
        } catch (error) {
            console.error('Error in sendMessage:', error);
            alert('Error sending message: ' + (error.message || 'Unknown error'));
            
            // Re-enable input
            this.messageInput.disabled = false;
            sendBtn.disabled = false;
            sendBtn.textContent = originalText;
        }
    }

    async editMessage(messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message) return;

        const newMessage = prompt('Edit your message:', message.message);
        if (!newMessage || newMessage.trim() === message.message) return;

        const result = await supabaseService.updateCompanyChatMessage(messageId, newMessage.trim());
        if (result) {
            // Update local message
            const index = this.messages.findIndex(m => m.id === messageId);
            if (index !== -1) {
                this.messages[index] = result;
                this.renderMessages();
            }
        } else {
            alert('Failed to update message. Please try again.');
        }
    }

    async deleteMessage(messageId) {
        const message = this.messages.find(m => m.id === messageId);
        const isOwnMessage = message && message.user_id === this.currentUser.id;
        
        const confirmText = this.isAdmin && !isOwnMessage 
            ? 'Are you sure you want to delete this message? (Admin action)'
            : 'Are you sure you want to delete this message?';
        
        if (!confirm(confirmText)) return;

        const result = await supabaseService.deleteCompanyChatMessage(messageId);
        if (result) {
            // Remove from local messages
            this.messages = this.messages.filter(m => m.id !== messageId);
            this.renderMessages();
        } else {
            alert('Failed to delete message. ' + (this.isAdmin ? 'Please try again.' : 'You can only delete your own messages.'));
        }
    }

    async clearChat() {
        if (!this.isAdmin) {
            alert('Only admins can clear the chat.');
            return;
        }

        if (!confirm('Are you sure you want to clear ALL messages? This action cannot be undone.')) {
            return;
        }

        if (!confirm('This will delete ALL messages in the company chat. Are you absolutely sure?')) {
            return;
        }

        const result = await supabaseService.clearCompanyChat();
        if (result) {
            // Clear local messages
            this.messages = [];
            this.renderMessages();
            alert('Chat cleared successfully.');
        } else {
            alert('Failed to clear chat. Please try again.');
        }
    }

    subscribeToMessages() {
        if (!supabaseService || !supabaseService.isReady()) return;

        this.subscription = supabaseService.subscribeToCompanyChat((newMessage) => {
            // Check if message already exists (avoid duplicates)
            if (!this.messages.find(m => m.id === newMessage.id)) {
                this.messages.push(newMessage);
                this.renderMessages();
                
                // Show notification if chat is closed
                if (!this.isOpen) {
                    this.unreadCount++;
                    this.updateUnreadBadge();
                }
            }
        });
    }

    updateUnreadBadge() {
        const chatBtn = document.getElementById('companyChatBtn');
        if (!chatBtn) return;

        if (this.unreadCount > 0) {
            let badge = chatBtn.querySelector('.chat-unread-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'chat-unread-badge';
                badge.style.cssText = `
                    position: absolute;
                    top: -6px;
                    right: -6px;
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    color: white;
                    font-size: 0.75rem;
                    font-weight: 700;
                    padding: 3px 7px;
                    border-radius: 12px;
                    min-width: 20px;
                    text-align: center;
                    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.5);
                `;
                chatBtn.appendChild(badge);
            }
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            badge.style.display = 'block';
        } else {
            const badge = chatBtn.querySelector('.chat-unread-badge');
            if (badge) badge.style.display = 'none';
        }
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        
        if (this.chatPanel) {
            this.chatPanel.style.display = this.isOpen ? 'flex' : 'none';
        }

        if (this.isOpen) {
            this.unreadCount = 0;
            this.updateUnreadBadge();
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        if (this.subscription) {
            this.subscription();
            this.subscription = null;
        }
    }
}

// Global instance
let companyChat = null;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    companyChat = new CompanyChat();
    companyChat.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (companyChat) {
        companyChat.destroy();
    }
});


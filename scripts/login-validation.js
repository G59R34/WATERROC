// LOGIC: Form validation on login - enhanced validation with real-time feedback
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const emailInput = document.getElementById('email');
    const fullNameInput = document.getElementById('fullName');
    const passwordHint = document.getElementById('passwordHint');
    const usernameError = document.getElementById('usernameError');
    const passwordError = document.getElementById('passwordError');
    const emailError = document.getElementById('emailError');
    const fullNameError = document.getElementById('fullNameError');
    
    if (!loginForm) return;
    
    // SLOWER: Real-time username validation with delay
    if (usernameInput) {
        let usernameTimeout;
        usernameInput.addEventListener('blur', function() {
            clearTimeout(usernameTimeout);
            // PURPOSELY SUPER SLOW: Much longer delay for validation
            usernameTimeout = setTimeout(() => {
                const value = this.value.trim();
                if (value.length === 0) {
                    showFieldError(usernameError, 'Username is required');
                    this.style.borderColor = '#ef4444';
                } else if (value.length < 3) {
                    showFieldError(usernameError, 'Username must be at least 3 characters');
                    this.style.borderColor = '#f59e0b';
                } else {
                    clearFieldError(usernameError);
                    this.style.borderColor = '#999999';
                }
            }, 1000);
        });
        
        usernameInput.addEventListener('input', function() {
            if (this.value.trim().length > 0) {
                clearFieldError(usernameError);
                this.style.borderColor = '#999999';
            }
        });
    }
    
    // SLOWER: Real-time password validation with delay
    if (passwordInput) {
        let passwordTimeout;
        passwordInput.addEventListener('input', function() {
            clearTimeout(passwordTimeout);
            // PURPOSELY SUPER SLOW: Much longer delay for validation
            passwordTimeout = setTimeout(() => {
                const value = this.value;
                if (value.length > 0 && value.length < 6) {
                    if (passwordHint) {
                        passwordHint.style.display = 'block';
                        passwordHint.style.color = '#f59e0b';
                    }
                    this.style.borderColor = '#f59e0b';
                } else if (value.length >= 6) {
                    if (passwordHint) {
                        passwordHint.style.display = 'none';
                    }
                    this.style.borderColor = '#999999';
                } else {
                    if (passwordHint) {
                        passwordHint.style.display = 'none';
                    }
                    this.style.borderColor = '#999999';
                }
            }, 1200);
        });
        
        passwordInput.addEventListener('blur', function() {
            const value = this.value;
            if (value.length === 0) {
                showFieldError(passwordError, 'Password is required');
                this.style.borderColor = '#ef4444';
            } else if (value.length < 6) {
                showFieldError(passwordError, 'Password must be at least 6 characters');
                this.style.borderColor = '#f59e0b';
            } else {
                clearFieldError(passwordError);
                this.style.borderColor = '#999999';
            }
        });
    }
    
    // Email validation
    if (emailInput) {
        emailInput.addEventListener('blur', function() {
            if (this.style.display !== 'none' && this.value.trim()) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(this.value)) {
                    showFieldError(emailError, 'Please enter a valid email address');
                    this.style.borderColor = '#ef4444';
                } else {
                    clearFieldError(emailError);
                    this.style.borderColor = '#999999';
                }
            }
        });
    }
    
    // Full name validation
    if (fullNameInput) {
        fullNameInput.addEventListener('blur', function() {
            if (this.style.display !== 'none' && this.value.trim()) {
                if (this.value.trim().length < 2) {
                    showFieldError(fullNameError, 'Full name must be at least 2 characters');
                    this.style.borderColor = '#ef4444';
                } else {
                    clearFieldError(fullNameError);
                    this.style.borderColor = '#999999';
                }
            }
        });
    }
    
    // Form submission validation
    loginForm.addEventListener('submit', function(e) {
        let isValid = true;
        
        // Validate username
        if (usernameInput && usernameInput.value.trim().length === 0) {
            showFieldError(usernameError, 'Username is required');
            usernameInput.style.borderColor = '#ef4444';
            isValid = false;
        }
        
        // Validate password
        if (passwordInput && passwordInput.value.length === 0) {
            showFieldError(passwordError, 'Password is required');
            passwordInput.style.borderColor = '#ef4444';
            isValid = false;
        } else if (passwordInput && passwordInput.value.length < 6) {
            showFieldError(passwordError, 'Password must be at least 6 characters');
            passwordInput.style.borderColor = '#ef4444';
            isValid = false;
        }
        
        // Validate email if in signup mode
        if (emailInput && emailInput.style.display !== 'none' && emailInput.required) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailInput.value.trim())) {
                showFieldError(emailError, 'Please enter a valid email address');
                emailInput.style.borderColor = '#ef4444';
                isValid = false;
            }
        }
        
        // Validate full name if in signup mode
        if (fullNameInput && fullNameInput.style.display !== 'none' && fullNameInput.required) {
            if (fullNameInput.value.trim().length < 2) {
                showFieldError(fullNameError, 'Full name must be at least 2 characters');
                fullNameInput.style.borderColor = '#ef4444';
                isValid = false;
            }
        }
        
        if (!isValid) {
            e.preventDefault();
            showErrorMessage('Please fix the errors above before submitting');
        }
    });
    
    function showFieldError(errorElement, message) {
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            errorElement.style.color = '#ef4444';
        }
    }
    
    function clearFieldError(errorElement) {
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }
    }
    
    function showErrorMessage(message) {
        const errorMsg = document.getElementById('errorMessage');
        if (errorMsg) {
            errorMsg.textContent = message;
            errorMsg.style.display = 'block';
            setTimeout(() => {
                errorMsg.style.display = 'none';
            }, 5000);
        }
    }
    
    // Forgot password handler
    const forgotPassword = document.getElementById('forgotPassword');
    if (forgotPassword) {
        forgotPassword.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Password reset functionality coming soon. Please contact your administrator.');
        });
    }
});


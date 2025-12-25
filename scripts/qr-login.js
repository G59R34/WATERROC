// FULL OVERHAUL: QR code login handler - square modal, parse JSON from QR
document.addEventListener('DOMContentLoaded', function() {
    const scanQRBtn = document.getElementById('scanQRBtn');
    const qrModal = document.getElementById('qrModal');
    const qrModalClose = document.getElementById('qrModalClose');
    const qrReader = document.getElementById('qr-reader');
    let scanner = null;
    
    if (!scanQRBtn || !qrModal) return;
    
    // Open QR modal
    scanQRBtn.addEventListener('click', function() {
        qrModal.style.display = 'flex';
        startQRScanner();
    });
    
    // Close QR modal
    qrModalClose.addEventListener('click', function() {
        stopQRScanner();
        qrModal.style.display = 'none';
    });
    
    // Close on outside click
    qrModal.addEventListener('click', function(e) {
        if (e.target === qrModal) {
            stopQRScanner();
            qrModal.style.display = 'none';
        }
    });
    
    function startQRScanner() {
        if (scanner) return;
        
        // Clear previous scanner
        qrReader.innerHTML = '';
        
        try {
            scanner = new Html5QrcodeScanner(
                "qr-reader",
                {
                    fps: 10,
                    qrbox: { width: 400, height: 400 }
                },
                false
            );
            
            scanner.render(
                function(decodedText, decodedResult) {
                    // LOGIC: QR parse logic - assume QR JSON {user: "", pass: "", org: ""}, auto-login
                    const qrStatus = document.getElementById('qrStatus');
                    
                    try {
                        const qrData = JSON.parse(decodedText);
                        
                        // Support multiple JSON formats
                        const username = qrData.username || qrData.user || qrData.employeeId;
                        const password = qrData.password || qrData.pass;
                        const role = qrData.role || 'employee';
                        const org = qrData.organization || qrData.org;
                        
                        if (qrStatus) {
                            qrStatus.textContent = 'QR code scanned successfully!';
                            qrStatus.style.color = '#10b981';
                            qrStatus.style.display = 'block';
                        }
                        
                        // Auto-fill form
                        const usernameInput = document.getElementById('username');
                        const passwordInput = document.getElementById('password');
                        const roleSelect = document.getElementById('role');
                        
                        if (usernameInput && username) {
                            usernameInput.value = username;
                            usernameInput.dispatchEvent(new Event('input'));
                        }
                        if (passwordInput && password) {
                            passwordInput.value = password;
                            passwordInput.dispatchEvent(new Event('input'));
                        }
                        if (roleSelect && role) {
                            roleSelect.value = role;
                        }
                        
                        // Stop scanner after short delay
                        setTimeout(() => {
                            stopQRScanner();
                            qrModal.style.display = 'none';
                            
                            // Auto-submit form
                            const loginForm = document.getElementById('loginForm');
                            if (loginForm) {
                                loginForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                            }
                        }, 500);
                    } catch (e) {
                        // If not JSON, try as plain text (username:password:role format)
                        const parts = decodedText.split(':');
                        if (parts.length >= 2) {
                            if (qrStatus) {
                                qrStatus.textContent = 'QR code scanned successfully!';
                                qrStatus.style.color = '#10b981';
                                qrStatus.style.display = 'block';
                            }
                            
                            const usernameInput = document.getElementById('username');
                            const passwordInput = document.getElementById('password');
                            const roleSelect = document.getElementById('role');
                            
                            if (usernameInput) {
                                usernameInput.value = parts[0];
                                usernameInput.dispatchEvent(new Event('input'));
                            }
                            if (passwordInput) {
                                passwordInput.value = parts[1];
                                passwordInput.dispatchEvent(new Event('input'));
                            }
                            if (roleSelect && parts[2]) roleSelect.value = parts[2];
                            
                            setTimeout(() => {
                                stopQRScanner();
                                qrModal.style.display = 'none';
                                
                                const loginForm = document.getElementById('loginForm');
                                if (loginForm) {
                                    loginForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                                }
                            }, 500);
                        } else {
                            if (qrStatus) {
                                qrStatus.textContent = 'Invalid QR code format';
                                qrStatus.style.color = '#ef4444';
                                qrStatus.style.display = 'block';
                            }
                            setTimeout(() => {
                                if (qrStatus) qrStatus.style.display = 'none';
                            }, 3000);
                        }
                    }
                },
                function(errorMessage) {
                    // Error callback - ignore for now
                }
            );
        } catch (error) {
            console.error('QR Scanner error:', error);
            qrReader.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">Error: ' + error.message + '<br>Please allow camera access and try again.</p>';
        }
    }
    
    function stopQRScanner() {
        if (scanner) {
            try {
                scanner.clear();
            } catch (e) {
                // Ignore cleanup errors
            }
            scanner = null;
        }
        qrReader.innerHTML = '';
    }
});


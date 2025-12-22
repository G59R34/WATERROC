// Quick test script for employee status monitoring
// Run this in browser console to test the system

async function testEmployeeStatusChange() {
    console.log('🧪 Starting Employee Status Test...');
    
    if (!window.supabaseService || !window.supabaseService.isReady()) {
        console.error('❌ Supabase not ready');
        return;
    }
    
    if (!window.employeeStatusMonitor) {
        console.error('❌ Employee Status Monitor not found');
        return;
    }
    
    const monitor = window.employeeStatusMonitor;
    const info = window.testEmployeeStatusMonitor.getInfo();
    
    console.log('📊 Monitor Info:', info);
    
    if (!info.currentEmployeeId) {
        console.error('❌ No current employee ID');
        return;
    }
    
    console.log('🔄 Step 1: Check current status');
    await window.testEmployeeStatusMonitor.checkStatus();
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔄 Step 2: Set status to terminated');
    const { error } = await window.supabaseService.client
        .from('employee_profiles')
        .upsert({
            employee_id: info.currentEmployeeId,
            employment_status: 'terminated',
            status_reason: 'Test termination for monitoring system',
            updated_at: new Date().toISOString()
        });
    
    if (error) {
        console.error('❌ Failed to update status:', error);
        return;
    }
    
    console.log('✅ Status updated to terminated');
    console.log('⏰ Waiting 10 seconds to see if logout triggers...');
    
    // Wait and see if the system reacts
    setTimeout(() => {
        console.log('🤔 Still here? The monitoring might not be working properly');
        console.log('🔄 Trying manual status check...');
        window.testEmployeeStatusMonitor.checkStatus();
    }, 10000);
}

// Run the test
console.log('🚀 Employee Status Test loaded. Call testEmployeeStatusChange() to run test.');

// Make it available globally
window.testEmployeeStatusChange = testEmployeeStatusChange;
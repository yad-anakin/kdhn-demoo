// import { firebaseConfig } from '../config/firebase.js';
import { getUserLimit, setUserLimit, getAllUserLimits } from '../utils/userLimits.js';
import { adminAuth, adminDb, mainDb, verifyAdminAccess, ADMIN_EMAIL } from './adminFirebase.js';

// Show/hide sections based on auth state
function updateUI(user) {
    const loginSection = document.getElementById('loginSection');
    const adminSection = document.getElementById('adminSection');
    const errorElement = document.getElementById('loginError');
    
    if (user && user.email === ADMIN_EMAIL) {
        loginSection.style.display = 'none';
        adminSection.style.display = 'block';
        document.getElementById('adminInfo').textContent = `Logged in as: ${user.email}`;
        loadUsers();
        errorElement.textContent = '';
    } else {
        loginSection.style.display = 'block';
        adminSection.style.display = 'none';
        if (user && user.email !== ADMIN_EMAIL) {
            errorElement.textContent = 'Unauthorized access';
            adminAuth.signOut();
        }
    }
}

// Handle admin login
async function handleLogin() {
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    const errorElement = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');
    
    try {
        loginBtn.disabled = true;
        errorElement.textContent = '';
        
        if (email !== ADMIN_EMAIL) {
            throw new Error('Unauthorized access');
        }
        
        // Store password temporarily for main project auth
        sessionStorage.setItem('adminPassword', password);
        
        // Sign in to admin app
        const adminCredential = await adminAuth.signInWithEmailAndPassword(email, password);

        // Also sign in to main app for data access
        const mainApp = firebase.app('main');
        const mainAuth = mainApp.auth();
        await mainAuth.signInWithEmailAndPassword(email, password);
        
    } catch (error) {
        sessionStorage.removeItem('adminPassword');
        let errorMessage = 'Invalid credentials or unauthorized access';
        
        switch (error.code) {
            case 'auth/wrong-password':
                errorMessage = 'Invalid password';
                break;
            case 'auth/user-not-found':
                errorMessage = 'Admin account not found';
                break;
            case 'auth/invalid-credential':
                errorMessage = 'Invalid credentials';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many attempts. Please try again later';
                break;
        }
        
        errorElement.textContent = errorMessage;
    } finally {
        loginBtn.disabled = false;
    }
}

// Add logout handler for both instances
async function handleLogout() {
    try {
        // Sign out from admin app
        await adminAuth.signOut();
        
        // Sign out from main app
        const mainApp = firebase.app('main');
        const mainAuth = mainApp.auth();
        await mainAuth.signOut();
        
        sessionStorage.removeItem('adminPassword');
        document.getElementById('adminPassword').value = '';
    } catch (error) {
        // Handle error silently
    }
}

// Load all users and their limits
async function loadUsers() {
    const userList = document.getElementById('userList');
    userList.innerHTML = '<div class="loading">Loading users...</div>';

    try {
        // Verify admin access
        const adminUser = await verifyAdminAccess();

        // Get all users from both collections to ensure we don't miss any
        const [usersSnapshot, limitsSnapshot, messageCountsSnapshot] = await Promise.all([
            mainDb.collection('users').get(),
            mainDb.collection('userLimits').get(),
            mainDb.collection('messageCounts').get()
        ]);

        // Process user limits
        const userLimits = {};
        limitsSnapshot.forEach(doc => {
            userLimits[doc.id] = doc.data().limit || 10;
        });

        // Process message counts
        const messageCounts = {};
        messageCountsSnapshot.forEach(doc => {
            messageCounts[doc.id] = doc.data().count || 0;
        });

        // Process users and combine data
        const users = new Map();

        // Add users from users collection
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.email && messageCounts[userData.email] > 0) { // Only add users with messages > 0
                users.set(userData.email, {
                    id: doc.id,
                    email: userData.email,
                    displayName: userData.displayName || '',
                    createdAt: userData.createdAt,
                    limit: userLimits[userData.email] || 10,
                    messageCount: messageCounts[userData.email] || 0
                });
            }
        });

        // Add any users that only exist in userLimits and have sent messages
        limitsSnapshot.forEach(doc => {
            const email = doc.id;
            if (!users.has(email) && messageCounts[email] > 0) { // Only add users with messages > 0
                users.set(email, {
                    id: 'unknown',
                    email: email,
                    displayName: 'Unknown',
                    createdAt: null,
                    limit: doc.data().limit || 10,
                    messageCount: messageCounts[email] || 0
                });
            }
        });

        const userArray = Array.from(users.values());

        if (userArray.length === 0) {
            userList.innerHTML = `
                <div class="no-users">
                    <p>No active users found.</p>
                    <small style="color: #666;">Only users who have sent messages will appear here.</small>
                </div>`;
            return;
        }

        // Sort users by message count (highest first), then by creation date
        userArray.sort((a, b) => {
            // First sort by message count (descending)
            if (b.messageCount !== a.messageCount) {
                return b.messageCount - a.messageCount;
            }
            // Then by creation date if message counts are equal
            const dateA = a.createdAt?.toDate() || new Date(0);
            const dateB = b.createdAt?.toDate() || new Date(0);
            return dateB - dateA;
        });

        // Display users
        userList.innerHTML = '';
        userArray.forEach(user => {
            const userElement = createUserElement(
                user.email, 
                user.limit, 
                user.displayName, 
                user.createdAt,
                user.messageCount
            );
            userList.appendChild(userElement);
        });

    } catch (error) {
        userList.innerHTML = `
            <div class="error-message">
                <p>Error loading users: ${error.message}</p>
                <button onclick="window.loadUsers()" class="retry-btn">
                    <i class="fas fa-sync"></i> Retry
                </button>
            </div>`;
    }
}

// Update the save button click handler in createUserElement
async function updateUserLimit(email, newLimit, message, saveBtn, currentLimitElement) {
    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        message.textContent = '';

        // Verify admin access
        const adminUser = await verifyAdminAccess();
        
        // Update limit in main database
        await mainDb.collection('userLimits').doc(email).set({
            limit: newLimit,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: adminUser.email
        });

        // Reset message count to 0 when limit is updated
        await mainDb.collection('messageCounts').doc(email).set({
            count: 0,
            lastResetTime: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        message.className = 'success-message';
        message.textContent = 'Limit updated and message count reset successfully';
        currentLimitElement.textContent = `Current limit: ${newLimit} messages/day`;
        
        // Update the message count display in the UI
        const messageCountElement = currentLimitElement.parentElement.querySelector('.user-message-count');
        if (messageCountElement) {
            messageCountElement.textContent = 'Messages sent today: 0';
        }
        
        setTimeout(() => {
            message.textContent = '';
        }, 3000);
    } catch (error) {
        message.className = 'error-message';
        message.textContent = error.code === 'permission-denied' 
            ? 'Permission denied. Please try logging in again.'
            : `Error updating limit: ${error.message}`;
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
    }
}

// Create user element with additional info
function createUserElement(email, currentLimit, displayName, createdAt, messageCount) {
    const div = document.createElement('div');
    div.className = 'user-item';
    
    const createdDate = createdAt?.toDate() 
        ? createdAt.toDate().toLocaleDateString() + ' ' + createdAt.toDate().toLocaleTimeString()
        : 'Unknown';
    
    div.innerHTML = `
        <div class="user-info">
            <div class="user-email">${email}</div>
            <div class="user-name">${displayName || 'No name'}</div>
            <div class="user-created">Created: ${createdDate}</div>
            <div class="user-stats">
                <div class="user-current-limit">Current limit: ${currentLimit} messages/day</div>
                <div class="user-message-count">Messages sent today: ${messageCount}</div>
            </div>
        </div>
        <div class="limit-controls">
            <input type="number" class="limit-input" value="${currentLimit}" min="1" max="100">
            <button class="save-btn">
                <i class="fas fa-save"></i> Save
            </button>
        </div>
        <div class="message"></div>
    `;

    const saveBtn = div.querySelector('.save-btn');
    const input = div.querySelector('.limit-input');
    const message = div.querySelector('.message');
    const currentLimitElement = div.querySelector('.user-current-limit');

    saveBtn.addEventListener('click', async () => {
        const newLimit = parseInt(input.value);
        if (newLimit < 1 || newLimit > 100) {
            message.className = 'error-message';
            message.textContent = 'Limit must be between 1 and 100';
            return;
        }

        await updateUserLimit(email, newLimit, message, saveBtn, currentLimitElement);
    });

    return div;
}

// Initialize the admin panel
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Set up admin auth state observer
        adminAuth.onAuthStateChanged((user) => {
            updateUI(user);
        });
        
        // Add login button handler
        document.getElementById('loginBtn').addEventListener('click', handleLogin);
        
        // Add logout button handler
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        
        // Add enter key handler for login
        document.getElementById('adminPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });
    } catch (error) {
        document.getElementById('loginError').textContent = 'Error initializing application. Please try again later.';
    }
});

// Make loadUsers available globally for the retry button
window.loadUsers = loadUsers; 
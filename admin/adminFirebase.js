import { adminFirebaseConfig, firebaseConfig } from '../config/config.js';

// Admin email constant
const ADMIN_EMAIL = 'yadvader88@gmail.com';

// Function to get or create Firebase app instance
function getFirebaseApp(name, config) {
    try {
        return firebase.app(name);
    } catch (e) {
        return firebase.initializeApp(config, name);
    }
}

// Initialize admin app
const adminApp = getFirebaseApp('admin', adminFirebaseConfig);

// Initialize main app for user data
const mainApp = getFirebaseApp('main', firebaseConfig);

// Initialize admin authentication and database
const adminAuth = adminApp.auth();
const adminDb = adminApp.firestore();

// Initialize main app database for user data
const mainAuth = mainApp.auth();
const mainDb = mainApp.firestore();

// Configure database settings for both instances
adminDb.settings({
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true
});

mainDb.settings({
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true
});

// Set persistence to SESSION for both auth instances
Promise.all([
    adminAuth.setPersistence(firebase.auth.Auth.Persistence.SESSION),
    mainAuth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
]).catch(() => {
    // Handle error silently
});

// Function to get custom claims
async function getCustomClaims(user) {
    const idTokenResult = await user.getIdTokenResult();
    return idTokenResult.claims;
}

// Function to verify admin status
async function verifyAdminAccess() {
    const adminUser = adminAuth.currentUser;
    const mainUser = mainAuth.currentUser;
    
    if (!adminUser || !mainUser || adminUser.email !== ADMIN_EMAIL || mainUser.email !== ADMIN_EMAIL) {
        throw new Error('Admin authentication required');
    }
    
    // Force token refresh to get latest claims
    await Promise.all([
        adminUser.getIdToken(true),
        mainUser.getIdToken(true)
    ]);
    
    const [adminClaims, mainClaims] = await Promise.all([
        getCustomClaims(adminUser),
        getCustomClaims(mainUser)
    ]);
    
    return adminUser;
}

// Function to check database access
async function testDatabaseAccess() {
    try {
        await verifyAdminAccess();
        const usersRef = adminDb.collection('users');
        const snapshot = await usersRef.get();
        return true;
    } catch (error) {
        return false;
    }
}

// Function to make loadUsers globally available for the retry button
window.loadUsers = async function() {
    const adminPanelModule = await import('./adminPanel.js');
    return adminPanelModule.loadUsers();
};

// Debug function
async function debugAdminAccess() {
    try {
        const user = adminAuth.currentUser;
        const claims = user ? await getCustomClaims(user) : null;
        return {
            isLoggedIn: !!user,
            email: user?.email,
            claims: claims,
            token: user ? await user.getIdToken() : null
        };
    } catch (error) {
        return { error: error.message };
    }
}

export { 
    adminApp, 
    adminAuth, 
    adminDb, 
    mainApp,
    mainAuth, 
    mainDb, 
    verifyAdminAccess, 
    testDatabaseAccess, 
    debugAdminAccess,
    ADMIN_EMAIL 
}; 
// Check if current path is admin route
function isAdminRoute() {
    return window.location.pathname.startsWith('/admin');
}

// Check if user is admin
function isAdmin(user) {
    console.log('Checking admin status:', user?.email);
    return user && user.email === 'yadvader88@gmail.com';
}

// Initialize route guard
export function initRouteGuard() {
    firebase.auth().onAuthStateChanged((user) => {
        console.log('Route guard auth state changed:', user?.email);
        if (isAdminRoute() && !isAdmin(user)) {
            console.log('Non-admin access attempted, redirecting');
            window.location.href = '/';
        }
    });
}

// Export admin check function
export function checkAdminAccess(user) {
    return isAdmin(user);
} 
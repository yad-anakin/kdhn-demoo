// Import Firebase
import { auth, db } from '../config/firebase.js';

const defaultLimit = 10;

// Get message limit for a user
export async function getUserLimit(username) {
    try {
        const doc = await db.collection('userLimits').doc(username).get();
        const limit = doc.exists ? doc.data().limit : defaultLimit;
        return limit;
    } catch (error) {
        return defaultLimit;
    }
}

// Set message limit for a user (admin only)
export async function setUserLimit(username, limit) {
    if (limit < 0) throw new Error('Limit cannot be negative');
    
    const user = auth.currentUser;
    if (!user || user.email !== 'yadvader88@gmail.com') {
        throw new Error('Unauthorized: Only admin can set user limits');
    }

    await db.collection('userLimits').doc(username).set({
        limit: limit,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.email
    });
}

// Reset user limit to default (admin only)
export async function resetUserLimit(username) {
    const user = auth.currentUser;
    if (!user || user.email !== 'yadvader88@gmail.com') {
        throw new Error('Unauthorized: Only admin can reset user limits');
    }

    await db.collection('userLimits').doc(username).delete();
}

// Get all user limits (admin only)
export async function getAllUserLimits() {
    const user = auth.currentUser;
    if (!user || user.email !== 'yadvader88@gmail.com') {
        throw new Error('Unauthorized: Only admin can get all user limits');
    }

    const snapshot = await db.collection('userLimits').get();
    return snapshot.docs.map(doc => ({
        username: doc.id,
        limit: doc.data().limit
    }));
}

// Get default limit
export function getDefaultLimit() {
    return defaultLimit;
} 
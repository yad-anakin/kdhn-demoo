import { getUserLimit } from './userLimits.js';
import { auth, db } from '../config/firebase.js';

// Get the current message count for a user
export async function getMessageCount(username) {
    try {
        const user = auth.currentUser;
        if (!user) return 0;

        const doc = await db.collection('messageCounts').doc(username).get();
        
        if (!doc.exists) {
            return 0;
        }

        const data = doc.data();
        const now = Date.now();
        const lastReset = data.lastResetTime?.toDate().getTime() || 0;
        
        // Reset counter if 24 hours have passed since last reset
        if (now - lastReset >= 24 * 60 * 60 * 1000) {
            await resetMessageCount(username);
            return 0;
        }
        
        return data.count || 0;
    } catch (error) {
        return 0;
    }
}

// Check if user has reached their message limit
export async function hasReachedLimit(username) {
    try {
        const [count, limit] = await Promise.all([
            getMessageCount(username),
            getUserLimit(username)
        ]);
        
        return count >= limit;
    } catch (error) {
        return true; // Fail safe: if there's an error, prevent sending
    }
}

// Get remaining messages for user
export async function getRemainingMessages(username) {
    try {
        const [count, limit] = await Promise.all([
            getMessageCount(username),
            getUserLimit(username)
        ]);
        
        // Calculate remaining messages
        const remaining = limit - count;
        return Math.max(0, remaining);
    } catch (error) {
        return 0;
    }
}

// Increment message count for a user
export async function incrementMessageCount(username) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');

        // First check if user has reached their limit
        const [count, limit] = await Promise.all([
            getMessageCount(username),
            getUserLimit(username)
        ]);

        // Strictly enforce the limit
        if (limit === 0 || count >= limit) {
            throw new Error('Message limit reached. Please try again in 24 hours.');
        }

        const newCount = count + 1;
        
        // Update the count in Firestore with server timestamp
        await db.collection('messageCounts').doc(username).set({
            count: newCount,
            lastUpdateTime: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // If this was the first message of the day, set the reset time
        if (count === 0) {
            await db.collection('messageCounts').doc(username).set({
                lastResetTime: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        return newCount;
    } catch (error) {
        throw error; // Propagate the error to prevent message sending
    }
}

// Reset message count for a user
export async function resetMessageCount(username) {
    try {
        const user = auth.currentUser;
        if (!user) return;

        await db.collection('messageCounts').doc(username).set({
            count: 0,
            lastResetTime: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        // Handle error silently
    }
}

// Get next reset time
export async function getNextResetTime(username) {
    try {
        const doc = await db.collection('messageCounts').doc(username).get();
        if (!doc.exists) return null;
        
        const data = doc.data();
        const lastReset = data.lastResetTime?.toDate() || new Date();
        const nextReset = new Date(lastReset.getTime() + (24 * 60 * 60 * 1000));
        return nextReset;
    } catch (error) {
        return null;
    }
} 
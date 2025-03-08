import { auth, db } from '../config/firebase.js';

class ChatService {
    constructor() {
        this.messageCache = new Map(); // Cache for messages by agent type
        this.pageSize = 20; // Number of messages to load per page
        this.lastMessageTimestamp = null; // Timestamp for pagination
        this.isLoading = false; // Loading state flag
        this.hasMoreMessages = true; // Flag to track if more messages exist
    }

    // Add a new message
    async addMessage(agentType, userMessage, aiResponse) {
        try {
            const user = auth.currentUser;
            if (!user) return;

            const timestamp = Date.now();
            const messageData = {
                userId: user.uid,
                userMessage,
                aiResponse,
                timestamp,
                agentType,
                userPhotoURL: user.photoURL || 'default-avatar.png',
                userName: user.displayName || 'User'
            };

            // Add to Firestore with timestamp as document ID
            await db.collection('chats')
                .doc(user.uid)
                .collection(agentType)
                .doc(timestamp.toString())
                .set(messageData);

            // Update cache
            if (!this.messageCache.has(agentType)) {
                this.messageCache.set(agentType, []);
            }
            this.messageCache.get(agentType).unshift(messageData);

            return messageData;
        } catch (error) {
            console.error('Error adding message:', error);
            throw error;
        }
    }

    // Get chat history
    async getChatHistory(agentType, loadMore = false) {
        try {
            const user = auth.currentUser;
            if (!user) return [];

            // Return cached messages if available and not loading more
            if (!loadMore && this.messageCache.has(agentType)) {
                return this.messageCache.get(agentType);
            }

            if (this.isLoading) return [];
            this.isLoading = true;

            let query = db.collection('chats')
                .doc(user.uid)
                .collection(agentType)
                .orderBy('timestamp', 'desc')
                .limit(this.pageSize);

            if (loadMore && this.lastMessageTimestamp) {
                query = query.startAfter(this.lastMessageTimestamp);
            }

            const snapshot = await query.get();
            
            // Update pagination state
            this.hasMoreMessages = !snapshot.empty && snapshot.docs.length === this.pageSize;
            if (!snapshot.empty) {
                this.lastMessageTimestamp = snapshot.docs[snapshot.docs.length - 1].data().timestamp;
            }

            const messages = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id
            }));

            // Update cache
            if (!loadMore) {
                this.messageCache.set(agentType, messages);
            } else if (this.messageCache.has(agentType)) {
                this.messageCache.get(agentType).push(...messages);
            }

            this.isLoading = false;
            return messages;

        } catch (error) {
            console.error('Error getting chat history:', error);
            this.isLoading = false;
            throw error;
        }
    }

    // Delete chat history
    async deleteChatHistory(agentType) {
        try {
            const user = auth.currentUser;
            if (!user) return;

            const chatRef = db.collection('chats')
                .doc(user.uid)
                .collection(agentType);

            const snapshot = await chatRef.get();
            
            // Delete in batches
            const batchSize = 500;
            const batches = [];
            
            for (let i = 0; i < snapshot.docs.length; i += batchSize) {
                const batch = db.batch();
                snapshot.docs.slice(i, i + batchSize).forEach(doc => {
                    batch.delete(doc.ref);
                });
                batches.push(batch.commit());
            }

            await Promise.all(batches);

            // Clear cache
            this.messageCache.delete(agentType);
            this.lastMessageTimestamp = null;
            this.hasMoreMessages = true;

            console.log('Chat history deleted successfully');
        } catch (error) {
            console.error('Error deleting chat history:', error);
            throw error;
        }
    }

    clearCache() {
        this.messageCache.clear();
        this.lastMessageTimestamp = null;
        this.hasMoreMessages = true;
        this.isLoading = false;
    }

    hasMore() {
        return this.hasMoreMessages;
    }
}

export const chatService = new ChatService(); 
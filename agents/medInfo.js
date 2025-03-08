import OpenAIService from './openaiService.js';
import { SYSTEM_PROMPT } from '../prompts/medInfoPrompts.js';
import { getMessageCount, hasReachedLimit, getRemainingMessages } from '../utils/messageLimit.js';

// Create a separate instance for Med Info
const openaiService = new OpenAIService('med-info');

export async function handleMedInfoChat(message, isNewChat = false, username = 'guest') {
    try {
        // Check if user is authenticated
        if (username === 'guest') {
            throw new Error('Please sign in to use the Med Info assistant.');
        }

        // Check message limit
        if (await hasReachedLimit(username)) {
            throw new Error('Message limit reached. Please try again in 24 hours.');
        }

        // Check if message is a greeting
        const isGreeting = /^(hi|hello|hey|greetings|good (morning|afternoon|evening)|howdy)/i.test(message.trim());
        
        // Prepare conversation context
        const context = {
            isNewChat,
            isGreeting,
            username,
            agentType: 'med-info'
        };

        const response = await openaiService.sendMessage(message, SYSTEM_PROMPT, context);
        
        // Get remaining messages after the increment
        const remaining = await getRemainingMessages(username);
        
        // Add remaining messages info to response with styling
        const updatedResponse = `${response}\n\n<div style="color: #666; margin-top: 12px; display: flex; align-items: center; gap: 6px;"><i class="fas fa-message"></i>You have ${remaining} messages remaining today.</div>`;

        return updatedResponse;
    } catch (error) {
        throw error;
    }
}

export class MedInfoAgent {
    constructor() {
        this.openaiService = new OpenAIService('med-info');
        this.chatHistory = [];
    }

    async processMessage(message, username = 'guest') {
        try {
            // Check if user is authenticated
            if (username === 'guest') {
                throw new Error('Please sign in to use the Med Info assistant.');
            }

            // Check message limit
            const messageCount = await getMessageCount(username);
            if (messageCount >= 10) {
                throw new Error('Message limit reached. Please try again in 24 hours.');
            }

            const isGreeting = /^(hi|hello|hey|greetings|good (morning|afternoon|evening)|howdy)/i.test(message.trim());
            const context = {
                isNewChat: this.chatHistory.length === 0,
                isGreeting,
                username,
                agentType: 'med-info'
            };

            const response = await this.openaiService.sendMessage(message, SYSTEM_PROMPT, context, 'med-info');
            
            this.chatHistory.push(
                { role: 'user', content: message },
                { role: 'assistant', content: response }
            );
            return response;
        } catch (error) {
            throw error;
        }
    }
} 
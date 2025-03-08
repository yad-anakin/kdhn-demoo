import OpenAIService from './openaiService.js';

export class MedInfoAgent {
    constructor() {
        this.openaiService = new OpenAIService();
        this.chatHistory = [];
    }

    async processMessage(message) {
        try {
            const response = await this.openaiService.sendMessage(message);
            this.chatHistory.push(
                { role: 'user', content: message },
                { role: 'assistant', content: response }
            );
            return response;
        } catch (error) {
            console.error('Error in MedInfoAgent:', error);
            throw error;
        }
    }
}
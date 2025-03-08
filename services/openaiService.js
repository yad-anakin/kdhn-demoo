class OpenAIService {
    constructor(agentType = 'med-info') {
        this.baseURL = 'http://localhost:8000/chat';
        this.timeout = 30000; // 30 second timeout
        this.agentType = agentType; // Store agent type
    }

    async sendMessage(message, systemPrompt, context = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${this.baseURL}/${this.agentType}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message,
                    systemPrompt,
                    isNewChat: context.isNewChat || false,
                    isGreeting: context.isGreeting || false,
                    username: context.username || 'guest',
                    agentType: this.agentType // Include agent type in request
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error('Failed to get response from server');
            }

            const data = await response.json();
            return data.response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw error;
        }
    }
} 
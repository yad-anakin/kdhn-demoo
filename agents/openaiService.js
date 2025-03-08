import { config } from '../config/config.js';
import { SYSTEM_PROMPT as MED_INFO_PROMPT } from '../prompts/medInfoPrompts.js';
import { SYSTEM_PROMPT as MED_CALC_PROMPT } from '../prompts/medCalculatorPrompts.js';

class OpenAIService {
    constructor(type = 'med-info') {
        if (!config.DEEPSEEK_API_KEY) {
            throw new Error('DEEPSEEK_API_KEY is not set in config.js');
        }
        this.apiKey = config.DEEPSEEK_API_KEY;
        this.baseURL = 'https://api.deepseek.com';
        this.type = type;
    }

    async sendMessage(message) {
        try {
            const response = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        {
                            role: 'system',
                            content: this.type === 'med-info' ? MED_INFO_PROMPT : MED_CALC_PROMPT
                        },
                        { role: 'user', content: message }
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                throw new Error(`DeepSeek API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            throw error;
        }
    }
}

export default OpenAIService; 
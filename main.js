import { handleMedInfoChat } from './agents/medInfo.js';
import { handleMedCalculatorChat } from './agents/medCalculator.js';
import { chatService } from './services/chatService.js';
import { authService } from './services/authService.js';
import { showToast } from './utils/toast.js';
import { hasReachedLimit, getRemainingMessages, getNextResetTime, incrementMessageCount } from './utils/messageLimit.js';
import { db } from './config/firebase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Add Firebase persistence setup at the beginning
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            // Persistence set successfully
        })
        .catch((error) => {
            console.error('Error setting persistence:', error);
        });

    const userInput = document.getElementById('userInput');
    const sendButton = document.querySelector('.send-button');
    const chatMessages = document.querySelector('.chat-messages');
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const closeSidebarBtn = document.querySelector('.close-sidebar');
    const newChatBtn = document.querySelector('.new-chat');
    const modelItems = document.querySelectorAll('.model-item');
    const headerTitle = document.querySelector('.header-content h2');
    const headerSubtitle = document.querySelector('.header-content small');
    const chatContainer = document.querySelector('.chat-container');

    // Get the last active agent from localStorage or default to med-info
    let currentAgent = localStorage.getItem('currentAgent') || 'med-info';

    // Add isNewChat state variable at the top of your DOMContentLoaded callback
    let isNewChat = true;

    // Toggle sidebar for mobile
    menuToggle.addEventListener('click', () => {
        sidebar.classList.add('show');
    });

    closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.remove('show');
    });

    // Handle clicking outside sidebar to close it
    document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('show') && 
            !sidebar.contains(e.target) && 
            !menuToggle.contains(e.target)) {
            sidebar.classList.remove('show');
        }
    });

    // Function to update UI based on current agent
    function updateUIForAgent(agentElement) {
        // Update active state
        modelItems.forEach(mi => mi.classList.remove('active'));
        agentElement.classList.add('active');

        // Update current agent
        currentAgent = agentElement.dataset.agent;
        // Store current agent in localStorage
        localStorage.setItem('currentAgent', currentAgent);
        
        // Update container data attribute for styling
        chatContainer.dataset.currentAgent = currentAgent;

        // Update header content
        const title = agentElement.querySelector('.model-info span').textContent;
        const subtitle = agentElement.querySelector('.model-info small').textContent;
        headerTitle.textContent = title;
        headerSubtitle.textContent = subtitle;

        // Update welcome message
        chatMessages.innerHTML = getWelcomeMessage(title);
        
        // Update input placeholder
        const placeholder = currentAgent === 'med-calculator' 
            ? "Enter medical calculation query..."
            : "Ask about medical information...";
        userInput.placeholder = placeholder;

        // Load chat history for the selected agent
        loadChatHistory(currentAgent);
    }

    // Set initial UI state based on stored agent
    const initialAgent = document.querySelector(`.model-item[data-agent="${currentAgent}"]`);
    if (initialAgent) {
        updateUIForAgent(initialAgent);
    }

    // AI Agent switching
    modelItems.forEach(item => {
        item.addEventListener('click', () => {
            updateUIForAgent(item);
            // Close sidebar on mobile
            sidebar.classList.remove('show');
        });
    });

    // Update the new chat functionality
    newChatBtn.addEventListener('click', async () => {
        try {
            const activeModel = document.querySelector('.model-item.active');
            const currentAgent = activeModel.dataset.agent;
            
            // Show loading state
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'system-message';
            loadingDiv.innerHTML = `
                <div class="loading-dots">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
                <div style="margin-top: 8px;">Clearing chat history...</div>
            `;
            chatMessages.innerHTML = '';
            chatMessages.appendChild(loadingDiv);
            
            // Reset isNewChat flag
            isNewChat = true;
            
            // Delete chat history from database
            await chatService.deleteChatHistory(currentAgent);
            
            // Clear message cache
            chatService.clearCache();
            
            // Update UI with welcome message
            chatMessages.innerHTML = getWelcomeMessage(headerTitle.textContent);
            
            // Show success message
            const successDiv = document.createElement('div');
            successDiv.className = 'system-message';
            successDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-check-circle" style="color: #10B981;"></i>
                    <span>Started new chat</span>
                </div>
            `;
            chatMessages.appendChild(successDiv);
            setTimeout(() => successDiv.remove(), 2000);
                    
                } catch (error) {
            console.error('Error starting new chat:', error);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'system-message error';
            errorDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-exclamation-circle" style="color: #EF4444;"></i>
                    <span>Failed to start new chat</span>
                </div>
            `;
            chatMessages.appendChild(errorDiv);
            setTimeout(() => errorDiv.remove(), 2000);
        }
    });

    // Add this function near the top of your file
    function formatAIResponse(text) {
        // First, preserve code blocks and inline code
        const codeBlocks = [];
        text = text.replace(/```([\s\S]*?)```/g, (match) => {
            codeBlocks.push(match);
            return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
        });

        // Remove any system/prompt/capability revelations before formatting
        text = text.replace(/^(Format|Core|Standards|Remember|Steps|Capabilities|Identity|Process)[:].*/gm, '');
        text = text.replace(/^[-•]?\s*(Format|Core|Standards|Remember|Steps|Capabilities|Identity|Process)[:].*/gm, '');
        text = text.replace(/^#\s*(Format|Core|Standards|Remember|Steps|Capabilities|Identity|Process).*/gm, '');
        text = text.replace(/I am (designed|programmed|trained) to.*/g, '');
        text = text.replace(/My (capabilities|functions|purpose|prompt|rules|instructions) (include|are).*/g, '');
        text = text.replace(/I can help you with.*/g, '');
        text = text.replace(/Based on my (training|programming|design).*/g, '');
        text = text.replace(/As an AI (assistant|model|calculator).*/g, '');

        // Simple emoji formatting
        text = text
            .replace(/⚠️\s*(.*$)/gm, '⚠️ $1')
            .replace(/💡\s*(.*$)/gm, '💡 $1')
            .replace(/✅\s*(.*$)/gm, '✅ $1');

        // Headers - fixed numbering issue
        text = text
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>');

        // Lists
        text = text
            // Bullet points
            .replace(/^[\s]*[-•] (.*$)/gm, '<li>$1</li>')
            .replace(/(<li>[^<]*<\/li>\n?)+/g, '<ul>$&</ul>')
            // Numbered lists - preserve original numbers
            .replace(/^[\s]*(\d+)\. (.*$)/gm, '<li value="$1">$2</li>')
            .replace(/(<li value="\d+">[^<]*<\/li>\n?)+/g, '<ol>$&</ol>');

        // Bold and Italic
        text = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Tables
        text = text.replace(/\|(.+)\|/g, (match, content) => {
            const cells = content.split('|').map(cell => cell.trim());
            return `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
        });
        text = text.replace(/(<tr>.*<\/tr>)/gs, '<table>$1</table>');

        // Restore code blocks
        text = text.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
            const code = codeBlocks[index]
                .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
            return code;
        });

        // Inline code
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Horizontal rules
        text = text.replace(/^---$/gm, '<hr>');

        // Links
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, 
            '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // Clean up any remaining system-related content
        text = text.replace(/^(As a|I am) (medical|healthcare|AI|calculator|assistant).*/gm, '');
        text = text.replace(/^My role is to.*/gm, '');
        text = text.replace(/^I follow these.*/gm, '');

        // Paragraphs
        text = text.replace(/\n\n/g, '</p><p>');

        // Wrap in paragraph if not already wrapped
        if (!text.startsWith('<')) {
            text = '<p>' + text + '</p>';
        }

        return text;
    }

    // Handle message sending
    const sendMessage = async () => {
        const message = userInput.value.trim();
        if (!message) return;

        const user = firebase.auth().currentUser;
        if (!user) {
            showNotification({
                type: 'error',
                title: 'Authentication Required',
                message: 'Please sign in to continue.',
                duration: 4000
            });
            return;
        }

        try {
            // Get remaining messages from Firebase
            const remaining = await getRemainingMessages(user.email);
            
            // Strict check - if no messages remaining, prevent sending
            if (remaining <= 0) {
                const nextReset = await getNextResetTime(user.email);
                showNotification({
                    type: 'error',
                    title: 'Message Limit Reached',
                    message: `You've reached your daily message limit. Please try again in ${formatTimeUntilReset(nextReset)}.`,
                    duration: 6000
                });
                
                // Disable chat input
                userInput.value = '';
                userInput.disabled = true;
                userInput.placeholder = "Message limit reached";
                userInput.setAttribute('readonly', 'readonly');
                userInput.style.cursor = 'not-allowed';
                
                // Disable send button
                sendButton.disabled = true;
                sendButton.style.pointerEvents = 'none';
                return;
            }

            const userDiv = appendMessage('user', message);
            userInput.value = '';
            adjustTextareaHeight();

            const loadingDiv = appendMessage('assistant', 'Thinking...');
            
            try {
                // Increment message count BEFORE sending the message
                await incrementMessageCount(user.email);
                
                let response;
                if (currentAgent === 'med-info') {
                    response = await handleMedInfoChat(message, isNewChat, user.email);
                } else if (currentAgent === 'med-calculator') {
                    response = await handleMedCalculatorChat(message, isNewChat, user.email);
                }

                // After first message, it's no longer a new chat
                isNewChat = false;

                // Store chat in Firebase
                await chatService.addMessage(currentAgent, message, response);

                // Update loading div with response
                loadingDiv.innerHTML = `
                    <img src="alone-logo-w.png" alt="AI" class="message-avatar1">
                    <div class="message-text">${formatAIResponse(response)}</div>
                `;

                // Scroll to bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;

            } catch (error) {
                console.error('Error:', error);
                loadingDiv.innerHTML = `
                    <img src="alone-logo-w.png" alt="AI" class="message-avatar1">
                    <div class="message-text error">${error.message || 'Sorry, there was an error processing your request.'}</div>
                `;
            }
        } catch (error) {
            console.error('Error checking remaining messages:', error);
            showNotification({
                type: 'error',
                title: 'Error',
                message: error.message || 'Unable to verify message limit. Please try again.',
                duration: 4000
            });
        }
    };

    // Handle send button click and Enter key
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Adjust textarea height
    function adjustTextareaHeight() {
        userInput.style.height = 'auto';
        userInput.style.height = userInput.scrollHeight + 'px';
    }

    userInput.addEventListener('input', adjustTextareaHeight);

    // Add infinite scroll for chat messages
    let isLoadingMore = false;

    chatMessages.addEventListener('scroll', async () => {
        if (isLoadingMore) return;

        // Check if we're near the top
        if (chatMessages.scrollTop <= chatMessages.clientHeight && chatService.hasMore()) {
            isLoadingMore = true;
            
            try {
                const activeModel = document.querySelector('.model-item.active');
                if (!activeModel) return;

                const oldHeight = chatMessages.scrollHeight;
                const oldScroll = chatMessages.scrollTop;

                // Load more messages
                const messages = await chatService.getChatHistory(activeModel.dataset.agent, true);
                
                if (messages && messages.length > 0) {
                    // Add older messages at the top
                    messages.reverse().forEach(chat => {
                        const userDiv = document.createElement('div');
                        userDiv.className = 'message user-message';
                        userDiv.innerHTML = `
                            <img src="${chat.userPhotoURL || 'default-avatar.png'}" alt="User" class="message-avatar" loading="lazy">
                            <div class="message-text">${chat.userMessage}</div>
                        `;

                        const aiDiv = document.createElement('div');
                        aiDiv.className = 'message assistant-message';
                        aiDiv.innerHTML = `
                            <img src="alone-logo-w.png" alt="AI" class="message-avatar1" loading="lazy">
                            <div class="message-text">${formatAIResponse(chat.aiResponse)}</div>
                        `;

                        chatMessages.insertBefore(aiDiv, chatMessages.firstChild);
                        chatMessages.insertBefore(userDiv, aiDiv);
                    });

                    // Maintain scroll position
                    const newHeight = chatMessages.scrollHeight;
                    chatMessages.scrollTop = oldScroll + (newHeight - oldHeight);
                }
            } catch (error) {
                console.error('Error loading more messages:', error);
            } finally {
                isLoadingMore = false;
            }
        }
    });

    // Optimize message appending
    function appendMessage(sender, message, isPrepend = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        // Get current user's avatar URL
        const user = authService.getCurrentUser();
        const userAvatarUrl = user && user.photoURL ? user.photoURL : 'default-avatar.png';
        
        // Use user's avatar for user messages, and AI avatar for assistant messages
        const avatar = sender === 'user' ? userAvatarUrl : 'alone-logo-w.png';
        const avatarClass = sender === 'assistant' ? 'message-avatar1' : 'message-avatar';
        
        messageDiv.innerHTML = `
            <img src="${avatar}" alt="${sender}" class="${avatarClass}" loading="lazy" onerror="this.src='default-avatar.png'">
            <div class="message-text">${message}</div>
        `;
        
        if (isPrepend) {
            return messageDiv;
        } else {
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageDiv;
        }
    }

    // Optimize chat history loading
    async function loadChatHistory(agentType) {
        try {
            // Show enhanced loading indicator
            chatMessages.innerHTML = `
                <div class="loading-messages">
                    <div class="loading-animation">
                        <div class="loading-dots">
                            <div class="dot"></div>
                            <div class="dot"></div>
                            <div class="dot"></div>
                        </div>
                    </div>
                    <div class="loading-text">
                        <span>Loading your conversation history</span>
                        <div class="loading-subtext">This may take a moment...</div>
                    </div>
                </div>
            `;

            const history = await chatService.getChatHistory(agentType);
            chatMessages.innerHTML = ''; // Clear loading indicator
            
            if (history.length === 0) {
                chatMessages.innerHTML = getWelcomeMessage(headerTitle.textContent);
                return;
            }

            // Get current user's photo URL
            const user = authService.getCurrentUser();
            const userPhotoURL = user && user.photoURL ? user.photoURL : 'default-avatar.png';

            // Add messages from history in reverse order (oldest first)
            [...history].reverse().forEach(chat => {
                const userDiv = document.createElement('div');
                userDiv.className = 'message user-message';
                userDiv.innerHTML = `
                    <img src="${userPhotoURL}" alt="User" class="message-avatar" loading="lazy" onerror="this.src='default-avatar.png'">
                    <div class="message-text">${chat.userMessage}</div>
                `;
                chatMessages.appendChild(userDiv);

                const aiDiv = document.createElement('div');
                aiDiv.className = 'message assistant-message';
                aiDiv.innerHTML = `
                    <img src="alone-logo-w.png" alt="AI" class="message-avatar1" loading="lazy">
                    <div class="message-text">${formatAIResponse(chat.aiResponse)}</div>
                `;
                chatMessages.appendChild(aiDiv);
            });

            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;

        } catch (error) {
            console.error('Error loading chat history:', error);
            chatMessages.innerHTML = `
                <div class="error-message">
                    <div class="error-icon">⚠️</div>
                    <div class="error-text">
                        <div>Error loading messages</div>
                        <div class="error-subtext">Please try again</div>
                    </div>
                </div>
            `;
        }
    }

    // Add this style block to the head of your document
    const style = document.createElement('style');
    style.textContent = `
        .loading-messages {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 200px;
            padding: 2rem;
            text-align: center;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            margin: 1rem;
        }

        .loading-animation {
            margin-bottom: 1rem;
        }

        .loading-dots {
            display: flex;
            justify-content: center;
            gap: 8px;
        }

        .dot {
            width: 12px;
            height: 12px;
            background: #007AFF;
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out;
        }

        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }

        .loading-text {
            font-size: 1.1rem;
            color: #fff;
            margin-top: 1rem;
        }

        .loading-subtext {
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.7);
            margin-top: 0.5rem;
        }

        .error-message {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 200px;
            padding: 2rem;
            text-align: center;
            background: rgba(255, 0, 0, 0.1);
            border-radius: 12px;
            margin: 1rem;
        }

        .error-icon {
            font-size: 2rem;
            margin-bottom: 1rem;
        }

        .error-text {
            font-size: 1.1rem;
            color: #fff;
        }

        .error-subtext {
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.7);
            margin-top: 0.5rem;
        }

        .auth-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            padding: 20px;
            box-sizing: border-box;
            overflow-y: auto;
        }

        .modal-content {
            background: #1a1a1a;
            border-radius: 12px;
            width: 100%;
            max-width: 480px;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
            padding: 24px;
            box-sizing: border-box;
            margin: auto;
        }

        .modal-content form {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-top: 16px;
        }

        @media (max-height: 700px) {
            .auth-modal {
                align-items: flex-start;
                padding: 10px;
            }

            .modal-content {
                padding: 16px;
            }

            .profile-pic-upload {
                margin: 10px 0;
            }

            .input-group {
                margin-bottom: 10px;
            }

            .delete-account-section {
                margin-top: 16px;
                padding-top: 16px;
            }
        }

        @media (max-width: 480px) {
            .auth-modal {
                padding: 10px;
            }

            .modal-content {
                padding: 16px;
                border-radius: 8px;
            }

            .modal-header h2 {
                font-size: 1.25rem;
            }

            .input-group {
                margin-bottom: 12px;
            }
        }

        .delete-account-section {
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            margin-top: 24px;
            padding-top: 24px;
            text-align: center;
        }

        .delete-account-section p:first-child {
            font-size: 1.1rem;
            color: #EF4444;
            margin-bottom: 8px;
        }

        .delete-account-section p:nth-child(2) {
            font-size: 0.9rem;
            color: #666;
            margin-bottom: 16px;
            line-height: 1.5;
        }

        .delete-account-btn {
            background: linear-gradient(to right, #DC2626, #B91C1C);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 0.95rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            width: 100%;
            max-width: 200px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin: 0 auto;
            box-shadow: 0 4px 6px rgba(220, 38, 38, 0.2);
        }

        .delete-account-btn::before {
            content: '⚠️';
            margin-right: 4px;
        }

        .delete-account-btn:hover {
            background: linear-gradient(to right, #B91C1C, #991B1B);
            transform: translateY(-2px);
            box-shadow: 0 6px 12px rgba(220, 38, 38, 0.3);
        }

        .delete-account-btn:active {
            transform: translateY(0);
            background: linear-gradient(to right, #991B1B, #7F1D1D);
            box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
        }

        @media (max-width: 480px) {
            .delete-account-btn {
                padding: 10px 20px;
                font-size: 0.9rem;
                max-width: 100%;
            }
        }

        .message-text {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: pre-wrap;
            max-width: 100%;
            width: 100%;
        }

        .message {
            max-width: 100%;
            overflow-wrap: break-word;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            width: 100%;
        }

        .ai-warning, .ai-note, .ai-success {
            width: 100%;
            margin: 8px 0;
            padding: 10px;
            border-radius: 6px;
            display: inline-block;
        }

        .message-text code {
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            max-width: 100%;
            display: block;
        }

        .message-text pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
            max-width: 100%;
        }

        .ai-table {
            max-width: 100%;
            overflow-x: auto;
            display: block;
        }

        .ai-code-block {
            max-width: 100%;
            overflow-x: auto;
        }

        .limit-warning {
            background-color: #FEF2F2;
            border: 1px solid #FCA5A5;
            color: #DC2626;
            padding: 12px;
            margin-bottom: 16px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.9em;
        }

        .limit-warning i {
            font-size: 1.1em;
        }

        .remaining-messages {
            font-size: 0.9em;
            color: #666;
            text-align: right;
            margin-top: 4px;
            padding-right: 8px;
        }

        #userInput:disabled {
            background-color: #f5f5f5;
            cursor: not-allowed;
            color: #666;
        }

        .send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background-color: #ccc;
        }

        [data-theme="dark"] .limit-warning {
            background-color: #3B1818;
            border-color: #7F1D1D;
            color: #FCA5A5;
        }

        [data-theme="dark"] #userInput:disabled {
            background-color: #2D2D2D;
            color: #888;
        }
    `;
    document.head.appendChild(style);

    // Add this to your DOMContentLoaded event listener
    const authSection = document.getElementById('authSection');
    const userProfile = document.getElementById('userProfile');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');

    // Auth state observer
    authService.onAuthStateChanged(async (user) => {
        if (user) {
            if (!user.emailVerified) {
                // Show verification needed message
                const chatMessages = document.querySelector('.chat-messages');
                chatMessages.innerHTML = `
                    <div class="welcome-message">
                        <h1>Email Verification Required</h1>
                        <p>Please check your email to verify your account.</p>
                        <p>Once verified, you can sign in to access all features.</p>
                        <button id="resendVerificationBtn" class="submit-btn" style="max-width: 200px; margin: 1rem auto;">
                            Resend Verification Email
                        </button>
                    </div>
                `;

                // Add resend verification button handler
                document.getElementById('resendVerificationBtn').addEventListener('click', async () => {
                    try {
                        await authService.resendVerificationEmail();
                    } catch (error) {
                        console.error('Error resending verification:', error);
                        showToast(error.message, 'error');
                    }
                });

                // Sign out unverified user
                authService.signOut();
                return;
            }

            // Update all UI elements with user's photo
            const userPhotoURL = user.photoURL || 'default-avatar.png';
            
            // Update profile section
            authSection.style.display = 'none';
            userProfile.style.display = 'flex';
            userAvatar.src = userPhotoURL;
            userName.textContent = user.displayName || 'User';
            userEmail.textContent = user.email;

            // Update all existing user message avatars
            const userMessageAvatars = document.querySelectorAll('.user-message .message-avatar');
            userMessageAvatars.forEach(avatar => {
                avatar.src = userPhotoURL;
            });
            
            // Clear previous (guest) chat messages and show welcome message
            const chatMessages = document.querySelector('.chat-messages');
            chatMessages.innerHTML = getWelcomeMessage(headerTitle.textContent);
            
            // Reset chat state
            isNewChat = true;
            
            // Load the user's chat history
            const activeModel = document.querySelector('.model-item.active');
            if (activeModel) {
                loadChatHistory(activeModel.dataset.agent);
            }
            
            // Update display name if needed
            if (!user.displayName && signUpForm) {
                const displayNameInput = signUpForm.elements[0].value;
                if (displayNameInput) {
                    user.updateProfile({
                        displayName: displayNameInput
                    }).then(() => {
                        userName.textContent = displayNameInput;
                    }).catch((error) => {
                        console.error('Error updating display name:', error);
                    });
                }
            }

            // Setup limit listener for the user
            setupUserLimitListener(user.email);
        } else {
            // User is signed out
            authSection.style.display = 'flex';
            userProfile.style.display = 'none';
            
            // Clear chat messages
            const chatMessages = document.querySelector('.chat-messages');
            chatMessages.innerHTML = getWelcomeMessage(headerTitle.textContent);
            
            // Reset isNewChat flag
            isNewChat = true;
            
            // Clean up limit listener
            if (window.userLimitUnsubscribe) {
                window.userLimitUnsubscribe();
                window.userLimitUnsubscribe = null;
            }
        }
    });

    // Auth event listeners
    document.getElementById('showLoginBtn').addEventListener('click', () => {
        console.log('Login button clicked');
        const modal = document.getElementById('signInModal');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            console.error('Sign in modal not found');
        }
    });

    document.getElementById('switchToSignUp').addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Sign up button clicked');
        const signInModal = document.getElementById('signInModal');
        const signUpModal = document.getElementById('signUpModal');
        
        if (signInModal && signUpModal) {
            signInModal.style.display = 'none';
            signUpModal.style.display = 'flex';
        } else {
            console.error('Modal elements not found:', {
                signInModal: !!signInModal,
                signUpModal: !!signUpModal
            });
        }
    });

    // Update the sign-in form handler
    document.getElementById('signInForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = e.target.elements[0].value;
        const password = e.target.elements[1].value;
        
        try {
            const result = await authService.signIn(email, password);
            if (result) { // Only close if sign-in was successful
                document.getElementById('signInModal').style.display = 'none';
            }
        } catch (error) {
            if (error.code === 'auth/invalid-credential') {
                showToast('Invalid email or password. Please check your credentials and try again.', 'error');
            } else {
            showToast(error.message, 'error');
            }
        }
    });

    // Update the sign-up form handler
    const signUpForm = document.getElementById('signUpForm');
    if (signUpForm) {
        signUpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const displayName = e.target.elements[0].value;
            const email = e.target.elements[1].value;
            const password = e.target.elements[2].value;
            
            try {
                const result = await authService.signUp(email, password, displayName);
                if (result) { // Only close if signup was successful
                    document.getElementById('signUpModal').style.display = 'none';
                    
                    // Show verification message
                    const chatMessages = document.querySelector('.chat-messages');
                    chatMessages.innerHTML = `
                        <div class="welcome-message">
                            <h1>Verify Your Email</h1>
                            <p>A verification link has been sent to ${email}.</p>
                            <p>Please check your inbox and verify your email to continue.</p>
                        </div>
                    `;
                }
            } catch (error) {
                // Error is already handled in authService with toasts
                return;
            }
        });
    }

    // Close buttons
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', () => {
            const modalId = button.dataset.modal;
            document.getElementById(modalId).style.display = 'none';
        });
    });

    // Close when clicking outside
    document.querySelectorAll('.auth-modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    // Add this with your other event listeners
    document.getElementById('showSignInBtn')?.addEventListener('click', () => {
        document.getElementById('signUpModal').style.display = 'none';
        document.getElementById('signInModal').style.display = 'flex';
    });

    // Update the sign-out button handler
    document.getElementById('signOutBtn').addEventListener('click', async () => {
        try {
            chatService.clearCache(); // Clear message cache
            await authService.signOut();
        } catch (error) {
            console.error('Error signing out:', error);
            showToast('Error signing out. Please try again.', 'error');
        }
    });

    // Add this with your other event listeners
    document.getElementById('editProfileBtn').addEventListener('click', () => {
        const editProfileModal = document.getElementById('editProfileModal');
        const editNameInput = document.getElementById('editName');
        const editEmailInput = document.getElementById('editEmail');
        const profilePreview = document.getElementById('profilePreview');
        
        // Pre-fill current values
        const user = authService.getCurrentUser();
        if (user) {
            editNameInput.value = user.displayName || '';
            editEmailInput.value = user.email || '';
            profilePreview.src = user.photoURL || 'default-avatar.png';
        }
        
        editProfileModal.style.display = 'flex';
    });

    // Add this style block for enhanced notifications
    const notificationStyles = document.createElement('style');
    notificationStyles.textContent = `
        .notification-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 100%;
            width: 350px;
        }

        @media (max-width: 480px) {
            .notification-container {
                top: 10px;
                right: 10px;
                left: 10px;
                width: auto;
            }
        }

        .notification {
            padding: 16px;
            border-radius: 8px;
            color: white;
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideIn 0.3s ease-out;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            position: relative;
            overflow: hidden;
        }

        .notification.success {
            background: #10B981;
        }

        .notification.error {
            background: #EF4444;
        }

        .notification.info {
            background: #3B82F6;
        }

        .notification.warning {
            background: #F59E0B;
        }

        .notification.loading {
            background: #6B7280;
        }

        .notification-icon {
            font-size: 20px;
            min-width: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .notification-content {
            flex-grow: 1;
        }

        .notification-title {
            font-weight: 600;
            margin-bottom: 4px;
        }

        .notification-message {
            font-size: 0.9em;
            opacity: 0.9;
        }

        .notification-progress {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 3px;
            background: rgba(255, 255, 255, 0.3);
        }

        .notification-progress-bar {
            height: 100%;
            background: rgba(255, 255, 255, 0.7);
            transition: width linear;
        }

        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }

        .notification.fade-out {
            animation: slideOut 0.3s ease-in forwards;
        }

        .spinner {
            animation: spin 1s linear infinite;
            display: inline-block;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(notificationStyles);

    // Create notification container
    const notificationContainer = document.createElement('div');
    notificationContainer.className = 'notification-container';
    document.body.appendChild(notificationContainer);

    // Enhanced showNotification function
    function showNotification(options) {
        const {
            type = 'info',
            title,
            message,
            duration = 5000,
            showProgress = true
        } = options;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        // Define icons for different notification types
        const icons = {
            success: '✓',
            error: '✕',
            info: 'ℹ',
            warning: '⚠',
            loading: '<span class="spinner">↻</span>'
        };

        notification.innerHTML = `
            <div class="notification-icon">${icons[type] || ''}</div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
            ${showProgress ? '<div class="notification-progress"><div class="notification-progress-bar"></div></div>' : ''}
        `;

        notificationContainer.appendChild(notification);

        if (showProgress && type !== 'loading') {
            const progressBar = notification.querySelector('.notification-progress-bar');
            progressBar.style.width = '0%';
            progressBar.style.transition = `width ${duration}ms linear`;
            setTimeout(() => progressBar.style.width = '100%', 50);
        }

        if (type !== 'loading') {
            setTimeout(() => {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }, duration);
        }

        return notification;
    }

    // Handle profile edit form submission with enhanced notifications
    document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        if (!user) return;

        try {
            const newName = document.getElementById('editName').value;
            const newEmail = document.getElementById('editEmail').value;
            const newPassword = document.getElementById('editPassword').value;
            const profilePicInput = document.getElementById('profilePicInput');
            
            let photoURL = user.photoURL || 'default-avatar.png';
            let updateNeeded = false;
            
            // Show initial loading notification
            const loadingNotification = showNotification({
                type: 'loading',
                title: 'Updating Profile',
                message: 'Please wait while we update your profile...',
                showProgress: false
            });
            
            // Handle profile picture update
            if (profilePicInput.files.length > 0) {
                const file = profilePicInput.files[0];
                try {
                    photoURL = await authService.uploadProfilePicture(file);
                    updateNeeded = true;
                    showNotification({
                        type: 'success',
                        title: 'Profile Picture Updated',
                        message: 'Your profile picture has been successfully updated.',
                        duration: 4000
                    });
                } catch (error) {
                    showNotification({
                        type: 'error',
                        title: 'Profile Picture Error',
                        message: 'Failed to update profile picture. Please try again.',
                        duration: 4000
                    });
                }
            }

            // Handle display name update
            if (newName !== user.displayName) {
                try {
            await user.updateProfile({ 
                displayName: newName,
                photoURL: photoURL
            });
                    updateNeeded = true;
            
                    // Update UI elements
            document.getElementById('userName').textContent = newName;
            document.getElementById('userAvatar').src = photoURL;
            
                    // Update welcome message immediately
                    const chatMessages = document.querySelector('.chat-messages');
                    chatMessages.innerHTML = getWelcomeMessage(headerTitle.textContent);
                    
                    // Update avatars in chat messages
            const userMessages = document.querySelectorAll('.user-message .message-avatar');
            userMessages.forEach(avatar => {
                avatar.src = photoURL;
            });
            
                    showNotification({
                        type: 'success',
                        title: 'Name Updated',
                        message: 'Your display name has been successfully updated.',
                        duration: 4000
                    });
                } catch (error) {
                    showNotification({
                        type: 'error',
                        title: 'Name Update Error',
                        message: 'Failed to update display name. Please try again.',
                        duration: 4000
                    });
                }
            }

            // Handle email change
            if (newEmail && newEmail !== user.email) {
                try {
                    await user.verifyBeforeUpdateEmail(newEmail);
                    showNotification({
                        type: 'info',
                        title: 'Email Verification Sent',
                        message: `Please check ${newEmail} for verification link.`,
                        duration: 6000
                    });
                } catch (error) {
                    if (error.code === 'auth/requires-recent-login') {
                        showNotification({
                            type: 'warning',
                            title: 'Authentication Required',
                            message: 'Please sign out and sign in again to change your email.',
                            duration: 5000
                        });
                    } else {
                        showNotification({
                            type: 'error',
                            title: 'Email Update Error',
                            message: error.message || 'Failed to update email.',
                            duration: 4000
                        });
                    }
                }
            }

            // Handle password change
            if (newPassword) {
                try {
                await user.updatePassword(newPassword);
                    showNotification({
                        type: 'success',
                        title: 'Password Updated',
                        message: 'Your password has been successfully changed.',
                        duration: 4000
                    });
                } catch (error) {
                    if (error.code === 'auth/requires-recent-login') {
                        showNotification({
                            type: 'warning',
                            title: 'Authentication Required',
                            message: 'Please sign out and sign in again to change your password.',
                            duration: 5000
                        });
                    } else {
                        showNotification({
                            type: 'error',
                            title: 'Password Update Error',
                            message: error.message || 'Failed to update password.',
                            duration: 4000
                        });
                    }
                }
            }

            // Remove loading notification
            loadingNotification.remove();
            
            // Close modal
            document.getElementById('editProfileModal').style.display = 'none';
            
        } catch (error) {
            console.error('Error updating profile:', error);
            showNotification({
                type: 'error',
                title: 'Update Error',
                message: error.message || 'An error occurred while updating your profile.',
                duration: 5000
            });
        }
    });

    // Add profile picture preview handler
    document.getElementById('profilePicInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('profilePreview').src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // Update the welcome message function to include username
    function getWelcomeMessage(title) {
        const user = authService.getCurrentUser();
        const username = user ? (user.displayName || 'there') : 'there';
        return `
            <div class="welcome-message">
                <h1>${title}</h1>
                <p>Hi ${username}, how can I assist you today?</p>
            </div>
        `;
    }

    // Forgot password button
    document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
        document.getElementById('signInModal').style.display = 'none';
        document.getElementById('resetPasswordModal').style.display = 'flex';
    });

    // Back to sign in button
    document.getElementById('backToSignIn').addEventListener('click', () => {
        document.getElementById('resetPasswordModal').style.display = 'none';
        document.getElementById('signInModal').style.display = 'flex';
    });

    // Update the reset password form handler
    document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = e.target.elements[0].value;
        
        try {
            await authService.sendPasswordResetEmail(email);
            document.getElementById('resetPasswordModal').style.display = 'none';
            
            // Show success message in chat
            const chatMessages = document.querySelector('.chat-messages');
            chatMessages.innerHTML = `
                <div class="welcome-message">
                    <h1>Check Your Email</h1>
                    <p>We've sent a password reset link to ${email}.</p>
                    <p>Please check your inbox and follow the instructions to reset your password.</p>
                </div>
            `;
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // Add delete account button handler
    document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
        // Create and show custom confirmation dialog
        const confirmDialog = document.createElement('div');
        confirmDialog.className = 'confirm-dialog';
        confirmDialog.innerHTML = `
            <div class="confirm-dialog-content">
                <div class="confirm-dialog-header">
                    <h3>Delete Account</h3>
                    <button class="confirm-dialog-close">&times;</button>
                </div>
                <div class="confirm-dialog-body">
                    <div class="confirm-dialog-icon">⚠️</div>
                    <p>Are you sure you want to delete your account?</p>
                    <p class="confirm-dialog-warning">This action cannot be undone. All your data will be permanently deleted.</p>
                </div>
                <div class="confirm-dialog-footer">
                    <button class="confirm-dialog-cancel">Cancel</button>
                    <button class="confirm-dialog-confirm">Delete Account</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmDialog);

        // Add event listeners for the dialog buttons
        const closeDialog = () => {
            confirmDialog.classList.add('confirm-dialog-fadeout');
            setTimeout(() => confirmDialog.remove(), 300);
        };

        confirmDialog.querySelector('.confirm-dialog-close').addEventListener('click', closeDialog);
        confirmDialog.querySelector('.confirm-dialog-cancel').addEventListener('click', closeDialog);

        // Handle the confirm action
        confirmDialog.querySelector('.confirm-dialog-confirm').addEventListener('click', async () => {
            const user = authService.getCurrentUser();
            if (!user) return;

            try {
                // Show loading notification
                const loadingNotification = showNotification({
                    type: 'loading',
                    title: 'Deleting Account',
                    message: 'Please wait while we delete your account...',
                    showProgress: false
                });

                // Delete user's chat history first
                await chatService.deleteChatHistory('med-info');
                await chatService.deleteChatHistory('med-calculator');
                
                // Delete the user account
                await user.delete();
                
                // Remove loading notification
                loadingNotification.remove();
                
                // Show success notification
                showNotification({
                    type: 'success',
                    title: 'Account Deleted',
                    message: 'Your account has been successfully deleted.',
                    duration: 4000
                });

                // Close both the confirmation dialog and the edit profile modal
                closeDialog();
                document.getElementById('editProfileModal').style.display = 'none';

            } catch (error) {
                if (error.code === 'auth/requires-recent-login') {
                    showNotification({
                        type: 'warning',
                        title: 'Authentication Required',
                        message: 'Please sign out and sign in again to delete your account.',
                        duration: 5000
                    });
                } else {
                    showNotification({
                        type: 'error',
                        title: 'Delete Account Error',
                        message: error.message || 'Failed to delete account. Please try again.',
                        duration: 4000
                    });
                }
            }
        });

        // Show dialog with animation
        setTimeout(() => confirmDialog.classList.add('confirm-dialog-show'), 10);

        // Close dialog when clicking outside
        confirmDialog.addEventListener('click', (e) => {
            if (e.target === confirmDialog) {
                closeDialog();
            }
        });
    });

    // Add styles for the confirmation dialog
    const confirmDialogStyles = document.createElement('style');
    confirmDialogStyles.textContent = `
        .confirm-dialog {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            opacity: 0;
            transition: opacity 0.3s ease;
            padding: 20px;
            box-sizing: border-box;
        }

        .confirm-dialog-show {
            opacity: 1;
        }

        .confirm-dialog-fadeout {
            opacity: 0;
        }

        .confirm-dialog-content {
            background: #1a1a1a;
            border-radius: 12px;
            width: 100%;
            max-width: 400px;
            transform: scale(0.9);
            transition: transform 0.3s ease;
            overflow: hidden;
        }

        .confirm-dialog-show .confirm-dialog-content {
            transform: scale(1);
        }

        .confirm-dialog-header {
            padding: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .confirm-dialog-header h3 {
            margin: 0;
            color: #fff;
            font-size: 1.25rem;
        }

        .confirm-dialog-close {
            background: none;
            border: none;
            color: #666;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0;
            line-height: 1;
        }

        .confirm-dialog-body {
            padding: 24px;
            text-align: center;
        }

        .confirm-dialog-icon {
            font-size: 3rem;
            margin-bottom: 16px;
        }

        .confirm-dialog-body p {
            margin: 0 0 12px;
            color: #fff;
            font-size: 1rem;
        }

        .confirm-dialog-warning {
            color: #EF4444 !important;
            font-size: 0.875rem !important;
        }

        .confirm-dialog-footer {
            padding: 16px;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .confirm-dialog-footer button {
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .confirm-dialog-cancel {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
        }

        .confirm-dialog-cancel:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .confirm-dialog-confirm {
            background: #DC2626;
            border: none;
            color: white;
            box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
        }

        .confirm-dialog-confirm:hover {
            background: #B91C1C;
            transform: translateY(-1px);
            box-shadow: 0 4px 6px rgba(220, 38, 38, 0.3);
        }

        .confirm-dialog-confirm:active {
            transform: translateY(0);
            background: #991B1B;
            box-shadow: 0 1px 2px rgba(220, 38, 38, 0.2);
        }

        @media (max-width: 480px) {
            .confirm-dialog {
                padding: 16px;
            }

            .confirm-dialog-content {
                max-width: 100%;
            }

            .confirm-dialog-header {
                padding: 16px;
            }

            .confirm-dialog-body {
                padding: 20px 16px;
            }

            .confirm-dialog-footer {
                padding: 12px;
            }

            .confirm-dialog-footer button {
                padding: 8px 16px;
            }
        }
    `;
    document.head.appendChild(confirmDialogStyles);

    // Add this function to format time until reset
    function formatTimeUntilReset(date) {
        if (!date) return '24 hours';
        
        const now = new Date();
        const diffMs = date.getTime() - now.getTime();
        const diffHrs = Math.ceil(diffMs / (1000 * 60 * 60));
        
        if (diffHrs <= 1) return '1 hour';
        return `${diffHrs} hours`;
    }

    // Add this function to update UI based on message limit
    async function updateUIForMessageLimit(username) {
        try {
            const remaining = await getRemainingMessages(username);
            const nextReset = await getNextResetTime(username);
            
            const userInput = document.getElementById('userInput');
            const sendButton = document.querySelector('.send-button');
            
            // Handle zero or negative remaining messages
            if (remaining <= 0) {
                // Disable all input
                userInput.disabled = true;
                userInput.setAttribute('readonly', 'readonly');
                userInput.style.cursor = 'not-allowed';
                userInput.value = '';
                userInput.placeholder = "Message limit reached";
                
                sendButton.disabled = true;
                sendButton.style.pointerEvents = 'none';
                
                showNotification({
                    type: 'error',
                    title: 'Message Limit Reached',
                    message: `You've reached your daily message limit. Please try again in ${formatTimeUntilReset(nextReset)}.`,
                    duration: 8000
                });
            } else {
                // Enable chat input
                userInput.disabled = false;
                userInput.removeAttribute('readonly');
                userInput.style.cursor = 'text';
                sendButton.disabled = false;
                sendButton.style.pointerEvents = 'auto';
                
                // Reset placeholder
                userInput.placeholder = currentAgent === 'med-calculator' 
                    ? "Enter medical calculation query..."
                    : "Ask about medical information...";
                
                // Show warning notification if messages are running low (less than 3)
                if (remaining < 3) {
                    showNotification({
                        type: 'warning',
                        title: 'Message Limit Running Low',
                        message: `You have ${remaining} message${remaining === 1 ? '' : 's'} remaining today. The limit will reset in ${formatTimeUntilReset(nextReset)}.`,
                        duration: 6000
                    });
                }
            }
        } catch (error) {
            console.error('Error updating UI for message limit:', error);
            userInput.disabled = true;
            sendButton.disabled = true;
            showNotification({
                type: 'error',
                title: 'Error',
                message: 'Unable to verify message limit. Chat disabled for safety.',
                duration: 4000
            });
        }
    }

    // Add this function to listen for user limit changes
    function setupUserLimitListener(username) {
        if (!username) return;
        
        // Unsubscribe from any existing listener
        if (window.userLimitUnsubscribe) {
            window.userLimitUnsubscribe();
        }
        
        // Keep track of the previous limit
        let previousLimit = null;
        
        // Set up new listener
        window.userLimitUnsubscribe = db.collection('userLimits').doc(username)
            .onSnapshot(async (doc) => {
                if (doc.exists) {
                    const newLimit = doc.data().limit;
                    
                    // Only show notification and reset count if the limit has actually changed
                    if (previousLimit !== null && previousLimit !== newLimit) {
                        // Reset message count to 0 when limit changes
                        await db.collection('messageCounts').doc(username).set({
                            count: 0,
                            lastResetTime: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        
                        showNotification({
                            type: 'info',
                            title: 'Message Limit Updated',
                            message: `Your daily message limit has been updated to ${newLimit} messages.`,
                            duration: 6000
                        });
                    }
                    
                    // Update the previous limit
                    previousLimit = newLimit;
                    
                    // Update UI to reflect new limit
                    await updateUIForMessageLimit(username);
                }
            }, (error) => {
                console.error('Error listening to limit changes:', error);
            });
    }
});
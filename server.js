const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// Inject environment variables into the client-side code
app.get('/config.js', (req, res) => {
    res.type('application/javascript');
    res.send(`
        // DeepSeek API configuration
        export const config = {
            DEEPSEEK_API_KEY: '${process.env.DEEPSEEK_API_KEY || "sk-1bb31513466549699cd163af3e883361"}'
        };

        // Main app Firebase config
        export const firebaseConfig = {
            apiKey: '${process.env.FIREBASE_API_KEY || "AIzaSyD_mPnUhcSDqlm1TJqqg9MkRwNsAAqILc4"}',
            authDomain: '${process.env.FIREBASE_AUTH_DOMAIN || "kdhn-demo-test.firebaseapp.com"}',
            projectId: '${process.env.FIREBASE_PROJECT_ID || "kdhn-demo-test"}',
            storageBucket: '${process.env.FIREBASE_STORAGE_BUCKET || "kdhn-demo-test.firebasestorage.app"}',
            messagingSenderId: '${process.env.FIREBASE_MESSAGING_SENDER_ID || "495644965601"}',
            appId: '${process.env.FIREBASE_APP_ID || "1:495644965601:web:3e9fbee8e0a22309b195a0"}'
        };

        // Admin app Firebase config
        export const adminFirebaseConfig = {
            apiKey: '${process.env.ADMIN_FIREBASE_API_KEY || "AIzaSyBEa40rKc6lympfQ77zhIWbavre8CGIvio"}',
            authDomain: '${process.env.ADMIN_FIREBASE_AUTH_DOMAIN || "kdhn-admin.firebaseapp.com"}',
            projectId: '${process.env.ADMIN_FIREBASE_PROJECT_ID || "kdhn-admin"}',
            storageBucket: '${process.env.ADMIN_FIREBASE_STORAGE_BUCKET || "kdhn-admin.firebasestorage.app"}',
            messagingSenderId: '${process.env.ADMIN_FIREBASE_MESSAGING_SENDER_ID || "886354425927"}',
            appId: '${process.env.ADMIN_FIREBASE_APP_ID || "1:886354425927:web:5721104014a9ea57109962"}'
        };
    `);
});

// Handle all other routes by serving index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 
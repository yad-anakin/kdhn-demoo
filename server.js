const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables if .env exists
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Serve static files with proper MIME types
app.use(express.static(path.join(__dirname, '.'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));

// Serve JavaScript files explicitly
app.get('*.js', (req, res, next) => {
    res.set('Content-Type', 'application/javascript');
    next();
});

// Optional route to check current environment variables (for debugging)
app.get('/env-check', (req, res) => {
    res.json({
        port: port,
        nodeEnv: process.env.NODE_ENV,
        hasFirebaseKey: !!process.env.FIREBASE_API_KEY,
        hasAdminKey: !!process.env.ADMIN_FIREBASE_API_KEY,
        hasDeepseekKey: !!process.env.DEEPSEEK_API_KEY
    });
});

// Handle all routes by serving index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 
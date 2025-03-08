import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current file path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables if .env exists
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Serve JavaScript files with correct MIME type
app.get('*.js', (req, res, next) => {
    res.set('Content-Type', 'application/javascript');
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '.'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));

// Handle specific routes for config files
app.get('/config.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'config.js'));
});

app.get('/config/firebase.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'config/firebase.js'));
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

// Handle all other routes by serving index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 
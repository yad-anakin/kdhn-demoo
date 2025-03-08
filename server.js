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

// Set proper MIME types for JavaScript modules
app.use((req, res, next) => {
    if (req.url.endsWith('.js')) {
        res.type('application/javascript');
    }
    next();
});

// Serve static files with proper MIME types
app.use(express.static(path.join(__dirname, '.'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

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
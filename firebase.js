import { firebaseConfig } from './config.js';

// Initialize the main app Firebase instance
const app = firebase.initializeApp(firebaseConfig);
const db = app.firestore();
const auth = app.auth();
const storage = app.storage();

export { app, db, auth, storage }; 
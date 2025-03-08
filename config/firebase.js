import { firebaseConfig } from './config.js';

// Initialize Firebase for the main app
const app = firebase.initializeApp(firebaseConfig);
const auth = app.auth();
const db = app.firestore();
const storage = app.storage();

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();

export { app, auth, db, storage, googleProvider }; 
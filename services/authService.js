import { auth, db, storage, googleProvider } from '../config/firebase.js';
import { showToast } from '../utils/toast.js';

// Default message limit for new users
const DEFAULT_MESSAGE_LIMIT = 10;

class AuthService {
    // Sign up with email/password
    async signUp(email, password, displayName) {
        try {
            // First check if email exists in tempUsers collection
            const tempUsersSnapshot = await db.collection('tempUsers').where('email', '==', email).get();
            if (!tempUsersSnapshot.empty) {
                // Email exists in tempUsers, resend verification email
                try {
                    const tempUserData = tempUsersSnapshot.docs[0].data();
                    const userCredential = await auth.signInWithEmailAndPassword(email, tempUserData.password);
                    await userCredential.user.sendEmailVerification();
                    await auth.signOut();

                    showToast('Almost there! Please verify your email:', 'info');
                    setTimeout(() => {
                        showToast(
                            `Click here to verify your email <a href="https://mail.google.com" target="_blank"><i class="fas fa-external-link-alt"></i></a>`, 
                            'info'
                        );
                    }, 1000);
                } catch (error) {
                    console.error('Error resending verification:', error);
                }
                return { success: false, needsVerification: true };
            }

            // Create temporary user in Authentication
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Set display name
            await user.updateProfile({
                displayName: displayName
            });

            // Send verification email
            await user.sendEmailVerification();

            // Store user data in tempUsers collection
            await db.collection('tempUsers').doc(user.uid).set({
                email: email,
                password: password,
                displayName: displayName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                uid: user.uid
            });

            // Sign out until email is verified
            await auth.signOut();

            // Show success message and instructions
            showToast('Almost there! One more step needed:', 'success');
            
            setTimeout(() => {
                showToast(
                    `Step 1: Click here to verify your email <a href="https://mail.google.com" target="_blank"><i class="fas fa-external-link-alt"></i></a>`, 
                    'info'
                );
            }, 1000);

            setTimeout(() => {
                showToast('Step 2: Check your inbox and click the verification link', 'info');
            }, 2000);

            setTimeout(() => {
                showToast('Step 3: After verification, sign in to complete your account setup', 'info');
            }, 3000);

            return { success: true };
        } catch (error) {
            console.error('Error in signUp:', error);
            
            if (error.code === 'auth/email-already-in-use') {
                try {
                    // Try to sign in to check if email is verified
                    const userCredential = await auth.signInWithEmailAndPassword(email, password);
                    const existingUser = userCredential.user;
                    
                    if (!existingUser.emailVerified) {
                        // Send a new verification email
                        await existingUser.sendEmailVerification();
                        await auth.signOut();

                        showToast('Almost there! Please verify your email:', 'info');
                        setTimeout(() => {
                            showToast(
                                `Click here to verify your email <a href="https://mail.google.com" target="_blank"><i class="fas fa-external-link-alt"></i></a>`, 
                                'info'
                            );
                        }, 1000);

                        return { success: false, needsVerification: true };
                    } else {
                        showToast('This email is already registered and verified. Please sign in instead.', 'info');
                        return { success: false, alreadyVerified: true };
                    }
                } catch (signInError) {
                    showToast('This email is already registered. Please try signing in or use a different email.', 'info');
                    return { success: false, emailInUse: true };
                }
            } else if (error.code === 'auth/invalid-email') {
                showToast('Please enter a valid email address.', 'error');
            } else if (error.code === 'auth/weak-password') {
                showToast('Password should be at least 6 characters long.', 'error');
            } else {
                showToast('Error creating account. Please try again later.', 'error');
            }
            return { success: false, error };
        }
    }

    // Sign in with email/password
    async signIn(email, password) {
        try {
            // Try to sign in first
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;

            if (!user.emailVerified) {
                await auth.signOut();
                await user.sendEmailVerification();
                
                showToast('Email not verified. A new verification link has been sent!', 'info');
                setTimeout(() => {
                    showToast(
                        `Click here to check your email <a href="https://mail.google.com" target="_blank"><i class="fas fa-external-link-alt"></i></a>`, 
                        'info'
                    );
                }, 1000);
                
                return false;
            }

            // Check if this is a first-time verified user
            const tempUsersSnapshot = await db.collection('tempUsers').where('email', '==', email).get();
            if (!tempUsersSnapshot.empty) {
                // Found temp user, set up permanent data
                try {
                    const tempUserData = tempUsersSnapshot.docs[0].data();
                    const tempUserRef = tempUsersSnapshot.docs[0].ref;

                    // Force token refresh to get latest verification status
                    await user.getIdToken(true);

                    // Create permanent user data
                    await db.collection('users').doc(user.uid).set({
                        email: email,
                        displayName: tempUserData.displayName,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        uid: user.uid
                    });

                    // Set up user limits
                    await db.collection('userLimits').doc(email).set({
                        limit: DEFAULT_MESSAGE_LIMIT,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Initialize message count
                    await db.collection('messageCounts').doc(email).set({
                        count: 0,
                        lastResetTime: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Delete temp user data only after successful creation of permanent data
                    await tempUserRef.delete();

                    showToast('Account setup completed! Welcome to Tandrustica!', 'success');
                } catch (error) {
                    console.error('Error setting up permanent account:', error);
                    // Don't show error toast since sign in was successful
                    return true;
                }
            }

            // Set default avatar if needed
            if (!user.photoURL) {
                const defaultURL = await this.getDefaultAvatarURL();
                await user.updateProfile({
                    photoURL: defaultURL
                });
                this.updateUIAvatars(defaultURL);
            } else {
                try {
                    await storage.refFromURL(user.photoURL).getDownloadURL();
                    this.updateUIAvatars(user.photoURL);
                } catch (error) {
                    const defaultURL = await this.getDefaultAvatarURL();
                    await user.updateProfile({
                        photoURL: defaultURL
                    });
                    this.updateUIAvatars(defaultURL);
                }
            }

            showToast('Successfully signed in!', 'success');
            return true;
        } catch (error) {
            console.error('Error in signIn:', error);
            if (error.code === 'auth/invalid-credential') {
                showToast('Invalid email or password. Please check your credentials and try again.', 'error');
            } else {
                showToast(error.message, 'error');
            }
            return false;
        }
    }

    // Sign out
    async signOut() {
        try {
            await auth.signOut();
        } catch (error) {
            console.error('Error in signOut:', error);
            throw error;
        }
    }

    // Get current user with optimized avatar loading
    getCurrentUser() {
        const user = auth.currentUser;
        if (user) {
            
            if (!user.photoURL) {
                // Use cached default URL if available
                if (this.defaultAvatarURL) {
                    this.updateUIAvatars(this.defaultAvatarURL);
                    user.updateProfile({ photoURL: this.defaultAvatarURL });
                } else {
                    this.getDefaultAvatarURL().then(defaultURL => {
                        this.updateUIAvatars(defaultURL);
                        user.updateProfile({ photoURL: defaultURL });
                    });
                }
            } else {
                // Use cached URL if available
                if (this.avatarCache?.has(user.photoURL)) {
                    this.updateUIAvatars(user.photoURL);
                } else {
                    storage.refFromURL(user.photoURL).getDownloadURL()
                        .then(url => {
                            this.updateUIAvatars(url);
                        })
                        .catch(() => {
                            this.getDefaultAvatarURL().then(defaultURL => {
                                this.updateUIAvatars(defaultURL);
                                user.updateProfile({ photoURL: defaultURL });
                            });
                        });
                }
            }
        }
        return user;
    }

    // Helper method to update all UI avatars
    updateUIAvatars(avatarURL) {

        
        // Cache for avatar URLs to avoid repeated fetches
        if (!this.avatarCache) {
            this.avatarCache = new Map();
        }

        const updateImageSrc = (imgElement) => {
            if (!imgElement) return;

            // Show cached image immediately if available
            const cachedUrl = this.avatarCache.get(avatarURL);
            if (cachedUrl) {
                imgElement.src = cachedUrl;
                imgElement.style.display = 'block';
                return;
            }
            
            // Remove old event listeners
            imgElement.onload = null;
            imgElement.onerror = null;
            
            // Show loading state
            imgElement.style.opacity = '0.5';
            imgElement.style.display = 'block';
            
            // Preload image
            const tempImg = new Image();
            tempImg.onload = () => {
                // Cache the successful URL
                this.avatarCache.set(avatarURL, tempImg.src);
                // Update the actual image
                imgElement.src = tempImg.src;
                imgElement.style.opacity = '1';
            };
            
            tempImg.onerror = () => {
                console.error('Error loading image:', avatarURL);
                // Try to load default avatar as fallback
                if (avatarURL !== 'default-avatar.png') {
                    imgElement.src = 'default-avatar.png';
                    imgElement.style.opacity = '1';
                }
            };

            // Add cache busting only for non-cached images
            const refreshedURL = avatarURL.includes('?') 
                ? `${avatarURL}&_t=${Date.now()}` 
                : `${avatarURL}?_t=${Date.now()}`;
            
            tempImg.src = refreshedURL;
        };

        // Update all avatars in parallel
        const updatePromises = [];

        // Update profile avatar
        const userAvatar = document.getElementById('userAvatar');
        if (userAvatar) {
            updatePromises.push(new Promise(resolve => {
                updateImageSrc(userAvatar);
                resolve();
            }));
        }
        
        // Update all message avatars
        const userMessages = document.querySelectorAll('.user-message .message-avatar');
        if (userMessages.length > 0) {
            userMessages.forEach(avatar => {
                updatePromises.push(new Promise(resolve => {
                    updateImageSrc(avatar);
                    resolve();
                }));
            });
        }
        
        // Update profile preview if it exists
        const profilePreview = document.getElementById('profilePreview');
        if (profilePreview) {
            updatePromises.push(new Promise(resolve => {
                updateImageSrc(profilePreview);
                resolve();
            }));
        }

        // Return promise that resolves when all updates are complete
        return Promise.all(updatePromises);
    }

    // Listen to auth state changes
    onAuthStateChanged(callback) {
        return auth.onAuthStateChanged(async (user) => {
            if (user) {
                // Sync existing user to all collections
                await this.syncExistingUser(user);
                
                if (!user.photoURL) {
                    const defaultURL = await this.getDefaultAvatarURL();
                    await user.updateProfile({
                        photoURL: defaultURL
                    });
                    this.updateUIAvatars(defaultURL);
                } else {
                    try {
                        // Verify if the photo URL is still valid
                        await storage.refFromURL(user.photoURL).getDownloadURL();
                        this.updateUIAvatars(user.photoURL);
                    } catch (error) {
                        // If photo URL is invalid, set default avatar
                        const defaultURL = await this.getDefaultAvatarURL();
                        await user.updateProfile({
                            photoURL: defaultURL
                        });
                        this.updateUIAvatars(defaultURL);
                    }
                }
            }
            callback(user);
        });
    }

    // Add method to resend verification email
    async resendVerificationEmail() {
        const user = this.getCurrentUser();
        if (user && !user.emailVerified) {
            await user.sendEmailVerification();
            showToast('Verification email sent!', 'success');
            setTimeout(() => {
                showToast(
                    `Click here to open Gmail <a href="https://mail.google.com" target="_blank"><i class="fas fa-external-link-alt"></i></a>`, 
                    'info'
                );
            }, 1000);
        }
    }

    // Add password reset method
    async sendPasswordResetEmail(email) {
        try {
            await auth.sendPasswordResetEmail(email, {
                url: 'http://localhost:5500'
            });
            showToast('Password reset email sent!', 'success');
            // Show Gmail link toast after a short delay
            setTimeout(() => {
                showToast(
                    `Click here to open Gmail <a href="https://mail.google.com" target="_blank"><i class="fas fa-external-link-alt"></i></a>`, 
                    'info'
                );
            }, 1000);
        } catch (error) {
            console.error('Error sending password reset:', error);
            showToast(error.message, 'error');
            throw error;
        }
    }

    // Add email change method
    async updateEmail(newEmail) {
        const user = this.getCurrentUser();
        if (!user) throw new Error('No user logged in');

        try {
            // First verify current email
            await user.verifyBeforeUpdateEmail(newEmail, {
                url: 'http://localhost:5500' // Update this in production
            });
            
            showToast('Email change requested!', 'success');
            setTimeout(() => {
                showToast(
                    `Click here to open Gmail <a href="https://mail.google.com" target="_blank"><i class="fas fa-external-link-alt"></i></a>`, 
                    'info'
                );
            }, 1000);
            return true;
        } catch (error) {
            console.error('Error updating email:', error);
            showToast(error.message, 'error');
            throw error;
        }
    }

    // Get default avatar URL with caching
    async getDefaultAvatarURL() {
        // Use cached default URL if available
        if (this.defaultAvatarURL) {
            return this.defaultAvatarURL;
        }

        try {
            const defaultAvatarRef = storage.ref().child('profile-pictures/default-avatar.png');
            const url = await defaultAvatarRef.getDownloadURL();
            console.log('Successfully retrieved default avatar URL:', url);
            // Cache the URL
            this.defaultAvatarURL = url;
            return url;
        } catch (error) {
            console.error('Error getting default avatar:', error);
            return 'default-avatar.png';
        }
    }

    // Add method to upload profile picture
    async uploadProfilePicture(file) {
        const user = this.getCurrentUser();
        if (!user) throw new Error('No user logged in');

        try {
            // Create a storage reference
            const storageRef = storage.ref();
            
            // First, try to delete the previous profile picture if it exists
            if (user.photoURL && user.photoURL.includes('firebase')) {
                try {
                    const previousPicRef = storage.refFromURL(user.photoURL);
                    const defaultURL = await this.getDefaultAvatarURL();
                    // Only delete if it's not the default avatar
                    if (user.photoURL !== defaultURL) {
                        await previousPicRef.delete();
                    }
                } catch (error) {
                    console.log('Error deleting previous profile picture:', error);
                }
            }

            // Create a reference for the new file
            const fileRef = storageRef.child(`profile-pictures/${user.uid}/profile.${file.name.split('.').pop()}`);

            // Upload the new file
            await fileRef.put(file);

            // Get the download URL
            const downloadURL = await fileRef.getDownloadURL();

            // Update user profile
            await user.updateProfile({
                photoURL: downloadURL
            });

            // Update UI immediately
            this.updateUIAvatars(downloadURL);

            return downloadURL;
        } catch (error) {
            console.error('Error uploading profile picture:', error);
            showToast(error.message, 'error');
            throw error;
        }
    }

    async signInWithGoogle() {
        try {
            const result = await auth.signInWithPopup(googleProvider);
            const user = result.user;

            // Check if this is a new user
            const isNewUser = result.additionalUserInfo.isNewUser;

            if (isNewUser) {
                // Add user to userLimits collection with default limit
                await db.collection('userLimits').doc(user.email).set({
                    limit: DEFAULT_MESSAGE_LIMIT,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Add user to users collection
                await db.collection('users').doc(user.uid).set({
                    email: user.email,
                    displayName: user.displayName,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    uid: user.uid
                });

                // Initialize message count for the user
                await db.collection('messageCounts').doc(user.email).set({
                    count: 0,
                    lastResetTime: firebase.firestore.FieldValue.serverTimestamp()
                });

                showToast('Account created successfully!', 'success');
            } else {
                // Check if user exists in users collection, if not add them
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (!userDoc.exists) {
                    await db.collection('users').doc(user.uid).set({
                        email: user.email,
                        displayName: user.displayName,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        uid: user.uid
                    });

                    // Also ensure they have entries in other collections
                    const userLimitDoc = await db.collection('userLimits').doc(user.email).get();
                    if (!userLimitDoc.exists) {
                        await db.collection('userLimits').doc(user.email).set({
                            limit: DEFAULT_MESSAGE_LIMIT,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }

                    const messageCountDoc = await db.collection('messageCounts').doc(user.email).get();
                    if (!messageCountDoc.exists) {
                        await db.collection('messageCounts').doc(user.email).set({
                            count: 0,
                            lastResetTime: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
            }

            return user;
        } catch (error) {
            console.error('Error signing in with Google:', error);
            showToast(error.message, 'error');
            throw error;
        }
    }

    // Add method to sync existing users to collections
    async syncExistingUser(user) {
        try {
            if (!user) return;

            // Check and add to users collection
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists) {
                await db.collection('users').doc(user.uid).set({
                    email: user.email,
                    displayName: user.displayName || 'Unknown',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    uid: user.uid
                });
                console.log('Added user to users collection:', user.email);
            }

            // Check and add to userLimits collection
            const userLimitDoc = await db.collection('userLimits').doc(user.email).get();
            if (!userLimitDoc.exists) {
                await db.collection('userLimits').doc(user.email).set({
                    limit: DEFAULT_MESSAGE_LIMIT,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('Added user to userLimits collection:', user.email);
            }

            // Check and add to messageCounts collection
            const messageCountDoc = await db.collection('messageCounts').doc(user.email).get();
            if (!messageCountDoc.exists) {
                await db.collection('messageCounts').doc(user.email).set({
                    count: 0,
                    lastResetTime: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('Added user to messageCounts collection:', user.email);
            }
        } catch (error) {
            console.error('Error syncing existing user:', error);
        }
    }
}

export const authService = new AuthService(); 
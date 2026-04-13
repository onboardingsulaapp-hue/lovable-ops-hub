import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccount) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not defined in environment variables');
  } else {
    try {
      const config = JSON.parse(serviceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(config),
      });
      console.log('Firebase Admin initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase Admin:', error);
    }
  }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export { admin };

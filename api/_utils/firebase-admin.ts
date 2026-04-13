import * as admin from 'firebase-admin';

/**
 * Inicializa e retorna o Admin App de forma singleton
 */
export function getAdminApp() {
  if (!admin.apps.length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not defined in environment variables');
    }

    try {
      const config = JSON.parse(serviceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(config),
      });
      console.log('Firebase Admin initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase Admin:', error);
      throw error;
    }
  }
  return admin.app();
}

/**
 * Retorna a instância do Firestore
 */
export function getFirestore() {
  getAdminApp();
  return admin.firestore();
}

/**
 * Valida um Firebase ID Token e verifica se o usuário é Admin
 * Retorna o UID se for válido e autorizado
 */
export async function verifyFirebaseIdToken(authorizationHeader: string | undefined): Promise<string> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    const err: any = new Error('Unauthorized: Missing Token');
    err.status = 401;
    throw err;
  }

  const idToken = authorizationHeader.split('Bearer ')[1];
  
  try {
    getAdminApp();
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Verificar Perfil no Firestore
    const profile = await getUserProfile(uid);
    
    if (profile.role !== 'admin' || profile.status !== 'ativo') {
        const err: any = new Error('Forbidden: Admin access required');
        err.status = 403;
        throw err;
    }

    return uid;
  } catch (error: any) {
    console.error('Auth Verification Error:', error.message);
    if (!error.status) error.status = 401;
    throw error;
  }
}

/**
 * Busca perfil do usuário nos dois schemas possíveis
 */
export async function getUserProfile(uid: string) {
    const db = getFirestore();
    const userSnap = await db.collection('usuarios').doc(uid).get();
    
    if (!userSnap.exists) {
        throw new Error('User profile not found');
    }

    const data = userSnap.data();
    const role = data?.role || data?.perfil;
    const status = (data?.status === 'ativo') || (data?.ativo === true) ? 'ativo' : 'inativo';

    return { uid, role, status };
}

// Mantendo exportações legadas por compatibilidade temporária
export const adminDb = getFirestore();
export const adminAuth = admin.auth();
export { admin };

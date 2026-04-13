import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore as getFirestoreAdmin } from 'firebase-admin/firestore';
import { getAuth as getAuthAdmin } from 'firebase-admin/auth';

/**
 * Obtém a configuração da Service Account das variáveis de ambiente com suporte a Base64
 */
function getServiceAccountFromEnv(): any {
  let serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const serviceAccountB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;

  if (!serviceAccountRaw && serviceAccountB64) {
    try {
      console.log('[Firebase Admin] Usando FIREBASE_SERVICE_ACCOUNT_B64');
      serviceAccountRaw = Buffer.from(serviceAccountB64, 'base64').toString('utf-8');
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 inválida: Falha ao decodificar Base64');
    }
  }

  if (!serviceAccountRaw) {
    throw new Error('Configuração de ambiente ausente: Defina FIREBASE_SERVICE_ACCOUNT ou FIREBASE_SERVICE_ACCOUNT_B64 no painel da Vercel.');
  }

  try {
    const config = JSON.parse(serviceAccountRaw);
    
    // Validar campos obrigatórios
    if (!config.project_id || !config.client_email || !config.private_key) {
      throw new Error('JSON da Service Account incompleto: project_id, client_email e private_key são obrigatórios.');
    }

    // Corrigir quebras de linha na private_key (comum no Vercel/Windows)
    config.private_key = config.private_key.replace(/\\n/g, '\n');
    
    return config;
  } catch (error: any) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT inválida: ${error.message}`);
  }
}

/**
 * Inicializa e retorna o Admin App de forma singleton utilizando o SDK modular
 */
export function getAdminApp() {
  const apps = getApps();
  
  if (apps.length === 0) {
    console.log('[Firebase Admin] Inicializando nova instância modular...');
    try {
      const config = getServiceAccountFromEnv();
      return initializeApp({
        credential: cert(config),
      });
    } catch (error: any) {
      console.error('[Firebase Admin] Falha crítica na inicialização modular:', error.message);
      throw error;
    }
  }
  
  return getApp();
}

/**
 * Retorna a instância do Firestore assegurando inicialização
 */
export function getFirestore() {
  const app = getAdminApp();
  return getFirestoreAdmin(app);
}

/**
 * Retorna a instância do Auth assegurando inicialização
 */
export function getAuth() {
  const app = getAdminApp();
  return getAuthAdmin(app);
}

/**
 * Valida um Firebase ID Token e verifica se o usuário é Admin
 */
export async function verifyFirebaseIdToken(authorizationHeader: string | undefined): Promise<string> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    const err: any = new Error('Não autorizado: Token ausente no cabeçalho Authorization.');
    err.status = 401;
    err.hint = "Certifique-se de enviar 'Bearer {token}' no header da requisição.";
    throw err;
  }

  const idToken = authorizationHeader.split('Bearer ')[1];
  
  try {
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const profile = await getUserProfile(uid);
    
    if (profile.role !== 'admin' || profile.status !== 'ativo') {
        const err: any = new Error('Acesso negado: Perfil de administrador ativo requerido.');
        err.status = 403;
        err.hint = "Seu usuário está cadastrado como admin? Verifique no console do Firestore.";
        throw err;
    }

    return uid;
  } catch (error: any) {
    console.error('[Auth] Erro de validação:', error.message);
    const err: any = new Error(error.message);
    err.status = error.status || 401;
    err.hint = error.hint || "O token pode ter expirado ou ser inválido.";
    throw err;
  }
}

/**
 * Busca perfil do usuário de forma segura
 */
export async function getUserProfile(uid: string) {
    const db = getFirestore();
    const userSnap = await db.collection('usuarios').doc(uid).get();
    
    if (!userSnap.exists) {
        throw new Error('Perfil de usuário não encontrado no Firestore.');
    }

    const data = userSnap.data();
    const role = data?.role || data?.perfil;
    const status = (data?.status === 'ativo') || (data?.ativo === true) ? 'ativo' : 'inativo';

    return { uid, role, status };
}

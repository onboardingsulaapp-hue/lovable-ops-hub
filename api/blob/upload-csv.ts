import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminAuth, adminDb, admin } from '../_utils/firebase-admin';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  const body = request.body as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // ... (resto igual)
        const payload = JSON.parse(clientPayload || '{}');
        const idToken = payload.idToken;

        if (!idToken) {
          throw new Error('Missing ID Token');
        }

        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const userSnap = await adminDb.collection('usuarios').doc(uid).get();
        const userData = userSnap.data();
        const role = userData?.role || userData?.perfil;
        const isAtivo = (userData?.status === 'ativo') || (userData?.ativo === true);

        if (role !== 'admin' || !isAtivo) {
          throw new Error('Forbidden: Admin access required');
        }

        return {
          allowedContentTypes: ['text/csv', 'application/vnd.ms-excel'],
          tokenPayload: JSON.stringify({
            uid: uid,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { uid } = JSON.parse(tokenPayload || '{}');

        try {
          const jobId = `job_${Date.now()}_blob`;
          await adminDb.collection('jobs').doc(jobId).set({
            tipo: 'sync_pendencias_csv',
            status: 'queued',
            requested_by: uid,
            requested_by_role: 'Admin',
            requested_at: admin.firestore.FieldValue.serverTimestamp(),
            file: {
              url: blob.url,
              pathname: blob.pathname,
              contentType: blob.contentType,
            },
          });
          console.log(`Job ${jobId} queued for blob ${blob.url}`);
        } catch (error) {
          console.error('Error creating job after blob upload:', error);
        }
      },
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    return response.status(400).json({ error: (error as Error).message });
  }
}

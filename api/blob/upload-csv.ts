import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { admin, getFirestore, verifyFirebaseIdToken } from '../_utils/firebase-admin.js';

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
        const payload = JSON.parse(clientPayload || '{}');
        const idToken = payload.idToken;

        // Validar token e perfil
        const uid = await verifyFirebaseIdToken(`Bearer ${idToken}`);

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
          const adminDb = getFirestore();
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
  } catch (error: any) {
    return response.status(error.status || 400).json({ error: (error as Error).message });
  }
}

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { generateToken04 } from '../helpers/zegoTokenHelper';


export const generateZegoToken = onCall(
  { region: 'us-central1', cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { roomId, userId, userName } = request.data as {
      roomId?: string;
      userId?: string;
      userName?: string;
    };

    if (!roomId || !userId || !userName) {
      throw new HttpsError('invalid-argument', 'roomId, userId, and userName are required.');
    }

    if (request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'Cannot generate token for another user.');
    }

    const appId = Number(process.env.ZEGO_APP_ID);
    const serverSecret = process.env.ZEGO_SERVER_SECRET;

    if (!appId || !serverSecret) {
      throw new HttpsError('internal', 'Zego configuration missing on server.');
    }

    const token = generateToken04(appId, userId, serverSecret, 3600);
    return { token };
  },
);

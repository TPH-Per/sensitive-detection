import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { generateZegoKitToken } from '../helpers/zegoTokenHelper';

/**
 * Tạo token Zego (Zegocloud)
 */
export const generateZegoToken = onCall(
  {
    region: 'us-central1',
    cors: true
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Yêu cầu đăng nhập.');
    }

    const { roomId, userId, userName } = request.data as {
      roomId: string;
      userId: string;
      userName: string;
    };

    if (!roomId || !userId || !userName) {
      throw new HttpsError('invalid-argument', 'Thiếu roomId, userId hoặc userName.');
    }

    if (request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'Không được tạo token cho người khác.');
    }

    const appId = Number(process.env.ZEGO_APP_ID);
    const serverSecret = process.env.ZEGO_SERVER_SECRET;

    if (!appId || !serverSecret) {
      throw new HttpsError('internal', 'Thiếu cấu hình Zego trên server.');
    }

    const token = generateZegoKitToken(appId, serverSecret, roomId, userId, userName);

    return { token };
  });

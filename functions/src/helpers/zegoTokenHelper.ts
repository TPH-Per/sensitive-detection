import * as crypto from 'crypto';

/**
 * Tạo token Zego
 */
export function generateZegoKitToken(
  appId: number,
  serverSecret: string,
  roomId: string,
  userId: string,
  userName: string,
  expireSeconds = 3600,
): string {
  const expireTime = Math.floor(Date.now() / 1000) + expireSeconds;
  const nonce = Math.floor(Math.random() * 2147483647);

  const hash = crypto
    .createHmac('md5', serverSecret)
    .update(`${appId}${roomId}${userId}${nonce}${expireTime}`)
    .digest('hex');

  const tokenData = JSON.stringify({
    app_id: appId,
    user_id: userId,
    nonce,
    ctime: Math.floor(Date.now() / 1000),
    expire: expireTime,
    payload: hash,
  });

  return '04' + Buffer.from(tokenData).toString('base64');
}

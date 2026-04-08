import { createCipheriv } from 'crypto';

export function generateToken04(
  appId: number,
  userId: string,
  secret: string,
  effectiveTimeInSeconds: number,
  payload = '',
): string {
  if (!appId || typeof appId !== 'number') throw new Error('appId invalid');
  if (!userId || typeof userId !== 'string') throw new Error('userId invalid');
  if (!secret || typeof secret !== 'string' || secret.length !== 32)
    throw new Error('secret must be a 32-byte string');
  if (!effectiveTimeInSeconds || typeof effectiveTimeInSeconds !== 'number')
    throw new Error('effectiveTimeInSeconds invalid');

  const createTime = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: Math.ceil((-2147483648 + 4294967295) * Math.random()),
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload: payload || '',
  };

  const plainText = JSON.stringify(tokenInfo);
  const iv = makeRandomIv();

  const algorithm = getAlgorithm(secret);
  const cipher = createCipheriv(algorithm, Buffer.from(secret), Buffer.from(iv));
  cipher.setAutoPadding(true);
  const encryptedBuf = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);

  const expireBuf = Buffer.alloc(8);
  new DataView(expireBuf.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false);

  const ivLenBuf = Buffer.alloc(2);
  new DataView(ivLenBuf.buffer).setUint16(0, iv.length, false);

  const encLenBuf = Buffer.alloc(2);
  new DataView(encLenBuf.buffer).setUint16(0, encryptedBuf.byteLength, false);

  const result = Buffer.concat([expireBuf, ivLenBuf, Buffer.from(iv), encLenBuf, encryptedBuf]);
  return '04' + result.toString('base64');
}

function makeRandomIv(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function getAlgorithm(key: string): string {
  switch (Buffer.from(key).length) {
    case 16: return 'aes-128-cbc';
    case 24: return 'aes-192-cbc';
    case 32: return 'aes-256-cbc';
    default: throw new Error('Invalid key length: ' + Buffer.from(key).length);
  }
}

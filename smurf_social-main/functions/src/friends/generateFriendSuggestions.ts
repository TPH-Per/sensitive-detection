import { FieldValue, FieldPath } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../app';
import { User, UserStatus } from '../types';

type UserDoc = User & {
  userVector?: number[];
  suggestedFriends?: string[];
};

type RankedCandidate = {
  id: string;
  user: UserDoc;
  score: number;
};

const DEFAULT_LIMIT = 20;
const ACTIVE_USER_QUERY_LIMIT = 300;

export const generateFriendSuggestions = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Chưa đăng nhập');
    }

    const userId = request.auth.uid;
    const requestedLimit = Number(request.data?.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(Math.floor(requestedLimit), 50))
      : DEFAULT_LIMIT;

    try {
      const userRef = db.collection('users').doc(userId);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        throw new HttpsError('not-found', 'Không tìm thấy người dùng');
      }

      const userData = userSnap.data() as UserDoc;
      if (userData.status === UserStatus.BANNED) {
        throw new HttpsError('permission-denied', 'Tài khoản đã bị khóa');
      }

      const randomId = db.collection('users').doc().id;
      let activeUsersSnap = await db.collection('users')
        .where('status', '==', UserStatus.ACTIVE)
        .where(FieldPath.documentId(), '>=', randomId)
        .limit(ACTIVE_USER_QUERY_LIMIT)
        .get();

      if (activeUsersSnap.size < ACTIVE_USER_QUERY_LIMIT) {
        const remainder = ACTIVE_USER_QUERY_LIMIT - activeUsersSnap.size;
        const fallbackSnap = await db.collection('users')
          .where('status', '==', UserStatus.ACTIVE)
          .where(FieldPath.documentId(), '<', randomId)
          .limit(remainder)
          .get();
        
        const mergedDocs = [...activeUsersSnap.docs, ...fallbackSnap.docs];
        activeUsersSnap = { docs: mergedDocs } as FirebaseFirestore.QuerySnapshot;
      }

      const [friendIds, blockedByMeIds, blockedByThemIds] = await Promise.all([
        getFriendIds(userId),
        getBlockedUserIds(userId),
        getBlockedByThemIds(userId)
      ]);

      const myVector = parseVector(userData.userVector);

      const candidates = activeUsersSnap.docs
        .map((doc) => ({ id: doc.id, user: doc.data() as UserDoc }))
        .filter(({ id }) =>
          id !== userId && !friendIds.has(id) && !blockedByMeIds.has(id) && !blockedByThemIds.has(id)
        );

      const ranked = rankCandidates(candidates, myVector, limit * 3);
      const suggestions = ranked.slice(0, limit);
      const suggestionIds = suggestions.map(({ id }) => id);

      await userRef.set(
        {
          suggestedFriends: suggestionIds,
          suggestionsLastUpdated: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        userId,
        count: suggestionIds.length,
        suggestionIds,
      };
    } catch (error) {
      const authHeader = getBearerToken(request);
      if (authHeader && shouldUseRestFallback(error)) {
        return generateFriendSuggestionsViaRest(authHeader, userId, limit);
      }

      if (error instanceof HttpsError) {
        throw error;
      }

      console.error('[generateFriendSuggestions] Lỗi:', error);
      throw new HttpsError('internal', 'Không thể tạo gợi ý kết bạn');
    }
  }
);

function shouldUseRestFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Could not refresh access token') ||
    message.includes('metadata') ||
    message.includes('Admin SDK configuration') ||
    message.includes('ENETUNREACH')
  );
}

function getBearerToken(
  request: { rawRequest?: { headers?: Record<string, string | string[] | undefined> } }
): string | null {
  const authorization = request.rawRequest?.headers?.authorization;
  const headerValue = Array.isArray(authorization)
    ? authorization[0]
    : authorization;

  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function generateFriendSuggestionsViaRest(
  token: string,
  userId: string,
  limit: number
): Promise<{ userId: string; count: number; suggestionIds: string[] }> {
  const projectId = process.env.GCLOUD_PROJECT ?? 'smurf-social';
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const userDoc = await fetchJson(`${baseUrl}/users/${encodeURIComponent(userId)}`, headers);
  const userData = parseRestUserDocument(userDoc);

  if (!userData) {
    throw new HttpsError('not-found', 'Không tìm thấy người dùng');
  }

  if (userData.status === UserStatus.BANNED) {
    throw new HttpsError('permission-denied', 'Tài khoản đã bị khóa');
  }

  const [friendIds, blockedByMeIds, activeUsers] = await Promise.all([
    listRestSubcollectionIds(`${baseUrl}/users/${encodeURIComponent(userId)}/friends`, headers),
    listRestSubcollectionIds(`${baseUrl}/users/${encodeURIComponent(userId)}/blockedUsers`, headers),
    runFirestoreQuery(baseUrl, headers, {
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: UserStatus.ACTIVE },
          },
        },
        limit: Math.max(1, Math.min(limit * 3, 300)),
      },
    }),
  ]);

  const friendIdSet = new Set(friendIds);
  const blockedByMeSet = new Set(blockedByMeIds);

  const candidates = activeUsers
    .map((doc) => parseRestUserDocument(doc))
    .filter((doc): doc is UserDoc => Boolean(doc))
    .filter((doc) => doc.id !== userId && !friendIdSet.has(doc.id) && !blockedByMeSet.has(doc.id));

  const ranked = rankRestCandidates(candidates, userData.userVector, limit * 3);
  const filtered = await filterRestBlockedByThem(token, userId, ranked);
  const suggestions = filtered.slice(0, limit);
  const suggestionIds = suggestions.map(({ id }) => id);

  await patchRestUserSuggestions(baseUrl, headers, userId, suggestionIds);

  return {
    userId,
    count: suggestionIds.length,
    suggestionIds,
  };
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new HttpsError('internal', `Firestore REST request failed: ${response.status}`);
  }
  return response.json();
}

async function runFirestoreQuery(
  baseUrl: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<any[]> {
  const response = await fetch(`${baseUrl}:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new HttpsError('internal', `Firestore query failed: ${response.status}`);
  }

  const payload = (await response.json()) as Array<{ document?: any }>;
  return payload
    .map((item) => item.document)
    .filter((document): document is any => Boolean(document));
}

async function listRestSubcollectionIds(
  url: string,
  headers: Record<string, string>
): Promise<string[]> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new HttpsError('internal', `Firestore subcollection request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { documents?: Array<{ name?: string }> };
  return (payload.documents ?? [])
    .map((document) => extractDocumentId(document.name ?? ''))
    .filter((id) => id.length > 0);
}

function parseRestUserDocument(document: any): UserDoc | null {
  if (!document?.name || !document.fields) {
    return null;
  }

  const id = extractDocumentId(document.name);
  if (!id) return null;

  const fields = document.fields as Record<string, any>;
  return {
    id,
    fullName: parseRestValue(fields.fullName) ?? '',
    email: parseRestValue(fields.email) ?? '',
    status: (parseRestValue(fields.status) as UserStatus) ?? UserStatus.ACTIVE,
    userVector: parseRestNumberArray(fields.userVector),
    suggestedFriends: parseRestStringArray(fields.suggestedFriends),
  } as UserDoc;
}

function parseRestValue(field: any): unknown {
  if (!field || typeof field !== 'object') return null;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return Number(field.doubleValue);
  if ('booleanValue' in field) return Boolean(field.booleanValue);
  if ('timestampValue' in field) return field.timestampValue;
  return null;
}

function parseRestNumberArray(field: any): number[] | undefined {
  if (!field?.arrayValue?.values) return undefined;
  const values = field.arrayValue.values
    .map((value: any) => parseRestValue(value))
    .map((value: unknown) => (typeof value === 'number' ? value : Number(value)))
    .filter((value: number) => Number.isFinite(value));
  return values.length > 0 ? values : undefined;
}

function parseRestStringArray(field: any): string[] | undefined {
  if (!field?.arrayValue?.values) return undefined;
  const values = field.arrayValue.values
    .map((value: any) => parseRestValue(value))
    .map((value: unknown) => String(value ?? '').trim())
    .filter((value: string) => value.length > 0);
  return values.length > 0 ? values : undefined;
}

function rankRestCandidates(
  candidates: UserDoc[],
  myVector: number[] | undefined,
  limit: number
): RankedCandidate[] {
  if (!myVector || myVector.length === 0) {
    return candidates.slice(0, limit).map((user) => ({ id: user.id, user, score: 0 }));
  }

  return candidates
    .map((user) => ({
      id: user.id,
      user,
      score: cosineSimilarity(myVector, user.userVector ?? null),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function filterRestBlockedByThem(
  token: string,
  currentUserId: string,
  candidates: RankedCandidate[]
): Promise<RankedCandidate[]> {
  const projectId = process.env.GCLOUD_PROJECT ?? 'smurf-social';
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  const filtered = await Promise.all(
    candidates.map(async (candidate) => {
      const response = await fetch(
        `${baseUrl}/users/${encodeURIComponent(candidate.id)}/blockedUsers/${encodeURIComponent(currentUserId)}`,
        { headers }
      );
      return response.ok ? null : candidate;
    })
  );

  return filtered.filter((candidate): candidate is RankedCandidate => candidate !== null);
}

async function patchRestUserSuggestions(
  baseUrl: string,
  headers: Record<string, string>,
  userId: string,
  suggestionIds: string[]
): Promise<void> {
  const url = new URL(`${baseUrl}/users/${encodeURIComponent(userId)}`);
  url.searchParams.append('updateMask.fieldPaths', 'suggestedFriends');
  url.searchParams.append('updateMask.fieldPaths', 'suggestionsLastUpdated');

  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      fields: {
        suggestedFriends: {
          arrayValue: {
            values: suggestionIds.map((id) => ({ stringValue: id })),
          },
        },
        suggestionsLastUpdated: {
          timestampValue: new Date().toISOString(),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new HttpsError('internal', `Failed to persist suggestions: ${response.status}`);
  }
}

function extractDocumentId(name: string): string {
  if (!name) return '';
  const parts = name.split('/');
  return parts[parts.length - 1] ?? '';
}

async function getFriendIds(userId: string): Promise<Set<string>> {
  const snapshot = await db.collection('users').doc(userId).collection('friends').get();
  return new Set(snapshot.docs.map((doc) => doc.id));
}

async function getBlockedUserIds(userId: string): Promise<Set<string>> {
  const snapshot = await db.collection('users').doc(userId).collection('blockedUsers').get();
  return new Set(snapshot.docs.map((doc) => doc.id));
}

async function getBlockedByThemIds(currentUserId: string): Promise<Set<string>> {
  const blockedDocs = await db.collectionGroup('blockedUsers')
    .where('blockedUid', '==', currentUserId)
    .get();
  
  return new Set(blockedDocs.docs.map((doc) => doc.ref.parent.parent?.id || ''));
}

function parseVector(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;

  const vector = raw
    .map((value) => (typeof value === 'number' ? value : Number(value)))
    .filter((value) => Number.isFinite(value));

  return vector.length > 0 ? vector : null;
}

function rankCandidates(
  candidates: Array<{ id: string; user: UserDoc }>,
  myVector: number[] | null,
  limit: number
): RankedCandidate[] {
  if (!myVector || myVector.length === 0) {
    return candidates.slice(0, limit).map(({ id, user }) => ({ id, user, score: 0 }));
  }

  return candidates
    .map(({ id, user }) => ({
      id,
      user,
      score: cosineSimilarity(myVector, parseVector(user.userVector)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function cosineSimilarity(a: number[], b: number[] | null): number {
  if (!b || a.length === 0 || b.length === 0) return 0;

  const length = Math.min(a.length, b.length);
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    magnitudeA += a[index] * a[index];
    magnitudeB += b[index] * b[index];
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return denominator === 0 ? 0 : dot / denominator;
}
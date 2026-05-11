import { FieldValue, FieldPath } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../app';
import { UserStatus } from '../types';

const K_PROFILE_VECTOR_DIMENSIONS = 99;
const K_MIN_POOL_SIZE_FOR_REFRESH = 20;
const K_SUGGESTION_LIMIT = 20;
const K_MUTUAL_FRIEND_BONUS = 0.05;

/** Tính độ tương đồng giữa hai hồ sơ người dùng */
function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    
    for (let i = 0; i < K_PROFILE_VECTOR_DIMENSIONS; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
}

/** Lấy danh sách bạn bè của người dùng */
async function loadFriendIds(userId: string): Promise<Set<string>> {
    const snap = await db.collection('users').doc(userId).collection('friends').get();
    return new Set(snap.docs.map((d) => d.id));
}

/** Lấy danh sách người bị chặn */
async function loadBlockedIds(userId: string): Promise<Set<string>> {
    const snap = await db.collection('users').doc(userId).collection('blockedUsers').get();
    return new Set(snap.docs.map((d) => d.id));
}

/** Thu thập danh sách bạn của bạn bè */
async function collectFriendsOfFriendsPool(
    userId: string, 
    friendIds: Set<string>, 
    blockedIds: Set<string>, 
    mutualCountMap: Map<string, number>
): Promise<Set<string>> {
    const pool = new Set<string>();
    const friendQueries = Array.from(friendIds).map(fid => db.collection('users').doc(fid).collection('friends').get());
    const snaps = await Promise.all(friendQueries);
    
    for (const fSnap of snaps) {
        for (const d of fSnap.docs) {
            const candidateId = d.id;
            if (candidateId === userId || friendIds.has(candidateId) || blockedIds.has(candidateId))
                continue;
            pool.add(candidateId);
            mutualCountMap.set(candidateId, (mutualCountMap.get(candidateId) ?? 0) + 1);
        }
    }
    return pool;
}

/** Lấy dữ liệu hồ sơ theo danh sách ID */
async function fetchUsersByIds(ids: string[]): Promise<Array<{ id: string; userVector?: number[]; status: string }>> {
    const results: Array<{ id: string; userVector?: number[]; status: string }> = [];
    for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        if (chunk.length === 0) continue;
        const snap = await db.collection('users').where(FieldPath.documentId(), 'in', chunk).get();
        for (const doc of snap.docs) {
            const data = doc.data();
            results.push({
                id: doc.id,
                userVector: data.userVector,
                status: data.status,
            });
        }
    }
    return results;
}

/** Xếp hạng gợi ý bạn bè theo điểm số */
function rankByScore(
    candidates: Array<{ id: string; userVector?: number[] }>, 
    myVector: number[] | undefined, 
    mutualCountMap: Map<string, number>, 
    limit: number
): Array<{ id: string; mutualCount: number }> {
    const scored = candidates.map((u) => {
        const cosineSim = myVector && u.userVector ? cosineSimilarity(myVector, u.userVector) : 0;
        const mutualCount = mutualCountMap.get(u.id) ?? 0;
        return { 
            id: u.id, 
            mutualCount, 
            score: cosineSim + K_MUTUAL_FRIEND_BONUS * mutualCount 
        };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ id, mutualCount }) => ({ id, mutualCount }));
}

/** Tự động tạo danh sách gợi ý kết bạn */
export const generateFriendSuggestions = onCall(
    { region: 'asia-southeast1', cors: true, invoker: 'public' }, 
    async (request) => {
        const userId = request.auth?.uid;
        if (!userId) throw new HttpsError('unauthenticated', 'Chưa đăng nhập');

        const limit = Number(request.data?.limit) || K_SUGGESTION_LIMIT;
        const force = Boolean(request.data?.force);
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const userData = userDoc.data();

        if (!userData) throw new HttpsError('not-found', 'Không tìm thấy người dùng');
        if (userData.status === UserStatus.BANNED) {
            throw new HttpsError('permission-denied', 'Tài khoản bị khóa');
        }

        const myVector = userData.userVector;
        const friendIds = await loadFriendIds(userId);
        const myBlockedIds = await loadBlockedIds(userId);
        
        const blockedMeSnap = await db.collectionGroup('blockedUsers')
            .where('blockedUid', '==', userId)
            .get();
        
        const blockedIds = new Set([
            ...Array.from(myBlockedIds),
            ...blockedMeSnap.docs.map(d => d.ref.parent.parent!.id)
        ]);
        
        const cachedSuggestions = userData.suggestedFriends as Array<{ id: string; mutualCount: number }> || [];
        const lastUpdated = userData.suggestionsLastUpdated;
        const oneWeekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const isStale = !lastUpdated || lastUpdated.toMillis() < oneWeekAgoMs;

        if (!force && !isStale && cachedSuggestions.length > 0) {
            return { suggestionIds: cachedSuggestions.slice(0, limit).map(s => s.id) };
        }

        let finalSuggestions: Array<{ id: string; mutualCount: number }> = [];

        if (friendIds.size === 0) {
            const snap = await db.collection('users').where('status', '==', UserStatus.ACTIVE).limit(100).get();
            const candidates = snap.docs
                .filter((d) => d.id !== userId && !blockedIds.has(d.id))
                .map((d) => ({ id: d.id, userVector: d.data().userVector }));
            finalSuggestions = rankByScore(candidates, myVector, new Map(), limit);
        } else {
            const mutualCountMap = new Map<string, number>();
            const poolIds = await collectFriendsOfFriendsPool(userId, friendIds, blockedIds, mutualCountMap);
            
            if (poolIds.size < K_MIN_POOL_SIZE_FOR_REFRESH) {
                const snap = await db.collection('users').where('status', '==', UserStatus.ACTIVE).limit(50).get();
                for (const d of snap.docs) {
                    if (d.id !== userId && !friendIds.has(d.id) && !blockedIds.has(d.id)) {
                        poolIds.add(d.id);
                    }
                }
            }

            const idList = Array.from(poolIds).slice(0, 200);
            const users = await fetchUsersByIds(idList);
            const activeUsers = users.filter((u) => u.status === UserStatus.ACTIVE);
            finalSuggestions = rankByScore(activeUsers, myVector, mutualCountMap, limit);
        }

        await userRef.update({
            suggestedFriends: finalSuggestions,
            suggestionsLastUpdated: FieldValue.serverTimestamp(),
        });

        return { 
            suggestionIds: finalSuggestions.map(s => s.id),
            suggestions: finalSuggestions // Trả về cả mutualCount để frontend dùng nếu cần
        };
    }
);

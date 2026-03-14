import { getDocs, query, collection, where, documentId, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { User } from '../types';
import { FIREBASE_LIMITS } from '../constants/appConfig';

export const chunkArray = <T,>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const batchGetUsers = async (userIds: string[]): Promise<Record<string, User>> => {
  if (!userIds || userIds.length === 0) return {};

  const uniqueIds = [...new Set(userIds)];
  const chunks = chunkArray(uniqueIds, FIREBASE_LIMITS.QUERY_IN_LIMIT);

  try {
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const q = query(
          collection(db, 'users'),
          where(documentId(), 'in', chunk)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
          createdAt: doc.data().createdAt as Timestamp,
          dob: doc.data().dob as Timestamp | undefined,
        })) as User[];
      })
    );

    return results.flat().reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {} as Record<string, User>);
  } catch (error) {
    console.error('Lỗi lấy dữ liệu người dùng:', error);
    return {};
  }
};


import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import { FriendRequest, FriendRequestStatus, User } from '../../shared/types';
import { convertDoc, convertDocs } from '../utils/firebaseUtils';
import { batchGetUsers } from '../utils/batchUtils';
import { rtdbConversationService } from './chat/rtdbConversationService';

export const friendService = {
  // Kiểm tra yêu cầu kết bạn đang chờ
  checkFriendRequestExists: async (senderId: string, receiverId: string): Promise<boolean> => {
    try {
      const q = query(
        collection(db, 'friendRequests'),
        where('senderId', '==', senderId),
        where('receiverId', '==', receiverId),
        where('status', '==', FriendRequestStatus.PENDING)
      );
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error("Lỗi kiểm tra lời mời kết bạn", error);
      return false;
    }
  },

  sendFriendRequest: async (senderId: string, receiverId: string): Promise<FriendRequest | void> => {
    try {
      if (senderId === receiverId) {
        throw new Error("Không thể gửi lời mời kết bạn cho chính mình");
      }

      const [receiverSnap, receiverBlockedSnap, senderBlockedSnap, isFriendSnap] = await Promise.all([
        getDoc(doc(db, 'users', receiverId)),
        getDoc(doc(db, 'users', receiverId, 'blockedUsers', senderId)),
        getDoc(doc(db, 'users', senderId, 'blockedUsers', receiverId)),
        getDoc(doc(db, 'users', senderId, 'friends', receiverId)),
      ]);

      if (!receiverSnap.exists()) throw new Error("Người dùng không tồn tại");
      if ((receiverSnap.data() as any)?.status === 'banned') {
        throw new Error("Không thể gửi lời mời kết bạn cho người dùng này");
      }
      if (receiverBlockedSnap.exists()) {
        throw new Error("Không thể gửi lời mời kết bạn cho người dùng này");
      }
      if (senderBlockedSnap.exists()) {
        throw new Error("Bạn đã chặn người dùng này");
      }
      if (isFriendSnap.exists()) {
        throw new Error("Hai người đã là bạn bè");
      }

      const reverseRequestQuery = query(
        collection(db, 'friendRequests'),
        where('senderId', '==', receiverId),
        where('receiverId', '==', senderId),
        where('status', '==', FriendRequestStatus.PENDING)
      );
      const reverseSnap = await getDocs(reverseRequestQuery);

      if (!reverseSnap.empty) {
        const requestId = reverseSnap.docs[0].id;
        await friendService.acceptFriendRequest(requestId, receiverId, senderId);
        return;
      }

      const alreadySent = await friendService.checkFriendRequestExists(senderId, receiverId);
      if (alreadySent) throw new Error("Đã gửi lời mời kết bạn rồi");

      const requestData = {
        senderId,
        receiverId,
        status: FriendRequestStatus.PENDING,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'friendRequests'), requestData);

      return {
        id: docRef.id,
        ...requestData,
      } as FriendRequest;
    } catch (error) {
      console.error("Lỗi gửi lời mời kết bạn", error);
      throw error;
    }
  },

  getReceivedRequests: async (userId: string): Promise<FriendRequest[]> => {
    try {
      const q = query(
        collection(db, 'friendRequests'),
        where('receiverId', '==', userId),
        where('status', '==', FriendRequestStatus.PENDING),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      return convertDocs<FriendRequest>(querySnapshot.docs);
    } catch (error) {
      console.error("Lỗi lấy lời mời kết bạn", error);
      return [];
    }
  },

  subscribeToReceivedRequests: (userId: string, callback: (requests: FriendRequest[]) => void) => {
    const q = query(
      collection(db, 'friendRequests'),
      where('receiverId', '==', userId),
      where('status', '==', FriendRequestStatus.PENDING),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      callback(convertDocs<FriendRequest>(snapshot.docs));
    }, (error) => {
      console.error("Lỗi subscribe lời mời kết bạn", error);
    });
  },

  getSentRequests: async (userId: string): Promise<FriendRequest[]> => {
    try {
      const q = query(
        collection(db, 'friendRequests'),
        where('senderId', '==', userId),
        where('status', '==', FriendRequestStatus.PENDING),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      return convertDocs<FriendRequest>(querySnapshot.docs);
    } catch (error) {
      console.error("Lỗi lấy lời mời đã gửi", error);
      return [];
    }
  },

  subscribeToSentRequests: (userId: string, callback: (requests: FriendRequest[]) => void) => {
    const q = query(
      collection(db, 'friendRequests'),
      where('senderId', '==', userId),
      where('status', '==', FriendRequestStatus.PENDING),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      callback(convertDocs<FriendRequest>(snapshot.docs));
    }, (error) => {
      console.error("Lỗi subscribe lời mời đã gửi", error);
    });
  },

  acceptFriendRequest: async (requestId: string, senderId: string, receiverId: string): Promise<void> => {
    try {
      const batch = writeBatch(db);
      const now = serverTimestamp();

      batch.set(doc(db, 'users', senderId, 'friends', receiverId), { friendId: receiverId, createdAt: now, updatedAt: now });
      batch.set(doc(db, 'users', receiverId, 'friends', senderId), { friendId: senderId, createdAt: now, updatedAt: now });
      batch.update(doc(db, 'friendRequests', requestId), {
        status: FriendRequestStatus.ACCEPTED,
        updatedAt: now
      });

      await batch.commit();

      try {
        await rtdbConversationService.initializeDirectConversation(senderId, receiverId, receiverId);
      } catch (chatError) {
        console.error("Lỗi khởi tạo hội thoại khi kết bạn", chatError);
      }
    } catch (error) {
      console.error("Lỗi chấp nhận kết bạn", error);
      throw error;
    }
  },

  rejectFriendRequest: async (requestId: string): Promise<void> => {
    try {
      const requestRef = doc(db, 'friendRequests', requestId);
      await updateDoc(requestRef, {
        status: FriendRequestStatus.REJECTED,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Lỗi từ chối kết bạn", error);
      throw error;
    }
  },

  cancelFriendRequest: async (requestId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'friendRequests', requestId));
    } catch (error) {
      console.error("Lỗi hủy lời mời kết bạn", error);
      throw error;
    }
  },

  unfriend: async (userId: string, friendId: string): Promise<void> => {
    try {
      const batch = writeBatch(db);

      batch.delete(doc(db, 'users', userId, 'friends', friendId));
      batch.delete(doc(db, 'users', friendId, 'friends', userId));

      const [sentSnap, receivedSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'friendRequests'),
          where('senderId', '==', userId),
          where('receiverId', '==', friendId)
        )),
        getDocs(query(
          collection(db, 'friendRequests'),
          where('senderId', '==', friendId),
          where('receiverId', '==', userId)
        )),
      ]);

      [...sentSnap.docs, ...receivedSnap.docs].forEach(d => batch.delete(d.ref));

      await batch.commit();
    } catch (error) {
      console.error("Lỗi hủy kết bạn", error);
      throw error;
    }
  },

  getAllFriends: async (currentUserId: string): Promise<User[]> => {
    try {
      const snap = await getDocs(collection(db, 'users', currentUserId, 'friends'));
      const friendIds = snap.docs.map(d => d.id);
      if (friendIds.length === 0) return [];
      const friendsMap = await batchGetUsers(friendIds);
      return Object.values(friendsMap).filter(u => u.status !== 'banned');
    } catch (error) {
      console.error("Lỗi lấy danh sách bạn bè", error);
      return [];
    }
  },

  subscribeToFriends: (userId: string, callback: (friends: User[]) => void): (() => void) => {
    const friendsRef = collection(db, 'users', userId, 'friends');
    let previousFriendIds: string[] = [];

    return onSnapshot(friendsRef, async (snapshot) => {
      const friendIds = snapshot.docs.map(d => d.id);
      const isIdsChanged = friendIds.length !== previousFriendIds.length ||
        !friendIds.every((id) => previousFriendIds.includes(id));

      if (!isIdsChanged && previousFriendIds.length > 0) return;
      previousFriendIds = friendIds;

      if (friendIds.length === 0) {
        callback([]);
        return;
      }

      try {
        const friendsMap = await batchGetUsers(friendIds);
        callback(Object.values(friendsMap));
      } catch (error) {
        console.error("Lỗi fetch friends realtime", error);
      }
    });
  },

  searchFriends: async (searchTerm: string, currentUserId: string): Promise<User[]> => {
    try {
      const snap = await getDocs(collection(db, 'users', currentUserId, 'friends'));
      const friendIds = snap.docs.map(d => d.id);
      if (friendIds.length === 0) return [];

      const friendsMap = await batchGetUsers(friendIds);
      const friends = Object.values(friendsMap);

      return friends.filter(friend =>
        friend.status !== 'banned' &&
        (friend.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          friend.email?.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    } catch (error) {
      console.error("Lỗi tìm kiếm bạn bè", error);
      return [];
    }
  },

  removeSuggestion: async (currentUserId: string, targetUserId: string): Promise<void> => {
    try {
      const userRef = doc(db, 'users', currentUserId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;
      const current: string[] = userSnap.data()?.suggestedFriends ?? [];
      const updated = current.filter(id => id !== targetUserId);
      await updateDoc(userRef, { suggestedFriends: updated });
    } catch {
      // silent — không critical
    }
  },

  generateFriendSuggestions: async (limit?: number): Promise<string[]> => {
    try {
      const fn = httpsCallable<{ limit?: number }, { suggestionIds: string[] }>(
        functions,
        'generateFriendSuggestions'
      );
      const result = await fn(limit !== undefined ? { limit } : {});
      return result.data.suggestionIds;
    } catch (error) {
      console.error("Lỗi tạo gợi ý kết bạn", error);
      return [];
    }
  },

  getCachedSuggestions: async (userId: string): Promise<User[]> => {
    try {
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (!userSnap.exists()) return [];

      const suggestedIds: string[] = userSnap.data()?.suggestedFriends ?? [];
      if (suggestedIds.length === 0) return [];

      const usersMap = await batchGetUsers(suggestedIds);
      return suggestedIds
        .map(id => usersMap[id])
        .filter((u): u is User => Boolean(u) && u.status !== 'banned');
    } catch (error) {
      console.error("Lỗi lấy gợi ý kết bạn đã cache", error);
      return [];
    }
  },
};

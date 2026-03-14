import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  Timestamp,
  addDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { FriendRequest, FriendRequestStatus } from '../types';

export const friendService = {
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
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt as Timestamp,
        updatedAt: doc.data().updatedAt as Timestamp | undefined
      } as FriendRequest));
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
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt as Timestamp,
        updatedAt: doc.data().updatedAt as Timestamp | undefined
      } as FriendRequest));
      callback(requests);
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
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt as Timestamp,
        updatedAt: doc.data().updatedAt as Timestamp | undefined
      } as FriendRequest));
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
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt as Timestamp,
        updatedAt: doc.data().updatedAt as Timestamp | undefined
      } as FriendRequest));
      callback(requests);
    }, (error) => {
      console.error("Lỗi subscribe lời mời đã gửi", error);
    });
  },

  acceptFriendRequest: async (requestId: string, senderId: string, receiverId: string): Promise<void> => {
    try {
      const batch = writeBatch(db);
      const now = serverTimestamp();

      batch.set(doc(db, 'users', senderId, 'friends', receiverId), { friendId: receiverId, createdAt: now });
      batch.set(doc(db, 'users', receiverId, 'friends', senderId), { friendId: senderId, createdAt: now });
      batch.delete(doc(db, 'friendRequests', requestId));

      await batch.commit();
    } catch (error) {
      console.error("Lỗi chấp nhận kết bạn", error);
      throw error;
    }
  },

  rejectFriendRequest: async (requestId: string): Promise<void> => {
    try {
      const requestRef = doc(db, 'friendRequests', requestId);
      await deleteDoc(requestRef);
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
};

import { db } from '../app';

/** Kiểm tra quyền nhận tin nhắn dựa trên cài đặt chặn */
export const isBlockingMessages = async (receiverId: string, senderId: string, conversationData?: any): Promise<boolean> => {
  try {
    const blockSnap = await db
      .collection('users')
      .doc(receiverId)
      .collection('blockedUsers')
      .doc(senderId)
      .get();
    
    if (blockSnap.exists && blockSnap.data()?.blockMessages === true) {
      return true;
    }

    const settingsSnap = await db
      .collection('users')
      .doc(receiverId)
      .collection('private')
      .doc('settings')
      .get();
    
    const allowFromStrangers = settingsSnap.exists 
      ? (settingsSnap.data()?.allowMessagesFromStrangers ?? true) 
      : true;

    if (!allowFromStrangers) {
      const friendSnap = await db
        .collection('users')
        .doc(receiverId)
        .collection('friends')
        .doc(senderId)
        .get();
      
      const isFriend = friendSnap.exists;

      if (!isFriend) {
        let canBypass = false;
        if (conversationData && conversationData.lastMessageAt && conversationData.lastMessageAt[receiverId]) {
          const lastTimeReceiverSent = conversationData.lastMessageAt[receiverId];
          if (Date.now() - lastTimeReceiverSent < 24 * 60 * 60 * 1000) {
            canBypass = true;
          }
        }
        
        if (!canBypass) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error(`[isBlockingMessages] Lỗi khi kiểm tra block giữa receiver ${receiverId} và sender ${senderId}:`, error);
    return false;
  }
};

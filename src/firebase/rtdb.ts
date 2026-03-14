import { ref, DatabaseReference } from 'firebase/database';
import { rtdb } from './config';

export const presenceRef = (uid: string): DatabaseReference =>
    ref(rtdb, `presence/${uid}`);

export const presencesRef = (): DatabaseReference =>
    ref(rtdb, 'presence');

export const conversationRef = (convId: string): DatabaseReference =>
    ref(rtdb, `conversations/${convId}`);

export const conversationsRef = (): DatabaseReference =>
    ref(rtdb, 'conversations');

export const conversationMembersRef = (convId: string): DatabaseReference =>
    ref(rtdb, `conversations/${convId}/members`);

export const conversationLastMessageRef = (convId: string): DatabaseReference =>
    ref(rtdb, `conversations/${convId}/lastMessage`);

export const messagesRef = (convId: string): DatabaseReference =>
    ref(rtdb, `messages/${convId}`);

export const messageRef = (convId: string, msgId: string): DatabaseReference =>
    ref(rtdb, `messages/${convId}/${msgId}`);

export const userChatsRef = (uid: string): DatabaseReference =>
    ref(rtdb, `user_chats/${uid}`);

export const userChatRef = (uid: string, convId: string): DatabaseReference =>
    ref(rtdb, `user_chats/${uid}/${convId}`);

export const callSignalingRef = (uid: string): DatabaseReference =>
    ref(rtdb, `call_signaling/${uid}`);

export const callSignalingsRef = (): DatabaseReference =>
    ref(rtdb, 'call_signaling');

import { RtdbConversation } from '../../../shared/types';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/config';

export const STRANGER_MESSAGES_DISABLED_CODE = 'chat/stranger-messages-disabled';
export const DIRECT_MESSAGE_BLOCKED_CODE = 'chat/direct-message-blocked';

export class StrangerMessagesDisabledError extends Error {
  code: string;

  constructor() {
    super('Bạn đang tắt nhận tin nhắn từ người lạ.');
    this.name = 'StrangerMessagesDisabledError';
    this.code = STRANGER_MESSAGES_DISABLED_CODE;
  }
}

export class DirectMessageBlockedError extends Error {
  code: string;

  constructor(message: string) {
    super(message);
    this.name = 'DirectMessageBlockedError';
    this.code = DIRECT_MESSAGE_BLOCKED_CODE;
  }
}

interface StrangerMessagePolicyContext {
  conversationId: string;
  senderId: string;
  conversation?: RtdbConversation;
  friendIds: string[];
  allowMessagesFromStrangers: boolean;
}

const parseDirectMemberIds = (conversationId: string): string[] => {
  if (!conversationId.startsWith('direct_')) return [];
  return conversationId.replace('direct_', '').split('_').filter(Boolean);
};

const resolvePartnerId = (
  conversationId: string,
  senderId: string,
  conversation?: RtdbConversation
): string | null => {
  if (conversation?.isGroup) return null;

  const members = conversation
    ? Object.keys(conversation.members || {})
    : parseDirectMemberIds(conversationId);

  if (members.length < 2) return null;
  const partnerId = members.find((id) => id !== senderId);
  return partnerId || null;
};

export const shouldRequireEnableStrangerMessages = ({
  conversationId,
  senderId,
  conversation,
  friendIds,
  allowMessagesFromStrangers,
}: StrangerMessagePolicyContext): boolean => {
  const partnerId = resolvePartnerId(conversationId, senderId, conversation);
  if (!partnerId) return false;
  if (friendIds.includes(partnerId)) return false;
  return !allowMessagesFromStrangers;
};

export const assertCanSendDirectMessage = (context: StrangerMessagePolicyContext): void => {
  if (shouldRequireEnableStrangerMessages(context)) {
    throw new StrangerMessagesDisabledError();
  }
};

export const assertCanSendDirectMessageServer = async ({
  conversationId,
  senderId,
  conversation,
}: Pick<StrangerMessagePolicyContext, 'conversationId' | 'senderId' | 'conversation'>): Promise<void> => {
  const partnerId = resolvePartnerId(conversationId, senderId, conversation);
  if (!partnerId) return;

  const validateSend = httpsCallable<{ conversationId: string }, { allowed: boolean }>(
    functions,
    'validateDirectMessageSend'
  );

  try {
    await validateSend({ conversationId });
  } catch (error) {
    if (isDirectMessageBlockedError(error)) {
      const reason = extractBlockedReason(error);
      throw new DirectMessageBlockedError(reason);
    }
    throw error;
  }
};

export const isStrangerMessagesDisabledError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === STRANGER_MESSAGES_DISABLED_CODE;
};

const extractBlockedReason = (error: unknown): string => {
  if (!error || typeof error !== 'object') return 'Tin nhắn chưa được gửi.';

  const typed = error as {
    message?: unknown;
    details?: unknown;
  };

  const details = typed.details as { reason?: unknown } | undefined;
  if (typeof details?.reason === 'string' && details.reason.trim().length > 0) {
    return details.reason;
  }

  if (typeof typed.message === 'string' && typed.message.trim().length > 0) {
    return typed.message;
  }

  return 'Tin nhắn chưa được gửi.';
};

export const isDirectMessageBlockedError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const typed = error as {
    code?: unknown;
    details?: unknown;
  };

  if (typed.code === DIRECT_MESSAGE_BLOCKED_CODE) {
    return true;
  }

  if (typed.code === 'functions/failed-precondition') {
    const details = typed.details as { appCode?: unknown } | undefined;
    return details?.appCode === DIRECT_MESSAGE_BLOCKED_CODE;
  }

  return false;
};
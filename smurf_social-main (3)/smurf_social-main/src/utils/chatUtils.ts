import React from 'react';
import { RtdbMessage, MessageType } from '../../shared/types';

/**
 * Logic chuyển đổi tin nhắn thành nhãn hiển thị (Snippet)
 */
export const getMessageDisplayContent = (message: RtdbMessage): string => {
    if (message.isRecalled) return 'Tin nhắn đã thu hồi';
    
    switch (message.type) {
        case MessageType.TEXT:
            return message.content.replace(/@\[([^\]]+)\]/g, '@$1');
        case MessageType.SHARE_POST:
            return '[Chia sẻ bài viết]';
        case MessageType.IMAGE: {
            const isAlbum = (message.media || []).length > 1;
            const prefix = isAlbum ? '[Album hình ảnh]' : '[Hình ảnh]';
            if (message.content?.startsWith(prefix)) return message.content;
            return message.content ? `${prefix} ${message.content.replace(/@\[([^\]]+)\]/g, '@$1')}` : prefix;
        }
        case MessageType.VIDEO:
            return message.content?.startsWith('[Video]') ? message.content : '[Video]';
        case MessageType.GIF:
            return message.content?.startsWith('[GIF]') ? message.content : '[GIF]';
        case MessageType.FILE:
            return message.content?.startsWith('[File]') ? message.content : `[File] ${message.media?.[0]?.fileName || ''}`;
        case MessageType.VOICE:
            return message.content?.startsWith('[Tin nhắn thoại]') ? message.content : '[Tin nhắn thoại]';
        case MessageType.CALL:
            return message.content?.startsWith('[Cuộc gọi]') ? message.content : '[Cuộc gọi]';
        case MessageType.SYSTEM:
            return message.content;
        default:
            return message.content?.startsWith('[Tin nhắn]') ? message.content : '[Tin nhắn]';
    }
};

/**
 * Parser cho nội dung văn bản có chứa Mentions và Links
 * Chuyển đổi chuỗi @[userId:Name] thành danh sách các phần tử
 */
export const parseTextWithMentions = (text: string) => {
    return text.split(/(@\[[^:]+:[^\]]+\]|@[^\s\u200B]+(?:\s[^\s\u200B]+)*\u200B|(?:https?:\/\/|www\.)[^\s]+)/g);
};

/**
 * Dự đoán Conversation ID cho hội thoại 1-1 giữa 2 người dùng
 */
export const getDirectConversationId = (userId1: string, userId2: string): string => {
    const sortedIds = [userId1, userId2].sort();
    return `direct_${sortedIds[0]}_${sortedIds[1]}`;
};

import React from 'react';
import { RtdbMessage, MessageType } from '../../../../shared/types';
import { parseSharedPostMessage } from '../../../utils/postShareMessage';
import { 
  TextMessage, ImageMessage, VideoMessage, GifMessage, 
  FileMessage, VoiceMessage, CallMessage, RecalledMessage, SharedPostMessage
} from './content';

interface MessageContentProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  isGroup?: boolean;
  uploadProgress: Record<string, { progress: number; error?: boolean; localUrls?: string[] }>;
  onOpenImage: (index: number) => void;
  onLoad?: () => void;
  onCall?: () => void;
  onJoinCall?: (callType: 'voice' | 'video') => void;
}

/** Phân loại hiển thị nội dung theo MessageType */
const MessageContentInner: React.FC<MessageContentProps> = ({
  message, isMe, isGroup = false, uploadProgress,
  onOpenImage, onLoad, onCall, onJoinCall,
}) => {
  if (message.data.isRecalled) return <RecalledMessage isMe={isMe} />;

  const { type, content, isEdited, createdAt, reactions } = message.data;
  const up = uploadProgress[message.id];

  switch (type) {
    case MessageType.TEXT:
      return <TextMessage message={message} isMe={isMe} />;

    case MessageType.SHARE_POST: {
      const payload = parseSharedPostMessage(content);
      if (!payload) return <div className="text-xs italic opacity-50">Nội dung chia sẻ bài viết không hợp lệ</div>;
      
      const hasReactions = !!(reactions && Object.keys(reactions).length > 0);
      return (
        <SharedPostMessage
          payload={payload}
          isMe={isMe}
          isEdited={!!isEdited}
          hasReactions={hasReactions}
        />
      );
    }

    case MessageType.IMAGE:
      return <ImageMessage message={message} isMe={isMe} uploadProgress={up} onOpenImage={onOpenImage} onLoad={onLoad} />;

    case MessageType.VIDEO:
      return <VideoMessage message={message} isMe={isMe} uploadProgress={up} onLoad={onLoad} />;

    case MessageType.GIF:
      return <GifMessage message={message} onLoad={onLoad} />;

    case MessageType.FILE:
      return <FileMessage message={message} isMe={isMe} uploadProgress={up} onOpenImage={onOpenImage} />;

    case MessageType.VOICE:
      return <VoiceMessage message={message} isMe={isMe} uploadProgress={up} />;

    case MessageType.CALL:
      return <CallMessage message={message} isMe={isMe} isGroup={isGroup} onCall={onCall} onJoinCall={onJoinCall} />;

    case MessageType.SYSTEM:
      return null;

    default:
      return <div className="text-xs italic opacity-50">Loại tin nhắn chưa được hỗ trợ: {type}</div>;
  }
};

export const MessageContent = React.memo(MessageContentInner);

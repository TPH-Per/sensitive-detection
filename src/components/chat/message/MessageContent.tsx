import React from 'react';
import { RtdbMessage, MessageType } from '../../../../shared/types';
import { 
  TextMessage, ImageMessage, VideoMessage, GifMessage, 
  FileMessage, VoiceMessage, CallMessage, RecalledMessage 
} from './content';

interface MessageContentProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  isGroup?: boolean;
  uploadProgress: Record<string, { progress: number; error?: boolean }>;
  isPlaying: boolean;
  onToggleVoice: (e: React.MouseEvent) => void;
  onOpenImage: (index: number) => void;
  onCall?: () => void;
  onJoinCall?: (callType: 'voice' | 'video') => void;
}

/**
 * Component điều hướng hiển thị nội dung tin nhắn dựa trên MessageType.
 * Được tách nhỏ thành các component con chuyên biệt để dễ bảo trì và Clean Code.
 */
const MessageContentInner: React.FC<MessageContentProps> = ({
  message, isMe, isGroup = false, uploadProgress,
  isPlaying, onToggleVoice, onOpenImage, onCall, onJoinCall,
}) => {
  // Trạng thái thu hồi được ưu tiên hàng đầu
  if (message.data.isRecalled) {
    return <RecalledMessage isMe={isMe} />;
  }

  const { type } = message.data;
  const up = uploadProgress[message.id];

  // Dispatch nội dung dựa trên Enum MessageType
  switch (type) {
    case MessageType.TEXT:
    case MessageType.SHARE_POST:
      return <TextMessage message={message} isMe={isMe} />;

    case MessageType.IMAGE:
      return (
        <ImageMessage 
          message={message} 
          isMe={isMe} 
          uploadProgress={up} 
          onOpenImage={onOpenImage} 
        />
      );

    case MessageType.VIDEO:
      return (
        <VideoMessage 
          message={message} 
          isMe={isMe} 
          uploadProgress={up} 
        />
      );

    case MessageType.GIF:
      return <GifMessage message={message} />;

    case MessageType.FILE:
      return (
        <FileMessage 
          message={message} 
          isMe={isMe} 
          uploadProgress={up} 
          onOpenImage={onOpenImage} 
        />
      );

    case MessageType.VOICE:
      return (
        <VoiceMessage 
          message={message} 
          isMe={isMe} 
          uploadProgress={up} 
          isPlaying={isPlaying} 
          onToggleVoice={onToggleVoice} 
        />
      );

    case MessageType.CALL:
      return (
        <CallMessage 
          message={message} 
          isMe={isMe} 
          isGroup={isGroup} 
          onCall={onCall} 
          onJoinCall={onJoinCall} 
        />
      );

    case MessageType.SYSTEM:
      // Tin nhắn hệ thống thường được xử lý ở Bubble cấp cao hơn, 
      // nhưng trả về null ở đây để đảm bảo an toàn.
      return null;

    default:
      // Trường hợp dự phòng cho các loại tin nhắn lạ hoặc chưa được hỗ trợ
      return (
        <div className="text-xs italic opacity-50">
          Loại tin nhắn chưa được hỗ trợ: {type}
        </div>
      );
  }
};

export const MessageContent = React.memo(MessageContentInner);

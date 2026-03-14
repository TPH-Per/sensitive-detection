import React from 'react';
import { Phone, Video, Info, ChevronLeft } from 'lucide-react';
import { RtdbConversation, RtdbUserChat, User } from '../../types';
import { Avatar, UserAvatar, UserStatusText, IconButton, Button, BannedBadge } from '../ui';

interface ChatBoxHeaderProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  participants: User[];
  chatName: string;
  avatarSrc?: string;
  partner?: User;
  usersMap: Record<string, User>;
  onBack?: () => void;
  onInfoClick?: () => void;
  onCall?: () => void;
  onVideoCall?: () => void;
}

const ChatBoxHeaderInner: React.FC<ChatBoxHeaderProps> = ({
  conversation,
  participants,
  chatName,
  avatarSrc,
  partner,
  usersMap,
  onBack,
  onInfoClick,
  onCall,
  onVideoCall,
}) => {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-3 md:px-4 h-16 border-b border-border-light bg-bg-primary transition-theme">
      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
        {onBack && (
          <IconButton
            icon={<ChevronLeft size={24} />}
            onClick={onBack}
            variant="ghost"
            className="md:hidden -ml-2 text-text-secondary"
            size="md"
            title="Quay lại"
          />
        )}

        <div className="flex-shrink-0">
          {conversation.data.isGroup ? (
            <Avatar
              src={avatarSrc}
              name={chatName}
              size="md"
              isGroup
              members={participants}
            />
          ) : (
            <UserAvatar
              userId={partner?.id ?? ''}
              name={chatName}
              size="md"
              initialStatus={partner?.status}
              showStatus={false}
            />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold text-text-primary truncate leading-tight">{chatName}</h2>
            {!conversation.data.isGroup && partner && usersMap[partner.id]?.status === 'banned' && <BannedBadge />}
          </div>
          {!conversation.data.isGroup && partner && (
            <UserStatusText
              userId={partner.id}
              className="text-xs text-text-tertiary truncate leading-tight"
              initialStatus={partner.status}
            />
          )}
          {conversation.data.isGroup && (
            <span className="text-xs text-text-tertiary truncate leading-tight">
              {participants.length} thành viên
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 md:gap-1">
        <IconButton
          onClick={onCall}
          title="Cuộc gọi âm thanh"
          variant="ghost"
          className="text-text-secondary"
          icon={<Phone size={20} />}
          size="md"
        />
        <IconButton
          onClick={onVideoCall}
          title="Cuộc gọi video"
          variant="ghost"
          className="text-text-secondary"
          icon={<Video size={20} />}
          size="md"
        />
        <IconButton
          onClick={onInfoClick}
          title="Thông tin hội thoại"
          variant="ghost"
          className="text-text-secondary hover:text-primary"
          icon={<Info size={20} />}
          size="md"
        />
      </div>
    </div>
  );
};

export const ChatBoxHeader = React.memo(ChatBoxHeaderInner);
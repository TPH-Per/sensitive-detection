import React from 'react';
import { User, RtdbConversation, RtdbUserChat } from '../../../types';
import { UserAvatar, Avatar, UserStatusText, BannedBadge } from '../../ui';

interface ChatDetailsHeaderProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  participants: User[];
  partner?: User;
}

export const ChatDetailsHeader: React.FC<ChatDetailsHeaderProps> = ({
  conversation,
  currentUserId,
  participants,
  partner
}) => {
  const isGroup = conversation.data.isGroup;
  const displayName = isGroup ? conversation.data.name : partner?.fullName || 'Unknown';
  const avatarSrc = isGroup ? conversation.data.avatar?.url : partner?.avatar.url;

  return (
    <div className="flex flex-col items-center py-6 px-4 border-b border-border-light">
      {isGroup ? (
        <Avatar src={avatarSrc} name={displayName} size="xl" isGroup members={participants} />
      ) : (
        <UserAvatar
          userId={partner?.id ?? ''}
          src={avatarSrc}
          name={displayName}
          size="xl"
          initialStatus={partner?.status}
          showStatus={false}
        />
      )}

      <h2 className="mt-4 text-lg font-bold text-text-primary text-center flex items-center gap-2">
        {displayName}
        {!isGroup && partner?.status === 'banned' && <BannedBadge size="lg" />}
      </h2>

      {!isGroup && partner && (
        <UserStatusText
          userId={partner.id}
          initialStatus={partner.status}
          className="text-sm text-text-secondary mt-1"
        />
      )}

      {isGroup && (
        <p className="text-sm text-text-secondary mt-1">
          {participants.length} thành viên
        </p>
      )}

      {partner?.bio && (
        <p className="text-sm text-text-tertiary mt-2 text-center max-w-[250px] line-clamp-2">
          {partner.bio}
        </p>
      )}
    </div>
  );
};

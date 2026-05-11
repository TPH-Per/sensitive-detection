import React from 'react';
import { User, UserStatus, RtdbConversation, RtdbUserChat } from '../../../../shared/types';
import { UserAvatar, Avatar, UserStatusText, BannedBadge } from '../../ui';

interface ChatDetailsHeaderProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  participants: User[];
  partner?: User;
}

/** Thông tin cơ bản của hội thoại. */
export const ChatDetailsHeader: React.FC<ChatDetailsHeaderProps> = ({
  conversation, currentUserId, participants, partner,
}) => {
  const isGroup = conversation.data.isGroup;
  const displayName = isGroup ? conversation.data.name : partner?.fullName || 'Unknown';
  const avatarSrc = isGroup ? conversation.data.avatar?.url : partner?.avatar?.url;

  return (
    <div className="flex flex-col items-center py-5 px-4 border-b border-border-light">
      {isGroup ? (
        <Avatar
          src={avatarSrc}
          name={displayName}
          size="lg"
          isGroup
          members={participants}
        />
      ) : (
        <UserAvatar
          userId={partner?.id ?? ''}
          src={avatarSrc}
          name={displayName}
          size="lg"
          initialStatus={partner?.status}
          showStatus={false}
        />
      )}

      <div className="mt-3 flex items-center gap-2 justify-center">
        <h2 className="text-base font-semibold text-text-primary text-center">
          {displayName}
        </h2>
        {!isGroup && partner?.status === UserStatus.BANNED && (
          <BannedBadge size="lg" />
        )}
      </div>

      {!isGroup && partner && (
        <UserStatusText
          userId={partner.id}
          initialStatus={partner.status}
          className="text-xs mt-1"
        />
      )}

      {isGroup && (
        <p className="text-xs text-text-secondary mt-1">
          {participants.length} thành viên
        </p>
      )}

      {partner?.bio && (
        <p className="text-xs text-text-tertiary mt-2 text-center max-w-[240px] line-clamp-2 italic">
          "{partner.bio}"
        </p>
      )}
    </div>
  );
};

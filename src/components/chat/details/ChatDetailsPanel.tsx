import React, { useState, useEffect } from 'react';
import { X, Info, Users, Image, Search } from 'lucide-react';
import { RtdbConversation, RtdbMessage, RtdbUserChat, User } from '../../../../shared/types';
import { IconButton, UserAvatar, Avatar, UserStatusText } from '../../ui';
import { ChatDetailsHeader } from './ChatDetailsHeader';
import { ChatDetailsMemberList } from './ChatDetailsMemberList';
import { ChatDetailsMedia } from './ChatDetailsMedia';
import { ChatDetailsSearch } from './ChatDetailsSearch';
import { ChatDetailsActions } from './ChatDetailsActions';
import { useConversationParticipants } from '../../../hooks/chat/useConversationParticipants';

interface ChatDetailsPanelProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  messages: Array<{ id: string; data: RtdbMessage }>;
  currentUserId: string;
  usersMap: Record<string, User>;
  isOpen: boolean;
  isBlocked?: boolean;
  onClose: () => void;
  onToggleMute?: () => void;
  onTogglePin?: () => void;
  onToggleBlock?: () => void;
  onToggleArchive?: () => void;
  onToggleMarkUnread?: () => void;
  onDelete?: () => void;
  onMemberClick?: (userId: string) => void;
  onMessageClick?: (messageId: string) => void;
  onLeaveGroup?: () => void;
  onEditGroup?: () => void;
  onAddMember?: () => void;
  onRemoveMember?: (userId: string) => void;
  onPromoteToAdmin?: (userId: string) => void;
  onDemoteFromAdmin?: (userId: string) => void;
}

type TabId = 'info' | 'members' | 'media' | 'search';

export const ChatDetailsPanel: React.FC<ChatDetailsPanelProps> = ({
  conversation,
  messages,
  currentUserId,
  usersMap,
  isOpen,
  isBlocked,
  onClose,
  onToggleMute,
  onTogglePin,
  onToggleBlock,
  onToggleArchive,
  onToggleMarkUnread,
  onDelete,
  onMemberClick,
  onMessageClick,
  onLeaveGroup,
  onEditGroup,
  onAddMember,
  onRemoveMember,
  onPromoteToAdmin,
  onDemoteFromAdmin
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('info');
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const participantIds = Object.keys(conversation.data.members);
  const participants = useConversationParticipants(participantIds);

  const partnerId = conversation.data.isGroup
    ? null
    : participantIds.find(id => id !== currentUserId);

  const partner = partnerId ? usersMap[partnerId] : null;

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible) return null;

  const tabs: { id: TabId; icon: React.ReactNode; label: string; showFor?: 'group' | 'all' }[] = [
    { id: 'info', icon: <Info size={18} />, label: 'Thông tin', showFor: 'all' },
    { id: 'members', icon: <Users size={18} />, label: 'Thành viên', showFor: 'group' },
    { id: 'media', icon: <Image size={18} />, label: 'Media', showFor: 'all' },
    { id: 'search', icon: <Search size={18} />, label: 'Tìm kiếm', showFor: 'all' },
  ];

  const visibleTabs = tabs.filter(
    tab => tab.showFor === 'all' || (tab.showFor === 'group' && conversation.data.isGroup)
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'info':
        return (
          <>
            <ChatDetailsHeader
              conversation={conversation}
              currentUserId={currentUserId}
              participants={participants}
              partner={partner || undefined}
            />
            <ChatDetailsActions
              conversation={conversation}
              currentUserId={currentUserId}
              participants={participants}
              partner={partner || undefined}
              isBlocked={isBlocked}
              onToggleMute={onToggleMute}
              onTogglePin={onTogglePin}
              onToggleBlock={onToggleBlock}
              onToggleArchive={onToggleArchive}
              onToggleMarkUnread={onToggleMarkUnread}
              onDelete={onDelete}
              onLeaveGroup={onLeaveGroup}
              onEditGroup={onEditGroup}
              onViewProfile={() => partner && onMemberClick?.(partner.id)}
            />
          </>
        );
      case 'members':
        return (
          <ChatDetailsMemberList
            conversation={conversation}
            currentUserId={currentUserId}
            participants={participants}
            onMemberClick={onMemberClick}
            onAddMember={onAddMember}
            onRemoveMember={onRemoveMember}
            onPromoteToAdmin={onPromoteToAdmin}
            onDemoteFromAdmin={onDemoteFromAdmin}
          />
        );
      case 'media':
        return <ChatDetailsMedia messages={messages} onMessageClick={onMessageClick} />;
      case 'search':
        return (
          <ChatDetailsSearch
            messages={messages}
            usersMap={usersMap}
            onMessageClick={onMessageClick}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* Backdrop - Mobile only */}
      <div
        onClick={onClose}
        className={`
          fixed inset-0 bg-bg-overlay backdrop-blur-sm z-40 md:hidden
          transition-all duration-slow
          ${isAnimating ? 'opacity-100' : 'opacity-0'}
        `}
      />

      {/* Panel */}
      <div
        className={`
          fixed md:relative right-0 top-0 h-full z-50
          w-full md:w-[320px] bg-bg-primary border-l border-border-light
          flex flex-col shadow-xl
          transition-all duration-slow ease-out
          ${isAnimating ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-border-light flex-shrink-0">
          <h2 className="text-base font-bold text-text-primary">Chi tiết</h2>
          <IconButton
            onClick={onClose}
            icon={<X size={20} />}
            size="lg"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-light flex-shrink-0">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 flex flex-col items-center gap-1 py-3.5 transition-all duration-base relative
                ${activeTab === tab.id
                  ? 'text-primary'
                  : 'text-text-tertiary hover:text-text-secondary'
                }
              `}
            >
              {tab.icon}
              <span className="text-xs font-medium">{tab.label}</span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'media' ? 'overflow-hidden' : 'overflow-y-auto pb-safe'}`}>
          {renderTabContent()}
        </div>
      </div>
    </>
  );
};

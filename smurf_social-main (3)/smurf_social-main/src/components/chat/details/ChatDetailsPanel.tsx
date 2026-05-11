import React, { useState } from 'react';
import { X, Info, Users, Image, Search } from 'lucide-react';
import { RtdbConversation, RtdbMessage, RtdbUserChat, User } from '../../../../shared/types';
import { IconButton } from '../../ui';
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
  onSetTab?: (tabId: TabId) => void;
  onEditGroup?: () => void;
  onAddMember?: () => void;
  onRemoveMember?: (userId: string) => void;
  onPromoteToAdmin?: (userId: string) => void;
  onDemoteFromAdmin?: (userId: string) => void;
  onApproveMembers?: (uids: string[]) => Promise<void>;
  onRejectMembers?: (uids: string[]) => Promise<void>;
  onToggleApprovalMode?: (enabled: boolean) => Promise<void>;
  onTransferCreator?: () => void;
  onCopyInviteLink?: () => Promise<void>;
  onResetInviteLink?: () => Promise<void>;
}

type TabId = 'info' | 'members' | 'media' | 'search';

/** Bảng thông tin chi tiết hội thoại. */
export const ChatDetailsPanel: React.FC<ChatDetailsPanelProps> = ({
  conversation, messages, currentUserId, usersMap,
  isOpen, isBlocked, onClose,
  onToggleMute, onTogglePin, onToggleBlock, onToggleArchive, onToggleMarkUnread,
  onDelete, onMemberClick, onMessageClick, onLeaveGroup, onEditGroup,
  onAddMember, onRemoveMember, onPromoteToAdmin, onDemoteFromAdmin,
  onApproveMembers, onRejectMembers, onToggleApprovalMode, onTransferCreator,
  onCopyInviteLink, onResetInviteLink,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('info');

  const participantIds = Object.keys(conversation.data.members);
  const participants = useConversationParticipants(participantIds);
  const partnerId = conversation.data.isGroup
    ? null
    : participantIds.find(id => id !== currentUserId);
  const partner = partnerId ? usersMap[partnerId] : null;

  const tabs: { id: TabId; icon: React.ReactNode; label: string; showFor?: 'group' | 'all' }[] = [
    { id: 'info', icon: <Info size={17} />, label: 'Thông tin', showFor: 'all' },
    { id: 'members', icon: <Users size={17} />, label: 'Thành viên', showFor: 'group' },
    { id: 'media', icon: <Image size={17} />, label: 'Media', showFor: 'all' },
    { id: 'search', icon: <Search size={17} />, label: 'Tìm kiếm', showFor: 'all' },
  ];

  const visibleTabs = tabs.filter(
    t => t.showFor === 'all' || (t.showFor === 'group' && conversation.data.isGroup)
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
              partner={partner || undefined}
              isBlocked={isBlocked}
              onToggleMute={onToggleMute}
              onTogglePin={onTogglePin}
              onToggleBlock={onToggleBlock}
              onToggleArchive={onToggleArchive}
              onDelete={onDelete}
              onLeaveGroup={onLeaveGroup}
              onEditGroup={onEditGroup}
              onViewProfile={() => partner && onMemberClick?.(partner.id)}
              onToggleApprovalMode={onToggleApprovalMode}
              onTransferCreator={onTransferCreator}
              onCopyInviteLink={onCopyInviteLink}
              onResetInviteLink={onResetInviteLink}
              onSetTab={setActiveTab}
            />
          </>
        );
      case 'members':
        return (
          <ChatDetailsMemberList
            conversation={conversation}
            currentUserId={currentUserId}
            participants={participants}
            usersMap={usersMap}
            onMemberClick={onMemberClick}
            onAddMember={onAddMember}
            onRemoveMember={onRemoveMember}
            onPromoteToAdmin={onPromoteToAdmin}
            onDemoteFromAdmin={onDemoteFromAdmin}
            onApproveMembers={onApproveMembers}
            onRejectMembers={onRejectMembers}
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

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-bg-overlay backdrop-blur-sm md:hidden"
        style={{ zIndex: 'var(--z-overlay)' }}
      />

      {/* Detail Panel */}
      <div
        className="fixed md:relative right-0 top-0 h-full w-full md:w-[320px] bg-bg-primary border-l border-border-light flex flex-col shadow-xl"
        style={{ zIndex: 'var(--z-modal)' }}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-border-light flex-shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">Chi tiết</h2>
          <IconButton onClick={onClose} icon={<X size={18} />} size="md" />
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-border-light flex-shrink-0">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200 relative outline-none
                ${activeTab === tab.id ? 'text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              {tab.icon}
              <span className="text-[10px] font-medium">{tab.label}</span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'media' ? 'overflow-hidden' : 'overflow-y-auto scroll-hide pb-safe'}`}>
          {renderTabContent()}
        </div>
      </div>
    </>
  );
};

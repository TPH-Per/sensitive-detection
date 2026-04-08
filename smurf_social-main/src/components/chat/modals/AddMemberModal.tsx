import React, { useState, useEffect } from 'react';
import { Search, Check, Loader2, UserPlus } from 'lucide-react';
import { User, RtdbConversation, RtdbUserChat } from '../../../../shared/types';
import { friendService } from '../../../services/friendService';
import { Modal, Input, Button, UserAvatar } from '../../ui';
import { GROUP_LIMITS } from '../../../constants';
import { toast } from '../../../store/toastStore';

interface AddMemberModalProps {
  isOpen: boolean;
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  onClose: () => void;
  onAddMembers: (userIds: string[]) => Promise<void>;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen, conversation, currentUserId, onClose, onAddMembers,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [friends, setFriends] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const existingMemberIds = Object.keys(conversation.data.members);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds([]);
    setSearchTerm('');
    setIsLoading(true);
    friendService.getAllFriends(currentUserId)
      .then(list => setFriends(list.filter(f => !existingMemberIds.includes(f.id))))
      .catch(() => { })
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  const toggleSelect = (userId: string) => {
    const isSelecting = !selectedIds.includes(userId);
    if (isSelecting && existingMemberIds.length + selectedIds.length >= GROUP_LIMITS.MAX_MEMBERS) {
      toast.error(`Nhóm tối đa ${GROUP_LIMITS.MAX_MEMBERS} thành viên`);
      return;
    }
    setSelectedIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAdd = async () => {
    if (selectedIds.length === 0) return;
    setIsAdding(true);
    try {
      await onAddMembers(selectedIds);
      onClose();
    } catch {
      // silent
    } finally {
      setIsAdding(false);
    }
  };

  const filteredFriends = friends.filter(f =>
    f.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Thêm thành viên"
      maxWidth="md"
      fullScreen="mobile"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button
            onClick={handleAdd}
            disabled={selectedIds.length === 0 || isAdding}
            isLoading={isAdding}
          >
            Thêm {selectedIds.length > 0 && `(${selectedIds.length})`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 min-h-0">
        {/* Member count */}
        <p className="text-xs text-text-secondary">
          Số thành viên hiện tại:{' '}
          <span className="font-semibold text-text-primary">{existingMemberIds.length}</span>
          <span className="text-text-tertiary"> / {GROUP_LIMITS.MAX_MEMBERS}</span>
        </p>

        {/* Search */}
        <Input
          icon={<Search size={15} />}
          placeholder="Tìm bạn bè..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-bg-secondary"
        />

        {/* List */}
        <div className="overflow-y-auto scroll-hide min-h-0 max-h-72 space-y-0.5">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-primary" size={22} />
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <UserPlus size={32} className="text-text-tertiary mb-2" />
              <p className="text-sm text-text-tertiary">
                {searchTerm
                  ? 'Không tìm thấy bạn bè'
                  : friends.length === 0
                    ? 'Tất cả bạn bè đã trong nhóm'
                    : 'Không có bạn bè để thêm'
                }
              </p>
            </div>
          ) : (
            filteredFriends.map(friend => {
              const isSelected = selectedIds.includes(friend.id);
              return (
                <div
                  key={friend.id}
                  onClick={() => toggleSelect(friend.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-200
                    ${isSelected ? 'bg-primary/10' : 'hover:bg-bg-hover'}`}
                >
                  <UserAvatar
                    userId={friend.id}
                    src={friend.avatar?.url}
                    name={friend.fullName}
                    size="sm"
                    initialStatus={friend.status}
                  />
                  <span className="flex-1 text-sm font-medium text-text-primary truncate">
                    {friend.fullName}
                  </span>
                  {isSelected && (
                    <div className="w-5 h-5 btn-gradient rounded-full flex items-center justify-center flex-shrink-0">
                      <Check size={11} className="text-white" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};

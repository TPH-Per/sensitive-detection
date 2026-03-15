import React, { useState } from 'react';
import { LogOut, Loader2, Users } from 'lucide-react';
import { User, RtdbConversation, RtdbUserChat } from '../../../../shared/types';
import { Modal, Button, UserAvatar, Select } from '../../ui';
import { useConversationParticipants } from '../../../hooks/chat/useConversationParticipants';

interface TransferAdminModalProps {
  isOpen: boolean;
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  onClose: () => void;
  onConfirm: (newAdminId: string) => Promise<void>;
}

export const TransferAdminModal: React.FC<TransferAdminModalProps> = ({
  isOpen,
  conversation,
  currentUserId,
  onClose,
  onConfirm
}) => {
  const [selectedId, setSelectedId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const participants = useConversationParticipants(Object.keys(conversation.data.members));

  // Lấy danh sách thành viên khác để chọn làm admin mới
  const otherMembers = participants.filter(p => p.id !== currentUserId);

  const options = otherMembers.map(member => ({
    value: member.id,
    label: member.fullName
  }));

  const handleConfirm = async () => {
    if (!selectedId) return;

    setIsSubmitting(true);
    try {
      await onConfirm(selectedId);
      onClose();
    } catch (error) {
      console.error('Lỗi chuyển quyền trưởng nhóm', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedMember = otherMembers.find(m => m.id === selectedId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chuyển quyền trưởng nhóm"
      maxWidth="sm"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!selectedId || isSubmitting}
            isLoading={isSubmitting}
            icon={<LogOut size={18} />}
          >
            Chuyển quyền và rời nhóm
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center">
            <LogOut size={32} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">
              Bạn đang là trưởng nhóm
            </h3>
            <p className="text-sm text-text-secondary mt-1">
              Vui lòng chọn một thành viên khác làm trưởng nhóm trước khi rời khỏi nhóm này.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Select
            label="Chọn trưởng nhóm mới"
            options={options}
            value={selectedId}
            onChange={setSelectedId}
            placeholder="Tìm chọn thành viên..."
          />

          {selectedMember && (
            <div className="flex items-center gap-3 p-4 bg-bg-secondary rounded-xl border border-border-light">
              <UserAvatar
                userId={selectedMember.id}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-primary truncate">
                  {selectedMember.fullName}
                </p>
                <p className="text-xs text-text-tertiary">
                  Sẽ trở thành trưởng nhóm mới
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

import React, { useState } from 'react';
import { Crown } from 'lucide-react';
import { RtdbConversation, RtdbUserChat } from '../../../../shared/types';
import { Modal, Button, UserAvatar, Select } from '../../ui';
import { useConversationParticipants } from '../../../hooks/chat/useConversationParticipants';

interface TransferCreatorModalProps {
  isOpen: boolean;
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  onClose: () => void;
  onConfirm: (newCreatorId: string) => Promise<void>;
  preselectedUserId?: string | null;
}

export const TransferCreatorModal: React.FC<TransferCreatorModalProps> = ({
  isOpen, conversation, currentUserId, onClose, onConfirm, preselectedUserId
}) => {
  const [selectedId, setSelectedId] = useState(preselectedUserId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update selected ID if preselectedUserId changes while modal is opening
  React.useEffect(() => {
    if (isOpen && preselectedUserId) setSelectedId(preselectedUserId);
  }, [isOpen, preselectedUserId]);

  const participants = useConversationParticipants(Object.keys(conversation.data.members));
  const otherMembers = participants.filter(p => p.id !== currentUserId);
  const options = otherMembers.map(m => ({ value: m.id, label: m.fullName }));
  const selectedMember = otherMembers.find(m => m.id === selectedId);

  const handleConfirm = async () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    try {
      await onConfirm(selectedId);
      onClose();
    } catch { /* silent */ }
    finally { setIsSubmitting(false); }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chuyển quyền Trưởng nhóm"
      maxWidth="sm"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!selectedId || isSubmitting}
            isLoading={isSubmitting}
            icon={<Crown size={16} />}
          >
            Chuyển quyền
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 bg-warning/10 rounded-full flex items-center justify-center border border-warning/20">
            <Crown size={26} className="text-warning" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">Chuyển quyền sở hữu nhóm</h3>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">
              Bạn sẽ mất quyền Trưởng nhóm và trở thành Quản trị viên (Admin) bình thường. Hành động này không thể hoàn tác nếu người kia không chuyển lại cho bạn.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {!preselectedUserId && (
            <Select
              label="Chọn trưởng nhóm mới"
              options={options}
              value={selectedId}
              onChange={setSelectedId}
              placeholder="Chọn thành viên..."
              size="lg"
            />
          )}

          {selectedMember && (
            <div className="flex items-center gap-3 p-3 bg-bg-secondary rounded-xl border border-border-light animate-fade-in">
              <UserAvatar userId={selectedMember.id} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {selectedMember.fullName}
                </p>
                <p className="text-xs text-text-tertiary">Sẽ trở thành Trưởng nhóm mới</p>
              </div>
              <Crown size={14} className="text-warning flex-shrink-0" />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

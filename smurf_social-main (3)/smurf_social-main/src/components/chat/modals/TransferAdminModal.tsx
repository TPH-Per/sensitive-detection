import React, { useState } from 'react';
import { LogOut, Crown } from 'lucide-react';
import { RtdbConversation, RtdbUserChat } from '../../../../shared/types';
import { Modal, Button, UserAvatar, Select } from '../../ui';
import { useConversationParticipants } from '../../../hooks/chat/useConversationParticipants';

interface TransferAdminModalProps {
  isOpen: boolean;
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  mode?: 'transfer_only' | 'transfer_and_leave';
  onClose: () => void;
  onConfirm: (newAdminId: string) => Promise<void>;
}

/** Modal chuyển quyền trưởng nhóm chat */
export const TransferAdminModal: React.FC<TransferAdminModalProps> = ({
  isOpen, conversation, currentUserId, mode = 'transfer_and_leave', onClose, onConfirm,
}) => {
  const [selectedId, setSelectedId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const participants = useConversationParticipants(Object.keys(conversation.data.members));
  const otherMembers = participants.filter(p => p.id !== currentUserId);
  const options = otherMembers.map(m => ({ value: m.id, label: m.fullName }));
  const selectedMember = otherMembers.find(m => m.id === selectedId);

  const isTransferOnly = mode === 'transfer_only';

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
      title={isTransferOnly ? 'Chuyển quyền trưởng nhóm' : 'Chọn trưởng nhóm mới'}
      maxWidth="sm"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!selectedId || isSubmitting}
            isLoading={isSubmitting}
            icon={isTransferOnly ? <Crown size={16} /> : <LogOut size={16} />}
          >
            {isTransferOnly ? 'Chuyển quyền' : 'Chuyển quyền và rời nhóm'}
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
            <h3 className="text-base font-semibold text-text-primary">Bạn đang là trưởng nhóm</h3>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">
              {isTransferOnly
                ? 'Chọn thành viên để chuyển quyền trưởng nhóm. Bạn sẽ trở thành Admin sau khi chuyển.'
                : 'Vui lòng chọn một thành viên khác làm trưởng nhóm trước khi rời khỏi nhóm này.'
              }
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Select
            label="Chọn trưởng nhóm mới"
            options={options}
            value={selectedId}
            onChange={setSelectedId}
            placeholder="Chọn thành viên..."
            size="lg"
          />

          {selectedMember && (
            <div className="flex items-center gap-3 p-3 bg-bg-secondary rounded-xl border border-border-light animate-fade-in">
              <UserAvatar userId={selectedMember.id} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {selectedMember.fullName}
                </p>
                <p className="text-xs text-text-tertiary">Sẽ trở thành trưởng nhóm mới</p>
              </div>
              <Crown size={14} className="text-warning flex-shrink-0" />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

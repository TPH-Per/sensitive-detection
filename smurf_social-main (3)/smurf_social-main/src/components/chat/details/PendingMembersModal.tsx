import React, { useState } from 'react';
import { User, RtdbConversation } from '../../../../shared/types';
import { Modal, UserAvatar, ConfirmDialog, Button } from '../../ui';
import { Check, X, Users } from 'lucide-react';
import { CONFIRM_MESSAGES } from '../../../constants/confirmMessages';

interface PendingMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: { id: string; data: RtdbConversation };
  usersMap: Record<string, User>;
  onApproveMembers?: (uids: string[]) => Promise<void>;
  onRejectMembers?: (uids: string[]) => Promise<void>;
}

/** Modal phê duyệt thành viên chờ tham gia nhóm */
export const PendingMembersModal: React.FC<PendingMembersModalProps> = ({
  isOpen,
  onClose,
  conversation,
  usersMap,
  onApproveMembers,
  onRejectMembers,
}) => {
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [confirmApproveAll, setConfirmApproveAll] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const pendingMembers = conversation.data.pendingMembers || {};
  const pendingEntries = Object.entries(pendingMembers);

  /* Approve All Pending Members */
  const handleApproveAll = async () => {
    const uids = pendingEntries.map(([uid]) => uid);
    setIsProcessing(true);
    try {
      await onApproveMembers?.(uids);
      setConfirmApproveAll(false);
      if (pendingEntries.length <= uids.length) onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  /* Approve Single Member */
  const handleApproveSingle = async (uid: string) => {
    setIsProcessing(true);
    try {
      await onApproveMembers?.([uid]);
      if (pendingEntries.length === 1) onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  /* Reject Single Member */
  const handleRejectSingle = async () => {
    if (!confirmReject) return;
    setIsProcessing(true);
    try {
      await onRejectMembers?.([confirmReject]);
      setConfirmReject(null);
      if (pendingEntries.length === 1) onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Yêu cầu tham gia"
        maxWidth="md"
        padding="none"
      >
        <div className="flex flex-col max-h-[70vh]">
          {/* Sub Header */}
          <div className="px-4 py-3 bg-bg-secondary/50 border-b border-border-light flex items-center justify-between">
            <div className="flex items-center gap-2 text-text-secondary">
              <Users size={16} />
              <span className="text-sm font-medium">
                {pendingEntries.length} người đang chờ duyệt
              </span>
            </div>
            {pendingEntries.length > 1 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setConfirmApproveAll(true)}
                disabled={isProcessing}
              >
                Duyệt tất cả
              </Button>
            )}
          </div>

          {/* Members List */}
          <div className="overflow-y-auto">
            {pendingEntries.length > 0 ? (
              pendingEntries.map(([uid, info]) => {
                const user = usersMap[uid];
                const inviterName = usersMap[info.addedBy]?.fullName || 'Thành viên';
                return (
                  <div
                    key={uid}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-bg-hover transition-colors border-b border-border-light last:border-0"
                  >
                    <UserAvatar userId={uid} src={user?.avatar?.url} name={user?.fullName} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {user?.fullName || 'Người dùng'}
                      </p>
                      <p className="text-xs text-text-tertiary truncate mt-0.5">
                        Được mời bởi <span className="text-text-secondary font-medium">{inviterName}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApproveSingle(uid)}
                        disabled={isProcessing}
                        className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors text-xs font-bold disabled:opacity-50"
                      >
                        <Check size={14} />
                        Duyệt
                      </button>
                      <button
                        onClick={() => setConfirmReject(uid)}
                        disabled={isProcessing}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-bg-secondary text-text-tertiary hover:bg-error/10 hover:text-error transition-colors disabled:opacity-50"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-bg-secondary flex items-center justify-center mb-3 text-text-tertiary">
                  <Check size={24} />
                </div>
                <p className="text-sm font-medium text-text-primary">Không có yêu cầu nào</p>
                <p className="text-xs text-text-tertiary mt-1">Tất cả yêu cầu đã được xử lý</p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Reject Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!confirmReject}
        onClose={() => setConfirmReject(null)}
        onConfirm={handleRejectSingle}
        title={CONFIRM_MESSAGES.CHAT.REJECT_MEMBER.TITLE}
        message={CONFIRM_MESSAGES.CHAT.REJECT_MEMBER.MESSAGE(
          confirmReject ? (usersMap[confirmReject]?.fullName || 'người dùng này') : ''
        )}
        confirmLabel={CONFIRM_MESSAGES.CHAT.REJECT_MEMBER.CONFIRM}
        variant="danger"
      />

      {/* Approve All Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmApproveAll}
        onClose={() => setConfirmApproveAll(false)}
        onConfirm={handleApproveAll}
        title={CONFIRM_MESSAGES.CHAT.APPROVE_ALL_PENDING.TITLE}
        message={CONFIRM_MESSAGES.CHAT.APPROVE_ALL_PENDING.MESSAGE(pendingEntries.length)}
        confirmLabel={CONFIRM_MESSAGES.CHAT.APPROVE_ALL_PENDING.CONFIRM}
      />
    </>
  );
};

import React from 'react';
import { User } from '../../../../shared/types';
import { UserAvatar, Modal, Button } from '../../ui';
import { Check, X, Clock, Users } from 'lucide-react';
import { formatRelativeTime } from '../../../utils/dateUtils';

interface PendingMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingMembers: Record<string, { addedBy: string; timestamp: number }>;
  usersMap: Record<string, User>;
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
}

export const PendingMembersModal: React.FC<PendingMembersModalProps> = ({
  isOpen,
  onClose,
  pendingMembers,
  usersMap,
  onApprove,
  onReject,
}) => {
  const pendingUids = Object.keys(pendingMembers);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Duyệt thành viên"
      maxWidth="sm"
    >
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
        {pendingUids.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mb-4">
              <Users size={32} className="text-text-tertiary" />
            </div>
            <p className="text-sm font-medium text-text-primary">Không có yêu cầu nào</p>
            <p className="text-xs text-text-tertiary mt-1">
              Tất cả các yêu cầu tham gia đã được xử lý
            </p>
          </div>
        ) : (
          pendingUids.map((uid) => {
            const user = usersMap[uid];
            const info = pendingMembers[uid];
            const addedBy = usersMap[info.addedBy];

            return (
              <div
                key={uid}
                className="flex items-center gap-3 p-3 bg-bg-secondary rounded-xl border border-border-light hover:border-primary/20 transition-all duration-200"
              >
                <UserAvatar userId={uid} size="md" />
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {user?.fullName || 'Người dùng'}
                  </p>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    Được mời bởi <span className="font-medium text-text-secondary">{addedBy?.fullName || 'Thành viên'}</span>
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-text-tertiary">
                    <Clock size={10} />
                    <span>{formatRelativeTime(info.timestamp)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-8 h-8 !p-0 rounded-full border-border-light"
                    onClick={() => onReject(uid)}
                    title="Từ chối"
                  >
                    <X size={14} />
                  </Button>
                  <Button
                    size="sm"
                    className="w-8 h-8 !p-0 rounded-full"
                    onClick={() => onApprove(uid)}
                    title="Duyệt"
                  >
                    <Check size={14} />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose} className="w-full">
          Đóng
        </Button>
      </div>
    </Modal>
  );
};

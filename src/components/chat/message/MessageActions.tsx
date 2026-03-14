import React from 'react';
import { MoreVertical, Reply, Forward, RotateCcw, Edit2, Trash2 } from 'lucide-react';

import { RtdbMessage, MessageType } from '../../../../shared/types';
import { IconButton, Dropdown, DropdownItem } from '../../ui';

interface MessageActionsProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  canEdit: boolean;
  showMenu: boolean;
  setShowMenu: (show: boolean) => void;
  onReply?: (message: { id: string; data: RtdbMessage }) => void;
  onForward?: (message: { id: string; data: RtdbMessage }) => void;
  onEdit?: (message: { id: string; data: RtdbMessage }) => void;
  setShowRecallConfirm: (show: boolean) => void;
  onDeleteForMe?: (messageId: string) => void;
  isBlocked: boolean;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  message,
  isMe,
  canEdit,
  showMenu,
  setShowMenu,
  onReply,
  onForward,
  onEdit,
  setShowRecallConfirm,
  onDeleteForMe,
  isBlocked,
}) => {
  return (
    <div className={`absolute top-0 opacity-0 group-hover/message:opacity-100 transition-all duration-base flex items-center gap-1 ${isMe ? 'right-full mr-2' : 'left-full ml-2'}`}>
      <Dropdown
        isOpen={showMenu}
        onOpenChange={setShowMenu}
        disableTriggerScale
        align={isMe ? 'right' : 'left'}
        trigger={
          <IconButton
            icon={<MoreVertical size={14} />}
            size="sm"
            className={`${showMenu ? 'opacity-100' : ''}`}
          />
        }
      >
        {message.data.type !== 'call' && (
          <>
            {!isBlocked && (
              <DropdownItem
                icon={<Reply size={14} />}
                label="Trả lời"
                onClick={() => {
                  onReply?.(message);
                  setShowMenu(false);
                }}
              />
            )}
            <DropdownItem
              icon={<Forward size={14} />}
              label="Chuyển tiếp"
              onClick={() => {
                onForward?.(message);
                setShowMenu(false);
              }}
            />
            {!isBlocked && canEdit && (
              <DropdownItem
                icon={<Edit2 size={14} />}
                label="Chỉnh sửa"
                onClick={() => {
                  onEdit?.(message);
                  setShowMenu(false);
                }}
              />
            )}
            {!isBlocked && isMe && (
              <DropdownItem
                icon={<RotateCcw size={14} />}
                label="Thu hồi"
                className="!text-warning hover:!text-warning"
                onClick={() => {
                  setShowRecallConfirm(true);
                  setShowMenu(false);
                }}
              />
            )}
          </>
        )}
        {!isBlocked && (
          <DropdownItem
            icon={<Trash2 size={14} />}
            label="Xóa phía tôi"
            variant="danger"
            onClick={() => {
              onDeleteForMe?.(message.id);
              setShowMenu(false);
            }}
          />
        )}
      </Dropdown>
    </div>
  );
};

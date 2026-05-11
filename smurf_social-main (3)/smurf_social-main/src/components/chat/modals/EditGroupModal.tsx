import React, { useState, useRef, useEffect } from 'react';
import { Camera, Users } from 'lucide-react';
import { RtdbConversation, RtdbUserChat, MediaObject, Visibility } from '../../../../shared/types';
import { Modal, Input, Button, ImageCropper } from '../../ui';
import { toast } from '../../../store/toastStore';
import { TOAST_MESSAGES } from '../../../constants';
import { validateFile } from '../../../utils';
import { useConversationParticipants } from '../../../hooks/chat/useConversationParticipants';
import { rtdbGroupService } from '../../../services/chat/rtdbGroupService';

interface EditGroupModalProps {
  isOpen: boolean;
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  onClose: () => void;
  onSave: (updates: { name?: string; avatar?: MediaObject }) => Promise<void>;
}

/** Modal chỉnh sửa thông tin nhóm chat */
export const EditGroupModal: React.FC<EditGroupModalProps> = ({
  isOpen, conversation, currentUserId, onClose, onSave,
}) => {
  const [groupName, setGroupName] = useState(conversation.data.name || '');
  const [groupAvatar] = useState(conversation.data.avatar?.url || '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (!isOpen) return;
    setGroupName(conversation.data.name || '');
    setPreviewUrl(null);
    setPendingFile(null);
    setShowCropper(false);
    setCropImage(null);
  }, [isOpen, conversation]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateFile(file, 'AVATAR');
      if (!validation.isValid) { if (validation.error) toast.error(validation.error); return; }
      setCropImage(URL.createObjectURL(file));
      setShowCropper(true);
    }
    e.target.value = '';
  };

  const handleCropComplete = (croppedFile: File, _visibility: Visibility) => {
    if (cropImage) URL.revokeObjectURL(cropImage);
    setPreviewUrl(URL.createObjectURL(croppedFile));
    setPendingFile(croppedFile);
    setShowCropper(false);
    setCropImage(null);
  };

  const handleCropCancel = () => {
    if (cropImage) URL.revokeObjectURL(cropImage);
    setCropImage(null);
    setShowCropper(false);
  };

  const handleSave = async () => {
    const trimmedName = groupName.trim();
    if (!trimmedName) return;
    setIsSaving(true);
    try {
      const updates: { name?: string; avatar?: MediaObject } = {};
      if (trimmedName !== conversation.data.name) updates.name = trimmedName;
      if (pendingFile) {
        updates.avatar = await rtdbGroupService.uploadGroupAvatar(conversation.id, pendingFile);
      }
      await onSave(updates);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      onClose();
    } catch {
      toast.error(TOAST_MESSAGES.CHAT.UPDATE_GROUP_FAILED);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = groupName.trim() !== conversation.data.name || previewUrl !== null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Chỉnh sửa nhóm"
        maxWidth="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>Hủy</Button>
            <Button
              onClick={handleSave}
              disabled={!groupName.trim() || !hasChanges || isSaving}
              isLoading={isSaving}
            >
              Lưu thay đổi
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Group Avatar */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
                {previewUrl || groupAvatar
                  ? <img src={previewUrl || groupAvatar} alt="Group avatar" className="w-full h-full object-cover" />
                  : <Users size={30} className="text-primary" />
                }
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-7 h-7 btn-gradient rounded-full flex items-center justify-center shadow-accent border-2 border-bg-primary"
              >
                <Camera size={13} className="text-white" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            </div>
            <p className="text-xs text-text-tertiary mt-2">Nhấn để thay đổi ảnh nhóm</p>
          </div>

          {/* Group Name */}
          <Input
            label="Tên nhóm"
            placeholder="Nhập tên nhóm..."
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="bg-bg-secondary"
          />

        </div>
      </Modal>

      {showCropper && cropImage && (
        <ImageCropper
          isOpen={showCropper}
          image={cropImage}
          aspect={1}
          title="Cắt ảnh nhóm"
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
};

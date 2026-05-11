import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Video } from 'lucide-react';
import { PostModal } from './modals/PostModal';
import { User, Visibility, MediaObject } from '../../../shared/types';
import { Avatar, Skeleton } from '../ui';
import { usePostStore } from '../../store';

import { toast } from '../../store/toastStore';
import { validateFile } from '../../utils/uploadUtils';
import { MEDIA_CONSTRAINTS, TOAST_MESSAGES } from '../../constants';

interface CreatePostProps {
  currentUser: User;
}

export const CreatePost: React.FC<CreatePostProps> & { Skeleton: React.FC } = ({ currentUser }) => {
  const { createPost } = usePostStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const onMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const isVideo = e.target.accept.includes('video');
    const limit = isVideo ? MEDIA_CONSTRAINTS.MAX_VIDEOS_PER_POST : MEDIA_CONSTRAINTS.MAX_IMAGES_PER_POST;
    const typeLabel = isVideo ? 'VIDEO' : 'IMAGE';

    let selectedFiles = files;
    if (files.length > limit) {
      toast.error(isVideo
        ? TOAST_MESSAGES.POST.VIDEO_LIMIT(limit)
        : TOAST_MESSAGES.POST.MEDIA_LIMIT(limit)
      );
      selectedFiles = files.slice(0, limit);
    }

    const validFiles: File[] = [];
    selectedFiles.forEach(file => {
      const validation = validateFile(file, typeLabel as any);
      if (validation.isValid) {
        validFiles.push(file);
      } else if (validation.error) {
        toast.error(validation.error);
      }
    });

    if (validFiles.length > 0) {
      setPendingFiles(validFiles);
      setShowCreateModal(true);
    }
    
    e.target.value = '';
  };

  const handleCreatePost = (
    content: string,
    media: MediaObject[],
    visibility: Visibility,
    pendingFiles?: File[]
  ) => {
    createPost(currentUser.id, content, media, visibility, pendingFiles);
    setPendingFiles([]);
  };

  const handleClose = () => {
    setShowCreateModal(false);
    setPendingFiles([]);
  };

  return (
    <>
      <div className="bg-bg-primary rounded-2xl border border-border-light transition-theme mb-3 md:mb-4 overflow-hidden">
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <Avatar src={currentUser.avatar?.url} name={currentUser.fullName} size="md" />
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 text-left px-4 h-11 bg-bg-secondary hover:bg-bg-hover rounded-full text-sm text-text-tertiary font-medium transition-all duration-200 border border-border-light hover:border-primary/30 truncate"
          >
            {currentUser.fullName} ơi, bạn đang nghĩ gì thế?
          </button>
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-border-light" />

        {/* Action buttons */}
        <div className="flex px-2 py-1.5">
          <ActionBtn
            icon={<ImageIcon size={19} className="text-success" />}
            label="Ảnh"
            onClick={() => imageInputRef.current?.click()}
          />
          <ActionBtn
            icon={<Video size={19} className="text-info" />}
            label="Video"
            onClick={() => videoInputRef.current?.click()}
          />
        </div>

        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onMediaSelect} />
        <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={onMediaSelect} />
      </div>

      <PostModal
        isOpen={showCreateModal}
        onClose={handleClose}
        currentUser={currentUser}
        initialFiles={pendingFiles}
        onSubmit={handleCreatePost}
      />
    </>
  );
};

/* ── Reusable action button ── */
const ActionBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({
  icon, label, onClick,
}) => (
  <button
    onClick={onClick}
    className="flex-1 flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold text-text-secondary hover:bg-bg-hover active:bg-bg-active transition-all duration-200"
  >
    {icon}
    <span className="hidden xs:inline sm:inline">{label}</span>
  </button>
);

CreatePost.Skeleton = () => (
  <div className="bg-bg-primary rounded-2xl border border-border-light transition-theme mb-3 md:mb-4 overflow-hidden">
    <div className="flex items-center gap-3 px-4 pt-4 pb-3">
      <Skeleton variant="circle" width={40} height={40} />
      <div className="flex-1">
        <Skeleton variant="rect" height={44} className="w-full rounded-full" />
      </div>
    </div>
    <div className="mx-4 border-t border-border-light" />
    <div className="flex px-2 py-1.5">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex-1 flex justify-center py-2.5">
          <Skeleton width={56} height={16} />
        </div>
      ))}
    </div>
  </div>
);

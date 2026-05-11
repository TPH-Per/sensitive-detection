import React from 'react';
import { FileText, Download, FileVideo, Archive, FileCode, FileType, Paperclip } from 'lucide-react';
import { RtdbMessage } from '../../../../../shared/types';
import { LazyImage, LazyVideo } from '../../../ui';
import { downloadFile } from '../../../../utils';

interface FileMessageProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  uploadProgress?: { progress: number; error?: boolean };
  onOpenImage: (index: number) => void;
}

const getFileStyle = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  const baseStyles: Record<string, any> = {
    pdf: {
      icon: <FileText size={18} />,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-500/10',
      border: 'border-red-100 dark:border-red-500/20',
      label: 'PDF'
    },
    doc: {
      icon: <FileText size={18} />,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      border: 'border-blue-100 dark:border-blue-500/20',
      label: 'DOC'
    },
    xlsx: {
      icon: <FileType size={18} />,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-500/10',
      border: 'border-green-100 dark:border-green-500/20',
      label: 'SHEET'
    },
    zip: {
      icon: <Archive size={18} />,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      border: 'border-amber-100 dark:border-amber-500/20',
      label: 'ARCH'
    },
    code: {
      icon: <FileCode size={18} />,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-500/10',
      border: 'border-purple-100 dark:border-purple-500/20',
      label: 'CODE'
    }
  };

  if (['pdf'].includes(ext)) return baseStyles.pdf;
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return baseStyles.doc;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return baseStyles.xlsx;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return baseStyles.zip;
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'py', 'go'].includes(ext)) return baseStyles.code;

  return {
    icon: <Paperclip size={18} />,
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-500/10',
    border: 'border-slate-100 dark:border-slate-500/20',
    label: ext.toUpperCase().slice(0, 4) || 'FILE'
  };
};

export const FileMessage: React.FC<FileMessageProps> = ({ 
  message, isMe, uploadProgress, onOpenImage 
}) => {
  const fileData = message.data.media?.[0];
  const fileUrl = fileData?.url || '';
  const fileName = fileData?.fileName || 'Tài liệu';
  const fileMime = fileData?.mimeType || '';
  const fileSize = fileData?.size ? `${(fileData.size / 1024).toFixed(1)} KB` : 'N/A';
  const isUploading = isMe && uploadProgress && !fileUrl;
  
  const isImageFile = fileMime.startsWith('image/');
  const isVideoFile = fileMime.startsWith('video/');

  const fileStyle = getFileStyle(fileName);

  const containerClass = `flex flex-col gap-2 p-2.5 rounded-2xl border max-w-[320px] shadow-sm transition-all duration-200 ${
    isMe ? 'bg-bg-message-sent border-primary/20' : 'bg-bg-message-received border-border-light'
  }`;

  if (isUploading) {
    return (
      <div className={`relative flex items-center gap-3 p-3 rounded-2xl border w-full max-w-xs ${isMe ? 'bg-bg-message-sent border-primary/20' : 'bg-bg-message-received border-border-light'}`}>
        <div className={`w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl ${isMe ? 'bg-primary/10' : 'bg-bg-secondary'}`}>
          <FileText size={20} className={isMe ? 'text-primary' : 'text-text-secondary'} opacity={0.6} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate text-sm text-text-primary mb-0.5">{fileName}</div>
          <div className="text-[10px] opacity-60 font-medium">{fileSize}</div>
        </div>
        <div className="absolute inset-x-3 bottom-0 translate-y-1/2 flex flex-col items-center">
          <div className="w-full bg-bg-primary h-1 rounded-full overflow-hidden shadow-sm border border-border-light">
            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress.progress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      {(isImageFile || isVideoFile) && fileUrl && (
        <div 
          className="rounded-xl overflow-hidden cursor-pointer bg-black/5 aspect-video flex items-center justify-center group relative shadow-inner" 
          onClick={() => isImageFile ? onOpenImage(0) : undefined}
        >
          {isImageFile
            ? <LazyImage src={fileUrl} alt={fileName} className="w-full h-full object-cover" />
            : (
              <div className="relative w-full h-full">
                <LazyVideo src={fileUrl} className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                  <div className="w-11 h-11 rounded-full bg-white/30 backdrop-blur-md border border-white/40 flex items-center justify-center shadow-lg transition-transform active:scale-95">
                    <FileVideo size={22} className="text-white" />
                  </div>
                </div>
              </div>
            )
          }
        </div>
      )}
      
      <div className="flex items-center gap-3 px-1">
        <div className={`w-11 h-11 flex-shrink-0 flex flex-col items-center justify-center rounded-xl shadow-sm border ${fileStyle.bg} ${fileStyle.color} ${fileStyle.border}`}>
          {fileStyle.icon}
          <span className="text-[8px] font-bold mt-0.5 opacity-80 uppercase tracking-tighter">{fileStyle.label}</span>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate text-[13px] text-text-primary mb-0.5 leading-tight">{fileName}</div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-tertiary uppercase tracking-tight">
            <span>{fileSize}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-current opacity-40"></span>
            <span>{fileName.split('.').pop() || 'FILE'}</span>
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); downloadFile(fileUrl, fileName); }}
          className={`w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 border shadow-sm ${
            isMe 
              ? 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20' 
              : 'bg-bg-primary hover:bg-bg-hover text-text-secondary border-border-light'
          }`}
          title="Tải về"
        >
          <Download size={16} />
        </button>
      </div>
      
      {/* Timestamp integrated inside card */}
      <div className={`px-1 flex justify-end text-[10px] font-bold tracking-tight opacity-40 ${isMe ? 'text-primary' : 'text-text-tertiary'}`}>
        {new Date(message.data.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
};

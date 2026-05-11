import React from 'react';
import { X, Play, Pause, Paperclip, Video, FileText, Archive, FileCode, FileType } from 'lucide-react';
import { CircularProgressOverlay } from '../../ui/CircularProgress';

export interface FilePreviewItem {
  id: string;
  file: File;
  preview?: string;
  type: 'image' | 'video' | 'file' | 'voice';
  uploadProgress?: number;
  duration?: number;
}

interface FilePreviewProps {
  files: FilePreviewItem[];
  onRemove: (index: number) => void;
  onPlayVoice: (url: string, index: number) => void;
  playingIndex: number | null;
  isSending: boolean;
}

const getFileStyle = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  const baseStyles: Record<string, any> = {
    pdf: {
      icon: <FileText size={20} />,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-500/10',
      border: 'border-red-100 dark:border-red-500/20',
      label: 'PDF'
    },
    doc: {
      icon: <FileText size={20} />,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      border: 'border-blue-100 dark:border-blue-500/20',
      label: 'DOC'
    },
    xlsx: {
      icon: <FileType size={20} />,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-500/10',
      border: 'border-green-100 dark:border-green-500/20',
      label: 'SHEET'
    },
    zip: {
      icon: <Archive size={20} />,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      border: 'border-amber-100 dark:border-amber-500/20',
      label: 'ARCH'
    },
    code: {
      icon: <FileCode size={20} />,
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
    icon: <Paperclip size={20} />,
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-500/10',
    border: 'border-slate-100 dark:border-slate-500/20',
    label: ext.toUpperCase().slice(0, 4) || 'FILE'
  };
};

/** Hiển thị danh sách tệp đính kèm trước khi gửi */
export const FilePreview: React.FC<FilePreviewProps> = ({
  files, onRemove, onPlayVoice, playingIndex, isSending,
}) => {
  if (files.length === 0) return null;

  return (
    <div className="px-3 pt-3 pb-3 border-b border-border-light bg-bg-primary overflow-x-auto scroll-hide">
      <div className="flex gap-3">
        {files.map((item, index) => {
          const fileStyle = item.type === 'file' ? getFileStyle(item.file.name) : null;
          
          return (
            <div
              key={item.id}
              className="relative flex-shrink-0 group"
            >
              <div className={`w-[72px] h-[72px] rounded-xl border overflow-hidden transition-all duration-200
                ${item.type === 'file' ? `${fileStyle?.bg} ${fileStyle?.border}` : 'bg-bg-secondary border-border-light'}`}
              >
                {item.preview ? (
                  item.type === 'video' ? (
                    <div className="w-full h-full relative">
                      <video src={item.preview} className="w-full h-full object-cover" playsInline muted />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Video size={18} className="text-white" />
                      </div>
                    </div>
                  ) : item.type === 'voice' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2 relative bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20">
                      <button
                        type="button"
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 border shadow-sm
                          ${playingIndex === index ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-bg-primary text-primary border-blue-100 dark:border-blue-500/30'}`}
                        onClick={() => item.preview && onPlayVoice(item.preview, index)}
                      >
                        {playingIndex === index
                          ? <Pause size={14} fill="currentColor" />
                          : <Play size={14} fill="currentColor" className="ml-0.5" />
                        }
                      </button>
                      <div className="flex items-center justify-center">
                        {item.duration !== undefined && (
                          <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100/50 dark:bg-blue-500/20 px-2 py-0.5 rounded-full">
                            {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <img src={item.preview} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2 relative">
                    <div className={`${fileStyle?.color}`}>
                      {fileStyle?.icon}
                    </div>
                    <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/50 dark:bg-black/10 ${fileStyle?.color}`}>
                      {fileStyle?.label}
                    </div>
                  </div>
                )}

                {isSending && (item.type === 'image' || item.type === 'video') && (
                  <CircularProgressOverlay
                    isVisible
                    progress={item.uploadProgress ?? 0}
                    size={32}
                    showPercentage={false}
                  />
                )}
              </div>

              {/* File Name Display Below */}
              {item.type === 'file' && (
                <div className="mt-1.5 px-0.5">
                  <p className="text-[10px] text-text-secondary font-medium truncate w-[72px] text-center">
                    {item.file.name}
                  </p>
                </div>
              )}

              {!isSending && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 flex items-center justify-center bg-white dark:bg-bg-tertiary text-text-primary rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 hover:bg-bg-hover transform hover:scale-105 border border-border-light"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

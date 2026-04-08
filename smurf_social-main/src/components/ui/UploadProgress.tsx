import React from 'react';
import { formatBytes } from '../../utils/uploadUtils';

interface UploadProgressProps {
  progress: number;
  bytesTransferred?: number;
  totalBytes?: number;
  fileName?: string;
  className?: string;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  progress, bytesTransferred, totalBytes, fileName, className = '',
}) => {
  const pct = Math.min(Math.round(progress), 100);
  const isComplete = pct >= 100;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-1.5">
        {fileName && (
          <span className="text-xs text-text-secondary truncate max-w-[200px]">{fileName}</span>
        )}
        <span className={`text-xs font-semibold ml-auto ${isComplete ? 'text-success' : 'text-primary'}`}>
          {isComplete ? 'Hoàn tất' : `${pct}%`}
        </span>
      </div>
      <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-base ${isComplete ? 'bg-success' : 'btn-gradient'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {bytesTransferred !== undefined && totalBytes !== undefined && !isComplete && (
        <p className="text-xs text-text-tertiary mt-1">
          {formatBytes(bytesTransferred)} / {formatBytes(totalBytes)}
        </p>
      )}
    </div>
  );
};

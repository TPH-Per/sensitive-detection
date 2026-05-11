import React from 'react';
import { formatBytes } from '../../utils/uploadUtils';
import { ProgressBar } from './ProgressBar';

interface UploadProgressProps {
  progress: number;
  bytesTransferred?: number;
  totalBytes?: number;
  fileName?: string;
  className?: string;
  variant?: 'default' | 'inline';
}

/**
 * Component hiển thị tiến trình tải lên kèm metadata.
 */
export const UploadProgress: React.FC<UploadProgressProps> = ({
  progress, bytesTransferred, totalBytes, fileName, className = '', variant = 'default',
}) => {
  const metadata = bytesTransferred !== undefined && totalBytes !== undefined && progress < 100
    ? `${formatBytes(bytesTransferred)} / ${formatBytes(totalBytes)}`
    : undefined;

  return (
    <ProgressBar
      progress={progress}
      label={variant === 'default' ? fileName : undefined}
      metadata={metadata}
      showPercentage
      className={className}
    />
  );
};

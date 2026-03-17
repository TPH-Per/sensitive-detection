import React, { useState, useCallback, useRef } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Modal, Button, Checkbox } from './index';
import { ZoomIn, ZoomOut, RotateCcw, ImagePlus } from 'lucide-react';
import { getCroppedImg } from '../../utils/imageUtils';

interface ImageCropperProps {
  isOpen: boolean;
  image: string;
  aspect?: number;
  title?: string;
  onCropComplete: (croppedFile: File, shouldShare: boolean) => void;
  onImageChange?: (file: File) => void;
  onCancel: () => void;
  showShareOption?: boolean;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  isOpen,
  image,
  aspect = 1,
  title = 'Cắt ảnh',
  onCropComplete,
  onImageChange,
  onCancel,
  showShareOption = false
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [shouldShare, setShouldShare] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onCropChange = useCallback((location: { x: number; y: number }) => {
    setCrop(location);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropAreaComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleApply = async () => {
    if (!croppedAreaPixels) return;

    setIsProcessing(true);
    try {
      const croppedBlob = await getCroppedImg(image, croppedAreaPixels, rotation);
      const croppedFile = new File([croppedBlob], `cropped_${Date.now()}.jpg`, {
        type: 'image/jpeg'
      });
      onCropComplete(croppedFile, shouldShare);
    } catch (error) {
      console.error('Lỗi crop ảnh:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setShouldShare(true);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImageChange) {
      onImageChange(file);
    }
    // Reset value để có thể chọn lại cùng 1 file
    e.target.value = '';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="lg"
      padding="none"
      footer={
        <div className="flex flex-col w-full gap-4">
          {showShareOption && (
            <div className="flex items-center px-1">
              <Checkbox
                id="should-share-to-feed"
                label="Chia sẻ lên bảng tin"
                checked={shouldShare}
                onChange={(e) => setShouldShare(e.target.checked)}
              />
            </div>
          )}
          <div className="flex items-center justify-between w-full">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                icon={<RotateCcw size={16} />}
                title="Đặt lại vị trí"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBrowseClick}
                icon={<ImagePlus size={16} />}
                title="Chọn ảnh khác"
              />
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleFileChange}
            />

            <div className="flex gap-2">
              <Button variant="secondary" onClick={onCancel}>
                Hủy
              </Button>
              <Button
                variant="primary"
                onClick={handleApply}
                isLoading={isProcessing}
              >
                Áp dụng
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <div className="flex flex-col">
        {/* Crop Area */}
        <div className="relative w-full h-[300px] md:h-[400px] bg-black">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropAreaComplete}
            classes={{
              containerClassName: 'rounded-none',
              cropAreaClassName: 'border-2 border-white shadow-lg'
            }}
          />
        </div>

        {/* Zoom Controls */}
        <div className="px-4 py-4 bg-bg-secondary border-t border-border-light">
          <div className="flex items-center gap-4">
            <ZoomOut size={18} className="text-text-tertiary flex-shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1.5 bg-bg-third rounded-full appearance-none cursor-pointer accent-primary"
            />
            <ZoomIn size={18} className="text-text-tertiary flex-shrink-0" />
          </div>
        </div>
      </div>
    </Modal>
  );
};

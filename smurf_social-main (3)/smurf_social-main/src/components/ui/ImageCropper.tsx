import React, { useState, useCallback, useRef } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Modal, Button } from './index';
import { ZoomIn, ZoomOut, RotateCcw, ImagePlus, Globe, Users, Lock, ChevronDown } from 'lucide-react';
import { Visibility } from '../../../shared/types';
import { Dropdown, DropdownItem } from './index';
import { getCroppedImg } from '../../utils/imageUtils';

interface ImageCropperProps {
  isOpen: boolean;
  image: string;
  aspect?: number;
  title?: string;
  showShareOption?: boolean;
  initialVisibility?: Visibility;
  onCropComplete: (croppedFile: File, visibility: Visibility) => void;
  onImageChange?: (file: File) => void;
  onCancel: () => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  isOpen,
  image,
  aspect = 1,
  title = 'Cắt ảnh',
  showShareOption = false,
  onCropComplete,
  onImageChange,
  onCancel,
  initialVisibility,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility || Visibility.FRIENDS);
  const [isProcessing, setIsProcessing] = useState(false);
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
      onCropComplete(croppedFile, visibility);
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
            <div className="flex items-center justify-between px-1 py-1 bg-bg-tertiary rounded-xl mb-1">
              <span className="text-xs font-semibold text-text-secondary px-2 uppercase tracking-wider">Ai có thể xem?</span>
              <Dropdown
                trigger={
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-primary hover:bg-bg-hover rounded-lg border border-border-light transition-all text-sm font-medium text-text-primary">
                    {visibility === Visibility.PUBLIC && <Globe size={16} className="text-primary flex-shrink-0" />}
                    {visibility === Visibility.FRIENDS && <Users size={16} className="text-primary flex-shrink-0" />}
                    {visibility === Visibility.PRIVATE && <Lock size={16} className="text-primary flex-shrink-0" />}
                    <span>
                      {visibility === Visibility.PUBLIC && 'Công khai'}
                      {visibility === Visibility.FRIENDS && 'Bạn bè'}
                      {visibility === Visibility.PRIVATE && 'Chỉ mình tôi'}
                    </span>
                    <ChevronDown size={15} className="text-text-tertiary" />
                  </button>
                }
                align="right"
              >
                <DropdownItem 
                  icon={<Globe size={15} />} 
                  label="Công khai" 
                  onClick={() => setVisibility(Visibility.PUBLIC)}
                />
                <DropdownItem 
                  icon={<Users size={15} />} 
                  label="Bạn bè" 
                  onClick={() => setVisibility(Visibility.FRIENDS)}
                />
                <DropdownItem 
                  icon={<Lock size={15} />} 
                  label="Chỉ mình tôi" 
                  onClick={() => setVisibility(Visibility.PRIVATE)}
                />
              </Dropdown>
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

        <div className="px-4 py-3.5 bg-bg-secondary border-t border-border-light">
          <div className="flex items-center gap-4">
            <ZoomOut size={16} className="text-text-tertiary flex-shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1.5 bg-bg-tertiary rounded-full appearance-none cursor-pointer accent-primary"
            />
            <ZoomIn size={16} className="text-text-tertiary flex-shrink-0" />
          </div>
        </div>
      </div>
    </Modal>
  );
};

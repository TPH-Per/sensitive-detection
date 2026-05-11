import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Copy, Check, X, Share2 } from 'lucide-react';
import { Modal, Button } from '../../ui';
import { toast } from '../../../store/toastStore';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: string; // The URL to encode
  title?: string;
  subtitle?: string;
  avatarSrc?: any;
  avatarName?: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  value,
  title = 'Mã QR của nhóm',
  subtitle = 'Quét mã để tham gia nhóm nhanh chóng',
  avatarSrc,
  avatarName,
}) => {
  const [copied, setCopied] = React.useState(false);
  const qrRef = useRef<SVGSVGElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Đã sao chép link tham gia');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Không thể sao chép link');
    }
  };

  const handleDownload = () => {
    if (!qrRef.current) return;

    const svg = qrRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 40;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `smurf-qr-${Date.now()}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const renderFooter = (
    <div className="flex gap-3 w-full">
      <Button
        variant="secondary"
        onClick={handleCopy}
        icon={copied ? <Check size={18} className="text-success" /> : <Copy size={18} />}
        className="flex-1"
      >
        {copied ? 'Đã chép' : 'Sao chép link'}
      </Button>
      <Button
        variant="primary"
        onClick={handleDownload}
        icon={<Download size={18} />}
        className="flex-1"
      >
        Tải mã về
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      footer={renderFooter}
    >
      <div className="flex flex-col items-center py-5 space-y-5">
        {/* QR Code Container */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-border-light overflow-hidden">
          <QRCodeSVG
            ref={qrRef}
            value={value}
            size={180}
            level="M"
            includeMargin={false}
          />
        </div>

        <div className="text-center space-y-1 px-6">
          {avatarName && (
            <h3 className="text-base font-bold text-text-primary line-clamp-1">
              {avatarName}
            </h3>
          )}
          <p className="text-[11px] text-text-tertiary leading-relaxed max-w-[220px]">
            {subtitle}
          </p>
        </div>
      </div>
    </Modal>
  );
};

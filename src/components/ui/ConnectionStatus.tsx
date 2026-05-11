import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useConnectionStatus } from '../../hooks/utils/useConnectionStatus';

export const ConnectionStatus: React.FC = () => {
    const { isFullyConnected, isOnline } = useConnectionStatus();
    const [showReconnected, setShowReconnected] = useState(false);
    const wasDisconnected = useRef(false);

    useEffect(() => {
        if (!isFullyConnected) {
            wasDisconnected.current = true;
            setShowReconnected(false);
            return;
        }
        if (wasDisconnected.current) {
            wasDisconnected.current = false;
            setShowReconnected(true);
            const t = setTimeout(() => setShowReconnected(false), 3000);
            return () => clearTimeout(t);
        }
    }, [isFullyConnected]);

    if (isFullyConnected && !showReconnected) return null;

    return (
        <div
            className={`
        fixed top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg
        flex items-center gap-2 text-sm font-medium animate-fade-in
        ${isFullyConnected ? 'bg-success text-text-on-primary' : 'bg-error text-text-on-primary'}
      `}
            style={{ zIndex: 'var(--z-sticky)' }}
        >
            {isFullyConnected ? (
                <><Wifi size={15} /><span>Đã kết nối lại</span></>
            ) : (
                <><WifiOff size={15} /><span>{!isOnline ? 'Không có kết nối Internet' : 'Đang kết nối lại...'}</span></>
            )}
        </div>
    );
};

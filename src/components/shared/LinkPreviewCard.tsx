import React, { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { fetchLinkPreview, LinkPreviewData } from '../../services/linkPreviewService';

interface LinkPreviewCardProps {
    url: string;
    /** Pass pre-fetched data to skip fetching (e.g. from input preview) */
    previewData?: LinkPreviewData | null;
    onDismiss?: () => void;
    /** Compact mode for chat input area */
    compact?: boolean;
    className?: string;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
    url,
    previewData,
    onDismiss,
    compact = false,
    className = '',
}) => {
    const [data, setData] = useState<LinkPreviewData | null>(previewData ?? null);
    const [loading, setLoading] = useState(!previewData);

    useEffect(() => {
        if (previewData !== undefined) {
            setData(previewData);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        fetchLinkPreview(url).then((result) => {
            if (!cancelled) {
                setData(result);
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [url, previewData]);

    if (loading) {
        return (
            <div className={`animate-pulse rounded-xl border border-border-light bg-bg-secondary overflow-hidden ${compact ? 'flex items-center gap-3 p-3' : ''} ${className}`}>
                {compact ? (
                    <>
                        <div className="w-12 h-12 rounded-lg bg-bg-tertiary flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 bg-bg-tertiary rounded w-3/4" />
                            <div className="h-2.5 bg-bg-tertiary rounded w-1/2" />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-full aspect-[2/1] bg-bg-tertiary" />
                        <div className="p-3 space-y-2">
                            <div className="h-3 bg-bg-tertiary rounded w-3/4" />
                            <div className="h-2.5 bg-bg-tertiary rounded w-full" />
                            <div className="h-2.5 bg-bg-tertiary rounded w-2/3" />
                        </div>
                    </>
                )}
            </div>
        );
    }

    if (!data) return null;

    if (compact) {
        return (
            <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`flex items-center gap-3 rounded-xl border border-border-light bg-bg-secondary hover:bg-bg-tertiary transition-colors overflow-hidden group max-w-full ${className}`}
            >
                {data.image && (
                    <img
                        src={data.image}
                        alt=""
                        className="w-14 h-14 object-cover flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                )}
                <div className="flex-1 min-w-0 py-2 pr-2">
                    <p className="text-xs font-semibold text-text-primary truncate leading-tight">{data.title}</p>
                    {data.description && (
                        <p className="text-xs text-text-secondary truncate mt-0.5">{data.description}</p>
                    )}
                    {data.siteName && (
                        <p className="text-xs text-text-tertiary mt-0.5 truncate">{data.siteName}</p>
                    )}
                </div>
                {onDismiss && (
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
                        className="p-2 mr-1 text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
                    >
                        <X size={14} />
                    </button>
                )}
            </a>
        );
    }

    return (
        <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`block rounded-xl border border-border-light bg-bg-secondary hover:bg-bg-tertiary transition-colors overflow-hidden group ${className}`}
        >
            {data.image && (
                <div className="w-full aspect-[2/1] overflow-hidden bg-bg-tertiary">
                    <img
                        src={data.image}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                    />
                </div>
            )}
            <div className="p-3">
                {data.siteName && (
                    <p className="text-xs text-text-tertiary uppercase tracking-wide mb-1 truncate">{data.siteName}</p>
                )}
                <p className="text-sm font-semibold text-text-primary line-clamp-2 leading-snug">{data.title}</p>
                {data.description && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed">{data.description}</p>
                )}
                <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                    <ExternalLink size={11} />
                    <span className="truncate">{data.siteName || data.url}</span>
                </div>
            </div>
        </a>
    );
};

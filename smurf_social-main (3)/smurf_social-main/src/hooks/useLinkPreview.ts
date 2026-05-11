import { useState, useEffect, useRef } from 'react';
import { extractFirstUrl, fetchLinkPreview, LinkPreviewData } from '../services/linkPreviewService';

interface UseLinkPreviewOptions {
    debounce?: number;
}

interface UseLinkPreviewResult {
    url: string | null;
    previewData: LinkPreviewData | null;
    isLoading: boolean;
    dismiss: () => void;
    isDismissed: boolean;
}

export function useLinkPreview(
    text: string,
    { debounce = 600 }: UseLinkPreviewOptions = {}
): UseLinkPreviewResult {
    const [url, setUrl] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<LinkPreviewData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const dismissedUrlRef = useRef<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        const detected = extractFirstUrl(text);

        if (detected !== dismissedUrlRef.current) {
            setIsDismissed(false);
            dismissedUrlRef.current = null;
        }

        if (!detected) {
            setUrl(null);
            setPreviewData(null);
            setIsLoading(false);
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        if (detected === dismissedUrlRef.current) {
            setUrl(detected);
            return;
        }

        setUrl(detected);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            setIsLoading(true);
            const data = await fetchLinkPreview(detected);
            setPreviewData(data);
            setIsLoading(false);
        }, debounce);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [text, debounce]);

    const dismiss = () => {
        dismissedUrlRef.current = url;
        setIsDismissed(true);
        setPreviewData(null);
    };

    return { url, previewData, isLoading, dismiss, isDismissed };
}

export interface LinkPreviewData {
    url: string;
    title: string;
    description: string;
    image: string;
    siteName?: string;
}

const API_KEY = import.meta.env.VITE_LINKPREVIEW_API_KEY as string;
const CACHE_PREFIX = 'lp:';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// Regex tách URL từ văn bản
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"{}|\\^`[\]]+/i;

// Đuôi file bỏ qua (đã xử lý là media)
const SKIP_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|mkv|pdf|zip|rar)(\?.*)?$/i;

/** Tách URL đầu tiên trong văn bản */
export function extractFirstUrl(text: string): string | null {
    const match = text.match(URL_REGEX);
    if (!match) return null;
    const url = match[0].startsWith('www.') ? `https://${match[0]}` : match[0];
    if (SKIP_EXTENSIONS.test(url)) return null;
    return url;
}

function getCached(url: string): LinkPreviewData | null {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + url);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw) as { data: LinkPreviewData; ts: number };
        if (Date.now() - ts > CACHE_TTL) {
            localStorage.removeItem(CACHE_PREFIX + url);
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

function cleanupCache(): void {
    try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
        if (keys.length < 100) return; // Chỉ dọn dẹp nếu > 100 mục


        keys.forEach(key => {
            const raw = localStorage.getItem(key);
            if (raw) {
                const { ts } = JSON.parse(raw);
                if (Date.now() - ts > CACHE_TTL) {
                    localStorage.removeItem(key);
                }
            }
        });


        const remainingKeys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
        if (remainingKeys.length > 150) {
            const sorted = remainingKeys.map(key => {
                const raw = localStorage.getItem(key);
                return { key, ts: raw ? JSON.parse(raw).ts : 0 };
            }).sort((a, b) => a.ts - b.ts);
            
            sorted.slice(0, 50).forEach(item => localStorage.removeItem(item.key));
        }
    } catch (e) {
        // Bỏ qua lỗi truy cập localStorage
    }
}

function setCache(url: string, data: LinkPreviewData): void {
    try {
        cleanupCache();
        localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ data, ts: Date.now() }));
    } catch {
        // localStorage đầy hoặc bị chặn
    }
}

const pending = new Map<string, Promise<LinkPreviewData | null>>();

/** Lấy thông tin xem trước liên kết */
export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
    if (!API_KEY || API_KEY === 'your_linkpreview_api_key_here') return null;

    const cached = getCached(url);
    if (cached) return cached;

    if (pending.has(url)) return pending.get(url)!;

    const request = (async (): Promise<LinkPreviewData | null> => {
        try {
            const res = await fetch('https://api.linkpreview.net', {
                method: 'POST',
                headers: { 'X-Linkpreview-Api-Key': API_KEY },
                mode: 'cors',
                body: JSON.stringify({ q: url }),
            });

            if (!res.ok) return null;

            const json = await res.json() as {
                title?: string;
                description?: string;
                image?: string;
                url?: string;
                error?: number;
            };

            if (json.error || !json.title) return null;

            const data: LinkPreviewData = {
                url: json.url || url,
                title: json.title || '',
                description: json.description || '',
                image: json.image || '',
            };


            try {
                const hostname = new URL(data.url).hostname.replace(/^www\./, '');
                data.siteName = hostname;
            } catch {
                data.siteName = '';
            }

            setCache(url, data);
            return data;
        } catch {
            return null;
        } finally {
            pending.delete(url);
        }
    })();

    pending.set(url, request);
    return request;
}

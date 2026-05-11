import { Timestamp, serverTimestamp, FieldValue } from 'firebase/firestore';

/**
 * Convert Date to Firestore Timestamp
 */
export const toTimestamp = (date: Date): Timestamp => {
    return Timestamp.fromDate(date);
};

/**
 * Convert Firestore Timestamp to Date
 */
export const toDate = (timestamp: Timestamp): Date => {
    return timestamp.toDate();
};

/**
 * Get current timestamp (client-side)
 */
export const now = (): Timestamp => {
    return Timestamp.now();
};

/**
 * Get server timestamp (for writes)
 * Use this when creating/updating documents
 */
export const getServerTimestamp = (): FieldValue => {
    return serverTimestamp();
};

/**
 * Format timestamp to readable string
 */
export const formatTimestamp = (timestamp: Timestamp, locale: string = 'vi-VN'): string => {
    return timestamp.toDate().toLocaleString(locale);
};

/**
 * Check if timestamp is valid
 */
export const isValidTimestamp = (value: any): value is Timestamp => {
    return value instanceof Timestamp;
};

/**
 * Lấy milliseconds an toàn từ nhiều định dạng (Timestamp, Date, number)
 */
export const getSafeMillis = (ts: any): number => {
    if (!ts) return Date.now();
    if (typeof ts === 'number') return ts;
    if (ts instanceof Timestamp) return ts.toMillis();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (ts.seconds !== undefined) return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000;
    return Date.now();
};

/**
 * So sánh hai mốc thời gian an toàn
 */
export const compareTimestamps = (a: any, b: any): number => {
    return getSafeMillis(a) - getSafeMillis(b);
};

/**
 * Get timestamp from milliseconds
 */
export const fromMillis = (milliseconds: number): Timestamp => {
    return Timestamp.fromMillis(milliseconds);
};

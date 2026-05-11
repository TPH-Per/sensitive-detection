import { DocumentSnapshot, Timestamp } from 'firebase/firestore';

/**
 * Chuyển đổi Timestamp thành Date đệ quy
 */
function convertTimestamps(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  // Xử lý Timestamp của Firestore
  if (obj instanceof Timestamp) {
    return obj.toDate();
  }

  // Xử lý Mảng
  if (Array.isArray(obj)) {
    return obj.map(item => convertTimestamps(item));
  }

  // Xử lý Object
  const result: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = convertTimestamps(obj[key]);
    }
  }
  return result;
}

/**
 * Chuyển đổi Firestore document thành Object kèm ID
 */
export function convertDoc<T>(doc: DocumentSnapshot): T {
  const data = doc.data();
  if (!data) return {} as T;

  return { 
    ...convertTimestamps(data), 
    id: doc.id,
  } as T;
}

/**
 * Xử lý danh sách documents
 */
export function convertDocs<T>(docs: DocumentSnapshot[]): T[] {
  return docs.map(doc => convertDoc<T>(doc));
}


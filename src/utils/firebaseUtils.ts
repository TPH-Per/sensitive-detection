import { DocumentSnapshot, Timestamp } from 'firebase/firestore';

/**
 * Chuyển đổi Firestore document thành Object kèm ID
 */
export function convertDoc<T>(doc: DocumentSnapshot): T {
  const data = doc.data();
  if (!data) return {} as T;

  return { 
    ...data, 
    id: doc.id,
  } as T;
}

/**
 * Xử lý danh sách documents
 */
export function convertDocs<T>(docs: DocumentSnapshot[]): T[] {
  return docs.map(doc => convertDoc<T>(doc));
}

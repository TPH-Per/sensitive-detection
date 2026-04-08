import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { User } from '../types';

const geminiApiKey = defineString('GEMINI_API_KEY');

export const onUserProfileUpdated = onDocumentWritten("users/{userId}", async (event) => {
  const change = event.data;
  if (!change) return;

  const before = change.before.data() as User | undefined;
  const after = change.after.data() as User | undefined;

  if (!after) {
    return;
  }

  const interestsChanged = JSON.stringify(before?.interests || []) !== JSON.stringify(after.interests || []);
  const locationChanged = before?.location !== after.location;
  const schoolChanged = before?.school !== after.school;
  const generationChanged = before?.generation !== after.generation;

  if (!interestsChanged && !locationChanged && !schoolChanged && !generationChanged && after.userVector) {
    return;
  }

  const interestsText = after.interests && after.interests.length > 0 
    ? after.interests.join(", ") 
    : "Không có";
  const locationText = after.location || "Không rõ";
  const schoolText = after.school || "Không rõ";
  const generationText = after.generation || "Không rõ";

  const profileText = `Sở thích: ${interestsText}. Địa điểm: ${locationText}. Trường học: ${schoolText}. Thế hệ: ${generationText}.`;
  
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-2-preview" });
    const result = await model.embedContent(profileText);
    const userVector = result.embedding.values;

    await change.after.ref.update({
      userVector: userVector
    });
    
    console.log(`Cập nhật Gemini Embedding thành công cho user: ${event.params.userId}`);
  } catch (error) {
    console.error(`Lỗi tạo Embedding bằng Gemini cho user ${event.params.userId}:`, error);
  }
});

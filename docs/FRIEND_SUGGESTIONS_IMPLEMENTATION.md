# Friend Suggestions with Vector Similarity - Complete Documentation

**Date**: 2026-03-29
**Author**: Claude AI Assistant
**Status**: ✅ Implemented

---

## 📋 TÓM TẮT CHỨC NĂNG

Hệ thống gợi ý bạn bè thông minh dựa trên:
- **Vector Similarity**: So sánh độ tương đồng giữa user profiles
- **Social Graph**: Phân tích mạng lưới bạn bè
- **Message Frequency**: Ưu tiên từ những người nhắn tin nhiều nhất

### Concept Algorithm

```
┌─────────────────────────────────────────────────────────────┐
│  FRIEND SUGGESTION ALGORITHM                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. VECTORIZE USER PROFILE (100 dimensions)                 │
│     ├─ Combine: bio + location + school + interests         │
│     ├─ Create paragraph framework                           │
│     └─ Simple hash-based Bag-of-Words vectorization         │
│                                                              │
│  2. FIND TOP 5 MESSAGING FRIENDS (last 7 days)              │
│     ├─ Query RTDB userChats for recent conversations        │
│     ├─ Count messages per friend                            │
│     └─ Rank by message frequency                            │
│                                                              │
│  3. GET FRIENDS OF FRIENDS (2nd degree connections)         │
│     ├─ From top 5 friends → get their friends list          │
│     ├─ Filter out: self + current friends                   │
│     └─ Create candidate pool                                │
│                                                              │
│  4. KNN - FIND 20 SIMILAR USERS                             │
│     ├─ Calculate cosine similarity with each candidate      │
│     ├─ Rank by similarity score (0.0 - 1.0)                 │
│     └─ Take top 20 matches                                  │
│                                                              │
│  5. SAVE TO suggestedFriends ARRAY                          │
│     └─ Update user document in Firestore                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 NHỮNG THAY ĐỔI ĐÃ THỰC HIỆN

### 1. **User Model - TypeScript (Web App)**

**File**: `smurf_social-main/shared/types.ts`

**Changes**:
```typescript
export interface User extends BaseEntity {
    fullName: string;
    avatar?: MediaObject;
    email: string;
    location?: string;

    // ✨ NEW FIELDS
    school?: string;              // Trường học
    interests?: string[];         // Danh sách sở thích
    userVector?: number[];        // Vector 100 chiều cho similarity
    suggestedFriends?: string[];  // Mảng user IDs được gợi ý
    // END NEW FIELDS

    gender?: Gender;
    dob?: Timestamp;
    status: UserStatus;
    role: UserRole;
    bio?: string;
    cover?: MediaObject;
    updatedAt: Timestamp;
    deletedAt?: Timestamp;
}
```

**Impact**:
- ✅ Web app có thể lưu và hiển thị thông tin school, interests
- ✅ Vector được generate tự động khi profile cập nhật
- ✅ Suggested friends có thể show trong UI

---

### 2. **User Model - Dart (Flutter App)**

**File**: `klcn/lib/models/user_model.dart`

**Changes**:
```dart
class UserModel {
  final String id;
  final String fullName;
  final String email;
  final MediaObject avatar;
  final MediaObject cover;
  final String? bio;
  final String? location;

  // ✨ NEW FIELDS
  final String? school;              // Trường học
  final List<String>? interests;     // Sở thích
  final List<double>? userVector;    // Vector similarity
  final List<String>? suggestedFriends; // Gợi ý bạn bè
  // END NEW FIELDS

  final Gender? gender;
  final DateTime? dob;
  final UserStatus status;
  final UserRole role;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? deletedAt;
  final UserSettings? settings;

  // Constructor, fromJson, toJson, copyWith đã được update
}
```

**Updated Methods**:
- ✅ `fromJson()` - Parse school, interests, userVector, suggestedFriends
- ✅ `toJson()` - Serialize new fields
- ✅ `copyWith()` - Support copying with new fields

---

### 3. **Cloud Functions - Friend Suggestions**

#### **File 1**: `functions/src/friends/generateFriendSuggestions.ts`

**Type**: ✨ NEW FILE - Callable Cloud Function

**Purpose**: Generate friend suggestions on-demand (user-triggered)

**API Endpoint**:
```typescript
generateFriendSuggestions()
```

**Authentication**: Required (Firebase Auth)

**Request**: No parameters needed (uses authenticated user ID)

**Response**:
```typescript
{
  success: true,
  suggestedCount: 15,        // Number of suggestions generated
  topFriends: 5,             // Number of top messaging friends found
  candidatePool: 47          // Total candidates evaluated
}
```

**Key Functions**:

1. **`generateUserVector(profile)`**
   - Input: `{ bio, location, school, interests }`
   - Output: `number[]` (100-dimension vector)
   - Algorithm: Hash-based Bag-of-Words with TF-IDF normalization

2. **`getTopMessagingFriends(userId)`**
   - Queries RTDB `userChats` và `messages`
   - Counts messages from last 7 days
   - Returns top 5 friends by message count

3. **`getFriendsOfFriends(userId, topFriends)`**
   - Gets friends from each top friend
   - Excludes: user itself + current friends
   - Returns unique candidate pool

4. **`findSimilarUsers(userId, userVector, candidates)`**
   - Calculates cosine similarity for each candidate
   - Generates vectors for candidates if missing
   - Returns top 20 by similarity score

5. **`cosineSimilarity(vecA, vecB)`**
   - Classic cosine similarity: `cos(θ) = (A·B) / (|A||B|)`
   - Returns score from 0.0 (no similarity) to 1.0 (identical)

---

#### **File 2**: `functions/src/friends/weeklyFriendSuggestions.ts`

**Type**: ✨ NEW FILE - Scheduled Cloud Function

**Purpose**: Auto-generate suggestions for all users weekly

**Schedule**:
```cron
0 2 * * 0  // Every Sunday at 2:00 AM
```

**Timezone**: `Asia/Ho_Chi_Minh`

**Features**:
- ✅ Batch processing (10 users per batch)
- ✅ Parallel processing within batch
- ✅ Error handling per user
- ✅ Progress logging
- ✅ 9-minute timeout protection

**Execution Flow**:
```
1. Get all active users from Firestore
2. Process in batches of 10
3. For each user:
   - Generate user vector
   - Find top messaging friends
   - Get friends of friends
   - Calculate KNN similarity
   - Update suggestedFriends array
4. Log success/failure counts
```

---

### 4. **Functions Index - Export Configuration**

**File**: `functions/src/index.ts`

**Changes**:
```typescript
// ✨ NEW EXPORTS
export { generateFriendSuggestions } from './friends/generateFriendSuggestions';
export { weeklyFriendSuggestions } from './friends/weeklyFriendSuggestions';
```

**Impact**:
- Functions auto-deploy khi chạy `npm run deploy`
- Available in Firebase Console
- Can be called from Flutter/Web apps

---

## 🚀 DEPLOYMENT GUIDE

### Prerequisites

```bash
# 1. Install dependencies
cd functions
npm install

# 2. Build TypeScript
npm run build

# 3. Test locally (optional)
npm run serve
```

### Deploy to Firebase

```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific functions
firebase deploy --only functions:generateFriendSuggestions
firebase deploy --only functions:weeklyFriendSuggestions
```

### Verify Deployment

```bash
# Check deployed functions
firebase functions:list

# View logs
firebase functions:log
```

---

## 📱 FLUTTER INTEGRATION

### 1. Call Cloud Function from Flutter

**Create Service**:

```dart
// lib/services/friend_service.dart

import 'package:cloud_functions/cloud_functions.dart';

class FriendService {
  final _functions = FirebaseFunctions.instance;

  /// Generate friend suggestions for current user
  Future<Map<String, dynamic>> generateFriendSuggestions() async {
    try {
      final callable = _functions.httpsCallable('generateFriendSuggestions');
      final result = await callable.call();

      return {
        'success': true,
        'data': result.data,
      };
    } catch (e) {
      print('Error generating friend suggestions: $e');
      return {
        'success': false,
        'error': e.toString(),
      };
    }
  }

  /// Get suggested friends for current user
  Future<List<UserModel>> getSuggestedFriends(String userId) async {
    try {
      final userDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .get();

      final suggestedIds = userDoc.data()?['suggestedFriends'] as List<dynamic>?;

      if (suggestedIds == null || suggestedIds.isEmpty) {
        return [];
      }

      // Fetch user details in batches
      final List<UserModel> suggestions = [];
      const batchSize = 10;

      for (int i = 0; i < suggestedIds.length; i += batchSize) {
        final batch = suggestedIds.skip(i).take(batchSize).toList();

        final docs = await FirebaseFirestore.instance
            .collection('users')
            .where(FieldPath.documentId, whereIn: batch)
            .get();

        suggestions.addAll(
          docs.docs.map((doc) => UserModel.fromFirestore(doc))
        );
      }

      return suggestions;
    } catch (e) {
      print('Error fetching suggested friends: $e');
      return [];
    }
  }
}
```

### 2. Update Friends Provider

```dart
// lib/providers/friends_provider.dart

class FriendsProvider extends ChangeNotifier {
  List<UserModel> _suggestedFriends = [];
  bool _isLoadingSuggestions = false;

  List<UserModel> get suggestedFriends => _suggestedFriends;
  bool get isLoadingSuggestions => _isLoadingSuggestions;

  /// Load suggested friends
  Future<void> loadSuggestedFriends(String userId) async {
    _isLoadingSuggestions = true;
    notifyListeners();

    try {
      _suggestedFriends = await friendService.getSuggestedFriends(userId);
    } catch (e) {
      print('Error loading suggestions: $e');
    }

    _isLoadingSuggestions = false;
    notifyListeners();
  }

  /// Trigger new suggestions generation
  Future<bool> refreshSuggestions() async {
    try {
      final result = await friendService.generateFriendSuggestions();

      if (result['success']) {
        // Reload suggested friends after generation
        if (_currentUserId != null) {
          await loadSuggestedFriends(_currentUserId!);
        }
        return true;
      }
      return false;
    } catch (e) {
      print('Error refreshing suggestions: $e');
      return false;
    }
  }
}
```

### 3. UI Screen - Suggested Friends

```dart
// lib/screens/friends/suggested_friends_screen.dart

class SuggestedFriendsScreen extends StatefulWidget {
  const SuggestedFriendsScreen({super.key});

  @override
  State<SuggestedFriendsScreen> createState() => _SuggestedFriendsScreenState();
}

class _SuggestedFriendsScreenState extends State<SuggestedFriendsScreen> {
  @override
  void initState() {
    super.initState();
    _loadSuggestions();
  }

  Future<void> _loadSuggestions() async {
    final authProvider = context.read<AuthProvider>();
    final friendsProvider = context.read<FriendsProvider>();

    if (authProvider.userId != null) {
      await friendsProvider.loadSuggestedFriends(authProvider.userId!);
    }
  }

  Future<void> _refreshSuggestions() async {
    final friendsProvider = context.read<FriendsProvider>();

    final success = await friendsProvider.refreshSuggestions();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            success
              ? 'Đã tạo gợi ý bạn bè mới!'
              : 'Không thể tạo gợi ý bạn bè'
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final friendsProvider = context.watch<FriendsProvider>();
    final suggestions = friendsProvider.suggestedFriends;
    final isLoading = friendsProvider.isLoadingSuggestions;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gợi ý kết bạn'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refreshSuggestions,
            tooltip: 'Tạo gợi ý mới',
          ),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : suggestions.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.people_outline, size: 64),
                      const SizedBox(height: 16),
                      const Text('Chưa có gợi ý bạn bè'),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: _refreshSuggestions,
                        child: const Text('Tạo gợi ý'),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadSuggestions,
                  child: ListView.builder(
                    itemCount: suggestions.length,
                    itemBuilder: (context, index) {
                      final user = suggestions[index];
                      return SuggestedFriendCard(user: user);
                    },
                  ),
                ),
    );
  }
}
```

---

## 🧪 TESTING

### Manual Testing

```bash
# 1. Test callable function (requires authentication)
curl -X POST \
  https://asia-southeast1-YOUR_PROJECT.cloudfunctions.net/generateFriendSuggestions \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN"

# 2. Trigger scheduled function manually
firebase functions:shell
> weeklyFriendSuggestions()
```

### Unit Testing

```typescript
// functions/test/friendSuggestions.test.ts

import { generateFriendSuggestions } from '../src/friends/generateFriendSuggestions';

describe('Friend Suggestions', () => {
  it('should generate vector from user profile', () => {
    const profile = {
      bio: 'Software engineer who loves coding',
      location: 'Ho Chi Minh City',
      school: 'HUIT University',
      interests: ['Programming', 'Music', 'Travel']
    };

    const vector = generateUserVector(profile);

    expect(vector).toHaveLength(100);
    expect(vector.every(v => v >= 0 && v <= 1)).toBe(true);
  });

  it('should calculate cosine similarity correctly', () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];

    expect(cosineSimilarity(vecA, vecB)).toBe(1.0); // Identical
    expect(cosineSimilarity(vecA, vecC)).toBe(0.0); // Orthogonal
  });
});
```

---

## 📊 FIRESTORE RULES UPDATE

**File**: `firestore.rules`

**Add rule để cho phép users đọc suggestedFriends**:

```javascript
match /users/{userId} {
  allow read: if request.auth != null && (
    request.auth.uid == userId ||  // Own profile
    isPublicField()                // Public fields only
  );

  allow update: if request.auth != null && request.auth.uid == userId && (
    !request.resource.data.diff(resource.data).affectedKeys()
      .hasAny(['role', 'status', 'userVector', 'suggestedFriends'])
    // Prevent users from manually editing vector and suggestions
  );
}
```

---

## 🎯 PERFORMANCE CONSIDERATIONS

### Optimization Tips

1. **Vector Caching**
   - Vectors are cached in user documents
   - Only regenerate when profile changes
   - Reduces computation costs

2. **Batch Processing**
   - Scheduled function processes 10 users at a time
   - Prevents timeout and quota exhaustion

3. **Firestore Query Limits**
   - Use `whereIn` with max 10 items per batch
   - Process candidates in chunks

4. **RTDB Read Optimization**
   - Filter by timestamp (last 7 days only)
   - Avoid scanning all messages

### Cost Estimation

**Per User Suggestion Generation**:
- Firestore Reads: ~15-30 documents
- Firestore Writes: 1-2 documents
- RTDB Reads: ~10-20 queries
- Function Execution Time: ~2-5 seconds

**Weekly Scheduled Run** (1000 users):
- Total Execution Time: ~15-20 minutes
- Firestore Operations: ~20,000 reads, ~1,000 writes
- Estimated Cost: ~$0.10 - $0.20 USD

---

## 🔮 FUTURE IMPROVEMENTS

### 1. **Advanced Vectorization**

Use real embedding models instead of simple hash-based:

```typescript
import { VertexAI } from '@google-cloud/aiplatform';

async function generateUserVectorWithAI(profile: UserProfile): Promise<number[]> {
  const text = [profile.bio, profile.location, profile.school, ...profile.interests].join('. ');

  // Use Vertex AI Text Embeddings
  const vertexAI = new VertexAI({ project: 'your-project' });
  const embedding = await vertexAI.textEmbedding(text);

  return embedding.values; // Returns 768-dimension vector
}
```

### 2. **Machine Learning Integration**

```python
# Train a custom model to predict friend compatibility
from sklearn.ensemble import RandomForestClassifier

features = [
  'vector_similarity',
  'mutual_friends_count',
  'message_frequency',
  'same_school',
  'same_location',
  'interest_overlap'
]

model = RandomForestClassifier()
model.fit(X_train, y_train)  # y = 1 if became friends, 0 otherwise
```

### 3. **Real-time Updates**

Trigger suggestion regeneration on profile update:

```typescript
export const onUserProfileUpdate = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // Check if relevant fields changed
    const fieldsChanged = ['bio', 'location', 'school', 'interests'];
    const hasChanges = fieldsChanged.some(
      field => before[field] !== after[field]
    );

    if (hasChanges) {
      // Regenerate suggestions
      await generateSuggestionsForUser(event.params.userId);
    }
  }
);
```

### 4. **A/B Testing**

Test different algorithms:
- Algorithm A: Vector similarity only
- Algorithm B: Mutual friends count
- Algorithm C: Hybrid (vector + social graph + message frequency)

Track metrics:
- Friend request acceptance rate
- Message rate after connection
- User engagement

---

## 📝 CHECKLIST DEPLOYMENT

- [x] Update `shared/types.ts` với new fields
- [x] Update `user_model.dart` với new fields
- [x] Create `generateFriendSuggestions.ts` cloud function
- [x] Create `weeklyFriendSuggestions.ts` scheduled function
- [x] Export functions in `index.ts`
- [ ] Deploy cloud functions: `firebase deploy --only functions`
- [ ] Update Firestore security rules
- [ ] Test callable function từ Flutter
- [ ] Create UI screen cho suggested friends
- [ ] Update FriendsProvider với suggestion logic
- [ ] Add refresh button trong Friends screen
- [ ] Test scheduled function manually
- [ ] Monitor logs sau deploy
- [ ] Document API cho team

---

## 🐛 TROUBLESHOOTING

### Issue 1: "Function timeout"

**Cause**: Too many users to process in 9 minutes

**Solution**:
```typescript
// Reduce batch size or add pagination
const batchSize = 5; // Giảm từ 10 xuống 5

// Or process only active users in last 30 days
.where('updatedAt', '>=', thirtyDaysAgo)
```

### Issue 2: "No suggestions generated"

**Cause**: User có ít bạn bè hoặc không nhắn tin

**Solution**: Fallback to random active users

```typescript
if (suggestions.length === 0) {
  // Get random active users as fallback
  const randomUsers = await db
    .collection('users')
    .where('status', '==', 'active')
    .limit(20)
    .get();

  suggestions = randomUsers.docs.map(doc => doc.id);
}
```

### Issue 3: "Vector similarity always 0"

**Cause**: Empty or too short profile text

**Solution**: Add default interests

```typescript
if (parts.length === 0) {
  parts.push('user'); // Default text
}
```

---

## 📞 SUPPORT

**Documentation**: This file
**Cloud Functions Logs**: `firebase functions:log`
**Firebase Console**: https://console.firebase.google.com

---

**End of Documentation**

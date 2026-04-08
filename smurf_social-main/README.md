# 🐳 Smurfy

> Ứng dụng mạng xã hội & chat realtime hiện đại được xây dựng với React, TypeScript và Firebase

[![React](https://img.shields.io/badge/React-19.2.3-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-12.8.0-FFCA28?logo=firebase)](https://firebase.google.com/)
[![Vite](https://img.shields.io/badge/Vite-6.2.0-646CFF?logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.17-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)

---

## 📋 Mục Lục

- [Giới Thiệu](#-giới-thiệu)
- [Tính Năng](#-tính-năng)
- [Tech Stack](#-tech-stack)
- [Kiến Trúc](#-kiến-trúc)
- [Cài Đặt](#-cài-đặt)
- [Cấu Hình](#-cấu-hình)
- [Chạy Dự Án](#-chạy-dự-án)
- [Cấu Trúc Thư Mục](#-cấu-trúc-thư-mục)
- [Scripts](#-scripts)
- [Deployment](#-deployment)
- [Liên Hệ](#-liên-hệ)

---

## 🎯 Giới Thiệu

**Smurfy** là một ứng dụng mạng xã hội full-featured với khả năng chat realtime, newsfeed, quản lý bạn bè và nhiều tính năng khác. Dự án được xây dựng với mục tiêu tạo ra một nền tảng kết nối cộng đồng hiện đại, nhanh chóng và dễ sử dụng.

---

## ✨ Tính Năng

### 🔐 Authentication

- Đăng ký / Đăng nhập với email & password
- Email verification
- Quên mật khẩu
- Session management

### 💬 Chat Realtime

- Chat 1-1 và nhóm (Realtime)
- Gọi video & audio (Tích hợp ZegoCloud)
- Gửi tin nhắn văn bản, hình ảnh, video, tệp tin, tin nhắn thoại
- Cảm xúc tin nhắn, trả lời, chuyển tiếp, chỉnh sửa và thu hồi tin nhắn
- Trạng thái đang nhập (Typing) & Trạng thái hoạt động (Online/Offline)
- Xác nhận đã đọc & đã nhận tin nhắn
- Nhắc tên (@mention) người dùng trong nhóm
- Quản lý nhóm (thêm/xóa thành viên, quyền trưởng nhóm...)

### 📰 Newsfeed

- Đăng bài với text, images, videos
- Reactions (like, love, haha, wow, sad, angry)
- Comments & replies
- Visibility settings (public, friends, private)
- Edit & delete posts

### 👥 Contacts & Friends

- Gửi & nhận friend requests
- Quản lý danh sách bạn bè
- Tìm kiếm người dùng
- Block/unblock users

### 🔔 Notifications

- Realtime notifications
- Push notifications (FCM)
- Notification types: likes, comments, friend requests, reports...

### 👤 Profile

- Cập nhật thông tin cá nhân
- Upload avatar & cover image
- Xem posts của user
- Thống kê bạn bè & posts

### ⚙️ Settings

- Theme (light/dark mode)
- Privacy settings
- Account settings

### 🛡️ Admin Dashboard

- Quản lý users (ban/unban)
- Xử lý reports
- Thống kê hệ thống

---

## 🛠️ Tech Stack

### Frontend

- **React 19.2.3** - UI library
- **TypeScript 5.8.2** - Type safety
- **Vite 6.2.0** - Build tool
- **React Router DOM 7.13.0** - Routing
- **Zustand 4.5.5** - State management
- **Tailwind CSS 3.4.17** - Styling
- **ZegoCloud UIKit** - Video & Audio calls
- **React Hook Form 7.71.1** - Form handling
- **Zod 4.3.6** - Schema validation
- **Lucide React** - Icons
- **Date-fns** - Date formatting
- **React Loading Skeleton** - Loading states
- **Emoji Picker React** - Emoji picker
- **React Easy Crop** - Image cropping

### Backend & Services

- **Firebase Authentication** - User authentication
- **Firestore** - NoSQL database
- **Firebase Realtime Database** - Presence system
- **Firebase Storage** - File & media storage
- **Firebase Cloud Messaging** - Push notifications
- **ZegoCloud** - Realtime Video & Audio Call service
- **Provinces API** - Vietnam provinces & cities data

### Development Tools

- **ESLint** - Code linting
- **PostCSS** - CSS processing
- **Autoprefixer** - CSS vendor prefixes

---

## 🏗️ Kiến Trúc

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client (React SPA)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Pages   │  │Components│  │  Hooks   │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│       │             │              │                    │
│       └─────────────┴──────────────┘                    │
│                     │                                   │
│              ┌──────▼──────┐                           │
│              │   Stores    │  (Zustand)                │
│              │  (State)    │                           │
│              └──────┬──────┘                           │
│                     │                                   │
│              ┌──────▼──────┐                           │
│              │  Services   │  (Business Logic)         │
│              └──────┬──────┘                           │
└─────────────────────┼───────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
┌───────▼────────┐         ┌────────▼────────┐
│    Firebase    │         │   ZegoCloud     │
│  - Auth        │         │  - Video Call   │
│  - Firestore   │         │  - Audio Call   │
│  - RTDB        │         └─────────────────┘
│  - Storage     │
│  - FCM         │
└────────────────┘
```

### Data Flow

```
User Action → Component → Hook → Store → Service → Firebase
                                   ↓
                              Update State
                                   ↓
                            Re-render Component
```

---

## 📦 Cài Đặt

### Yêu Cầu Hệ Thống

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0 hoặc **yarn**: >= 1.22.0
- **Git**: Latest version

### Clone Repository

```bash
git clone https://github.com/dexter826/smurf_social.git
cd smurf_social
```

### Cài Đặt Dependencies

```bash
npm install
# hoặc
yarn install
```

---

## ⚙️ Cấu Hình

### 1. Firebase Setup

1. Tạo project mới tại [Firebase Console](https://console.firebase.google.com/)
2. Enable các services:
   - Authentication (Email/Password)
   - Firestore Database
   - Realtime Database
   - Storage
   - Cloud Messaging (optional)
3. Lấy Firebase config từ Project Settings

### 2. ZegoCloud Setup

1. Tạo project tại [ZegoCloud Admin Console](https://console.zegocloud.com/)
2. Lấy AppID và AppSign từ phần dự án đã tạo

### 4. Environment Variables

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Điền thông tin vào `.env`:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_URL=https://your_project_id-default-rtdb.firebaseio.com
VITE_FIREBASE_VAPID_KEY=your_vapid_key_here

# ZegoCloud Configuration
VITE_ZEGO_APP_ID=your_zegocloud_app_id
VITE_ZEGO_APP_SIGN=your_zegocloud_app_sign

# API Endpoints
VITE_PROVINCES_API_URL=https://provinces.open-api.vn/api/
```

### 5. Firestore Security Rules

Deploy tất cả rules:

```bash
firebase deploy --only firestore:rules,storage,database
```

### 6. Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

---

## 🚀 Chạy Dự Án

### Development Mode

```bash
npm run dev
# hoặc
yarn dev
```

Mở trình duyệt tại: `http://localhost:3000`

### Build Production

```bash
npm run build
# hoặc
yarn build
```

### Preview Production Build

```bash
npm run preview
# hoặc
yarn preview
```

---

## 📁 Cấu Trúc Thư Mục

```
smurf_social/
├── .agent/              # Agent configs & analysis
├── public/              # Static assets
├── src/
│   ├── components/      # UI components
│   ├── constants/       # App constants
│   ├── firebase/        # Firebase config
│   ├── hooks/           # Custom React hooks
│   ├── pages/           # Page components
│   ├── services/        # Business logic & API calls
│   ├── store/           # Zustand stores
│   ├── styles/          # Global styles
│   ├── utils/           # Utility functions
│   ├── App.tsx          # Main app component
│   ├── index.tsx        # Entry point
│   └── types.ts         # TypeScript types
├── .env.example         # Environment variables template
├── firebase.json        # Firebase config
├── firestore.rules      # Firestore security rules
├── package.json         # Dependencies
├── tailwind.config.js   # Tailwind config
├── tsconfig.json        # TypeScript config
└── vite.config.ts       # Vite config
```

---

## 📜 Scripts

| Script            | Mô Tả                    |
| ----------------- | ------------------------ |
| `npm run dev`     | Chạy development server  |
| `npm run build`   | Build production         |
| `npm run preview` | Preview production build |

---

## 🌐 Deployment

### Firebase Hosting

1. Install Firebase CLI:

```bash
npm install -g firebase-tools
```

2. Login to Firebase:

```bash
firebase login
```

3. Initialize Firebase:

```bash
firebase init
```

---

## 📞 Liên Hệ

Mọi chi tiết thắc mắc vui lòng liên hệ qua email: [tcongminh1604@gmail.com](mailto:tcongminh1604@gmail.com)

---

<div align="center">

**Made with ❤️ by Smurfy Team**

</div>

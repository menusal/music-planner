# 🎸 Music Planner

A Progressive Web App (PWA) for planning and organizing music concert playlists with offline-first capabilities and cloud synchronization.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [How It Works](#how-it-works)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

## 🎯 Overview

Music Planner is a web application that helps musicians and bands organize their concert playlists. It allows users to:

- Upload and manage audio tracks
- Create and organize playlists with custom ordering
- Calculate total duration including break times
- Set concert start times and see estimated times for each song
- Work offline with automatic synchronization when online
- Install as a Progressive Web App (PWA) on mobile and desktop devices

## ✨ Features

### Core Features

- **Track Management**: Upload audio files (MP3, WAV, OGG, AAC) and organize them in playlists
- **Drag & Drop Reordering**: Intuitively reorder tracks by dragging them
- **Duration Calculation**: Automatically calculates total playlist duration including break times
- **Concert Timing**: Set start times and see estimated times for each song
- **Copy to Clipboard**: Export playlist information as text
- **Audio Player**: Built-in audio player with visualization, shuffle, repeat, and volume control

### Advanced Features

- **Offline-First**: Works completely offline using IndexedDB for local storage
- **Cloud Sync**: Automatic synchronization with Supabase when online
- **PWA Support**: Installable as a native app on any device
- **Multi-language**: Supports English and Spanish (i18n)
- **Real-time Sync Status**: Visual indicator showing online/offline status and pending operations
- **Service Worker**: Automatic updates and caching for fast performance

## 🔧 How It Works

### Data Flow

1. **Local-First Architecture**: All data is stored locally in IndexedDB for immediate access
2. **Background Sync**: When online, changes are automatically synced to Supabase
3. **Conflict Resolution**: Server-side data takes precedence (server wins strategy)
4. **Sync Queue**: Offline operations are queued and processed when connectivity is restored

### Synchronization Process

```
User Action → IndexedDB (immediate) → Sync Queue (if offline)
                                    ↓
                            Supabase (if online)
                                    ↓
                            Other Devices (via Supabase)
```

### Offline Strategy

- **Upload**: Tracks are saved to IndexedDB immediately, then synced to Supabase when online
- **Download**: Tracks are downloaded from Supabase Storage and cached in IndexedDB
- **Queue System**: Operations performed offline are queued and executed when connection is restored
- **Retry Logic**: Failed sync operations are retried up to 3 times

### PWA Features

- **Service Worker**: Caches assets and enables offline functionality
- **App Manifest**: Allows installation as a standalone app
- **Auto-Update**: Service worker automatically updates when new version is available
- **Background Sync**: Syncs data in the background even when app is closed

## 🛠 Technology Stack

### Frontend Framework & Libraries

- **React 18.3.1**: UI library for building component-based interfaces
- **TypeScript 5.6.2**: Type-safe JavaScript for better development experience
- **Vite 6.0.5**: Fast build tool and development server
- **React Router DOM 7.1.1**: Client-side routing for single-page application

### UI & Styling

- **Tailwind CSS 3.4.17**: Utility-first CSS framework for rapid UI development
- **Heroicons 2.2.0**: Beautiful SVG icon library
- **Headless UI 2.2.0**: Unstyled, accessible UI components

### State Management & Data

- **IndexedDB**: Client-side database for offline storage
- **Supabase 2.90.1**: Backend-as-a-Service for cloud storage and database
  - PostgreSQL database for metadata
  - Supabase Storage for audio files
- **React Hooks**: Built-in state management (useState, useEffect, useCallback)

### Drag & Drop

- **@dnd-kit/core 6.3.1**: Modern drag and drop toolkit
- **@dnd-kit/sortable 10.0.0**: Sortable list components
- **@dnd-kit/utilities 3.2.2**: Utility functions for drag and drop

### Internationalization

- **i18next 24.2.1**: Internationalization framework
- **react-i18next 15.4.0**: React bindings for i18next
- **i18next-browser-languagedetector 8.0.2**: Automatic language detection

### PWA & Offline Support

- **vite-plugin-pwa 1.2.0**: PWA plugin for Vite
- **Workbox 7.4.0**: Service worker library for caching strategies
- **Service Worker API**: Browser API for offline functionality

### Audio Processing

- **Web Audio API**: Audio playback and visualization
- **HTML5 Audio Element**: Native audio playback support
- **AudioContext**: Advanced audio processing and analysis

### Build Tools & Development

- **ESLint 9.17.0**: Code linting and quality checks
- **TypeScript ESLint**: TypeScript-specific linting rules
- **PostCSS 8.4.49**: CSS processing
- **Autoprefixer 10.4.20**: Automatic vendor prefixing

### Deployment

- **Vercel**: Hosting platform for frontend deployment
- **Vercel Configuration**: SPA routing and cache headers

## 🏗 Architecture

### Component Structure

```
App
├── MainLayout
│   ├── Header (with UserMenu)
│   ├── Outlet (Home page)
│   └── Player (fixed bottom)
└── Routes
    └── Home
        └── Playlist
            ├── TrackList
            ├── SyncStatus
            └── Controls
```

### Service Layer

- **indexedDB.ts**: Local database operations (CRUD for tracks and playlists)
- **supabaseService.ts**: Cloud database and storage operations
- **syncService.ts**: Orchestrates bidirectional synchronization
- **syncQueue.ts**: Manages queue of offline operations

### Data Models

**Track**:
```typescript
{
  id: string;
  title: string;
  artist?: string;
  duration: number;
  order: number;
  fileBlob: Blob;
  synced: boolean;
  updatedAt: number;
}
```

**Playlist**:
```typescript
{
  id: string;
  title: string;
  tracks: string[]; // Array of track IDs
  breakTime: number;
  startTime?: string;
  createdAt: number;
  updatedAt: number;
  synced: boolean;
}
```

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18 or higher
- **npm** or **yarn**: Package manager
- **Supabase Account**: For cloud storage and database

### Installation

1. **Clone the repository**:
```bash
git clone <repository-url>
cd music-planner
```

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment variables** (see [Environment Variables](#environment-variables))

4. **Set up Supabase database** (see [Database Setup](#database-setup))

5. **Start development server**:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The production build will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## 🔐 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Getting Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create a new project or select an existing one
3. Go to **Settings** → **API**
4. Copy the **Project URL** and **anon/public key**

### Vercel Deployment

For Vercel deployment, add these environment variables in your Vercel project settings:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Select all environments (Production, Preview, Development)
5. Redeploy your application

## 🗄 Database Setup

### Supabase Database Schema

Run the SQL script in `supabase-schema.sql` in your Supabase SQL Editor:

1. Go to **SQL Editor** in Supabase Dashboard
2. Create a new query
3. Copy and paste the contents of `supabase-schema.sql`
4. Execute the query

This will create:
- `tracks` table with columns: id, title, artist, duration, storage_url, order, created_at, updated_at
- `playlists` table with columns: id, title, tracks (array), break_time, start_time, created_at, updated_at
- Indexes for better query performance
- Row Level Security (RLS) policies

### Supabase Storage Setup

1. Go to **Storage** in Supabase Dashboard
2. Create a new bucket named `music-planner`
3. Set the bucket to **Public** (or configure RLS policies)
4. Run the SQL script in `supabase-storage-policies.sql` to set up storage policies

## 📦 Deployment

### Vercel Deployment

1. **Connect your repository** to Vercel
2. **Configure environment variables** (see [Environment Variables](#environment-variables))
3. **Deploy**: Vercel will automatically deploy on every push to main branch

The `vercel.json` file is already configured for:
- SPA routing (all routes redirect to index.html)
- Cache headers for static assets
- Proper content types for PWA files

### Build Configuration

The app uses conditional base paths:
- **Development**: `/concert-planner/`
- **Production**: `/` (root)

This is configured in `vite.config.ts` and `main.tsx`.

## 📁 Project Structure

```
music-planner/
├── public/                 # Static assets
│   ├── pwa-192x192.png    # PWA icons
│   ├── pwa-512x512.png
│   └── favicon.ico
├── src/
│   ├── components/        # React components
│   │   ├── Player.tsx    # Audio player component
│   │   ├── Playlist.tsx  # Main playlist component
│   │   ├── SyncStatus.tsx # Sync status indicator
│   │   └── ...
│   ├── config/
│   │   └── supabase.ts   # Supabase client configuration
│   ├── hooks/            # Custom React hooks
│   │   ├── usePWA.ts    # PWA functionality
│   │   └── usePlaylists.ts
│   ├── layouts/
│   │   └── MainLayout.tsx # Main app layout
│   ├── locales/          # i18n translation files
│   │   ├── en/
│   │   └── es/
│   ├── pages/
│   │   └── Home.tsx     # Home page
│   ├── services/        # Business logic
│   │   ├── indexedDB.ts # Local database operations
│   │   ├── supabaseService.ts # Cloud operations
│   │   ├── syncService.ts # Sync orchestration
│   │   └── syncQueue.ts # Offline queue management
│   ├── types/
│   │   └── index.ts     # TypeScript type definitions
│   ├── App.tsx          # Root component
│   ├── main.tsx         # Application entry point
│   └── i18n.ts          # i18n configuration
├── supabase-schema.sql   # Database schema
├── supabase-storage-policies.sql # Storage policies
├── vercel.json          # Vercel configuration
├── vite.config.ts       # Vite configuration
└── package.json         # Dependencies and scripts
```

## 🔄 Sync Mechanism

### How Synchronization Works

1. **Initial Load**: On app start, if online, performs full sync from Supabase
2. **Periodic Sync**: Every 30 seconds, syncs changes bidirectionally
3. **Event-Driven**: Listens for online/offline events to trigger sync
4. **Queue Processing**: Processes queued operations when coming online

### Sync Flow

```
┌─────────────┐
│ User Action │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  IndexedDB  │ (Immediate save)
└──────┬──────┘
       │
       ├─── Online? ──Yes──► ┌──────────┐
       │                      │ Supabase │
       │                      └──────────┘
       │
       └─── No ──► ┌─────────────┐
                   │ Sync Queue │
                   └────────────┘
```

### Conflict Resolution

- **Server Wins**: When there's a conflict, Supabase data takes precedence
- **Timestamp Comparison**: Uses `updatedAt` timestamp to determine latest version
- **Automatic Merge**: Tracks are merged based on update timestamps

## 🎨 Key Features Explained

### Offline-First Architecture

The app is designed to work completely offline:
- All data is stored in IndexedDB
- Operations work immediately without network
- Changes are queued and synced when online
- No data loss if network is interrupted

### Progressive Web App (PWA)

- **Installable**: Can be installed on any device
- **Offline Support**: Works without internet connection
- **App-like Experience**: Standalone window, no browser UI
- **Auto-Updates**: Service worker updates automatically

### Audio Player

- **Visualization**: Real-time audio waveform visualization
- **Controls**: Play, pause, skip, shuffle, repeat
- **Volume Control**: Adjustable volume with mute
- **Progress Tracking**: Shows current time and duration

## 📝 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🐛 Troubleshooting

### Common Issues

**Issue**: "Missing Supabase environment variables"
- **Solution**: Ensure `.env` file exists with correct variables, or set them in Vercel

**Issue**: Tracks not loading in new browser
- **Solution**: Check that Supabase database and storage are properly configured

**Issue**: Service worker not updating
- **Solution**: Clear browser cache and hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

**Issue**: Audio not playing
- **Solution**: Check browser autoplay policies - user interaction may be required

## 📚 Additional Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

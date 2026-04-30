# 🎙️ UpBeat Radio Android App

> **⚠️ UNOFFICIAL** — This is an independent, community-built Android client for UpBeat Radio. Not affiliated with or endorsed by UpBeat Radio.

A modern, feature-rich Android app for streaming **UpBeat Radio** with live station data, now-playing information, DJ schedules, and offline-friendly playback controls.

---

## ✨ Features

- 🎵 **Live Stream Playback** — Crystal-clear audio streaming with background playback support
- 📊 **Live Stats** — Real-time now-playing information, listener count, and station status
- ⏪ **Recently Played** — See the last tracks broadcast on UpBeat
- 📅 **DJ Schedule** — View upcoming booked DJ slots with avatars and countdown timers
- 🌙 **Dark Theme** — Premium dark UI with magenta accents designed for late-night listening
- 🎛️ **Fullscreen Mode** — Landscape fullscreen with rich song metadata and next-DJ info
- 🔄 **Smart Caching** — Efficient data fetching to minimize bandwidth usage
- ♿ **Responsive Design** — Works great on phones, tablets, and all Android versions

---

## 📲 Download

### Quick Start
Download the latest APK from [GitHub Releases](https://github.com/taygotexpo/upbeat-radio-android/releases):

1. Go to **[Releases](https://github.com/taygotexpo/upbeat-radio-android/releases)**
2. Download `app-debug.apk` (or `app-release.apk` for production builds)
3. Install on your Android device
4. Open and stream

> **Note:** Debug builds work perfectly for personal use. For distribution, use the signed release build.

---

## 🛠️ Development

### Prerequisites
- Node.js 18+ and npm
- Java 17 (JDK)
- Android SDK (tools and API 36+)
- Expo CLI

### Setup

```bash
# Install dependencies
npm install

# Start Expo dev server
npx expo start

# Build & run on Android
npm run android

# Build debug APK (fast, ~5 min)
npm run apk:debug

# Build release APK (slower, ~10 min)
npm run apk:release
```

---

## 🏗️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Expo 54 + React Native 0.81 |
| **Routing** | Expo Router (file-based) |
| **UI Components** | React Native, Animated API |
| **State** | React hooks + context |
| **Styling** | StyleSheet API |
| **Media** | expo-av for playback, expo-screen-orientation for fullscreen |
| **Build** | Gradle 8.14.3, Kotlin 2.1.20 |

---

## 🔗 API Integration

- **Base URL:** `https://upbeatradio.net/api/v1`
- **Endpoints:**
  - `GET /stats` — Live station data
  - `GET /recentlyPlayed` — Track history
  - `GET /booked` — Upcoming DJ slots
  - `GET /metadata/?artist=...&song=...` — Optional song metadata enrichment

---

## 📝 Disclaimers & Legal

### ⚖️ Unofficial & Community-Built
This app is **not official** and is not affiliated with, endorsed by, or supported by UpBeat Radio or its operators. Use at your own discretion.

### 🤖 AI-Assisted Development
**Parts of this project were created or refined using GitHub Copilot AI.** This includes:
- UI component design and layout
- Helper functions and utilities
- TypeScript/Kotlin type definitions
- Build configuration and scripts
- Code optimization and refactoring

All AI-generated code has been reviewed, tested, and adapted to fit the project's requirements.

### 📜 Terms of Use
By using this app, you agree to:
- **UpBeat Radio's Terms of Service** (if applicable)
- **Android's Acceptable Use Policy**
- Not to reverse-engineer, modify, or misuse the app for unauthorized purposes
- That the developers are not liable for downtime, data loss, or service interruptions

---

## 🐛 Issues & Feedback

Found a bug? Have a feature idea? Open an issue on GitHub or reach out to the developer.

---

## 📄 License

This project is provided as-is for personal and non-commercial use. See `LICENSE` file (if present) for details.

---

## 🙏 Acknowledgments

- **UpBeat Radio** — For the awesome music and API
- **Expo** — For the incredible cross-platform development framework
- **React Native Community** — For the amazing ecosystem

---

**Made with 🎵 and ☕ by the community. Enjoy the stream!**

# UpBeat Radio Android App

> **UNOFFICIAL** — This is not affiliated with, endorsed by, or supported by UpBeat Radio.

An Android app for streaming UpBeat Radio with live now-playing info, DJ schedules, and playback controls.

## Features

- Live stream playback with background audio support
- Live station stats (now playing, listener count)
- Recently played track history
- Weekly DJ schedule with countdown timers
- Dark UI with fullscreen mode
- Metadata caching to reduce bandwidth

## Download

Get the latest APK from [GitHub Releases](https://github.com/taynotfound/upbeat/releases).

1. Download `app-debug.apk` (or `app-release.apk`)
2. Install on your Android device
3. Open and stream

## Build Locally

All builds run entirely on your PC with Gradle. No cloud dependency.

### Debug APK (Fast, ~5 min)
```bash
npm run apk:debug
```
For testing and development. Includes debug symbols, optimized for iteration. Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK (~10 min)
```bash
npm run apk:release
```
Final production build. Fully optimized, minified, and ready for distribution. Output: `android/app/build/outputs/apk/release/app-release.apk`
Everything builds 100% locally on your machine.


## Tech Stack

- **Framework:** Expo 54 + React Native 0.81
- **Routing:** Expo Router
- **Build:** Gradle 8.14.3, Kotlin 2.1.20
- **Media:** expo-av, expo-screen-orientation

## API

Connects to `https://upbeatradio.net/api/v1`:
- `GET /stats` — Current now-playing info
- `GET /recentlyPlayed` — Track history
- `GET /booked` — DJ schedule

## Legal

### Disclaimer

This app is **not official** and has no affiliation with UpBeat Radio. Use at your own risk.

### AI Usage

Parts of this project were developed or refined using GitHub Copilot, including:
- UI components and layouts
- Utility functions and helpers
- Type definitions
- Build configuration
- Code optimization

All code has been reviewed and tested.

### License

[GPLv3](LICENSE) — You're free to use, modify, and distribute this code under the terms of the GPL. See [LICENSE](LICENSE) for details.

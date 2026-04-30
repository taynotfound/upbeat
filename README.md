# UpBeat Radio Android App

Expo Router app for streaming UpBeat Radio on Android with live API data.

## Features

- Live stream playback using UpBeat listen URL
- Background playback mode configured for radio/audio sessions
- Live now-playing card from `GET /stats`
- Recently played songs from `GET /recentlyPlayed`
- Weekly booked slots from `GET /booked`

## API

- Base URL: `https://upbeatradio.net/api/v1`
- Endpoints used:
  - `/stats`
  - `/recentlyPlayed`
  - `/booked`

## Run Locally

1. Install dependencies

```bash
npm install
```

2. Start Expo

```bash
npx expo start
```

3. Launch Android

```bash
npm run android
```

## Notes

- Background audio mode is configured in `app.json`.
- On Android, lock screen and transport controls can vary by device and environment.

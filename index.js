import TrackPlayer from 'react-native-track-player';

import { playbackService } from './playback-service';

TrackPlayer.registerPlaybackService(() => playbackService);

import 'expo-router/entry';

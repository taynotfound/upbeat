import TrackPlayer, {
    AppKilledPlaybackBehavior,
    Capability,
    Event,
    State,
    type AddTrack,
} from 'react-native-track-player';

export const LIVE_TRACK_ID = 'upbeat-live-stream';

let initialized = false;

export async function ensureRadioPlayer(): Promise<void> {
  if (initialized) {
    return;
  }

  await TrackPlayer.setupPlayer();
  await TrackPlayer.updateOptions({
    capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    compactCapabilities: [Capability.Play, Capability.Pause],
    notificationCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    progressUpdateEventInterval: 1,
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
    },
  });

  initialized = true;
}

export async function ensureLiveTrack(url: string, metadata?: Partial<AddTrack>): Promise<void> {
  await ensureRadioPlayer();

  const queue = await TrackPlayer.getQueue();
  const track = queue.find((item) => item.id === LIVE_TRACK_ID);

  const nextTrack: AddTrack = {
    id: LIVE_TRACK_ID,
    url,
    title: metadata?.title ?? 'UpBeat Live',
    artist: metadata?.artist ?? 'UpBeat Radio',
    artwork: metadata?.artwork,
    isLiveStream: true,
  };

  if (!track) {
    await TrackPlayer.reset();
    await TrackPlayer.add(nextTrack);
    return;
  }

  const isDifferentUrl = String(track.url) !== String(url);
  if (isDifferentUrl) {
    await TrackPlayer.reset();
    await TrackPlayer.add(nextTrack);
    return;
  }

  await TrackPlayer.updateNowPlayingMetadata({
    title: nextTrack.title,
    artist: nextTrack.artist,
    artwork: nextTrack.artwork,
    isLiveStream: true,
  });
}

export async function playLive(url: string, metadata?: Partial<AddTrack>): Promise<void> {
  await ensureLiveTrack(url, metadata);
  await TrackPlayer.play();
}

export async function pauseLive(): Promise<void> {
  await ensureRadioPlayer();
  await TrackPlayer.pause();
}

export async function getLiveState(): Promise<State> {
  await ensureRadioPlayer();
  const playback = await TrackPlayer.getPlaybackState();
  return playback.state;
}

export function subscribePlaybackState(onChange: (state: State) => void): () => void {
  const subscription = TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
    onChange(event.state);
  });

  return () => {
    subscription.remove();
  };
}

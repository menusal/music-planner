export interface Track {
  id: string;
  title: string;
  artist?: string;
  duration: number;
  url: string;
  file?: File;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  isShuffled: boolean;
  isRepeating: boolean;
}

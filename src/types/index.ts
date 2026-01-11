export interface Track {
  id: string;
  title: string;
  artist?: string;
  duration: number;
  url: string;
  file?: File;
  storageUrl?: string; // URL from Supabase Storage (for mobile compatibility)
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  isShuffled: boolean;
  isRepeating: boolean;
}

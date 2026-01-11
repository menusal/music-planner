import { useOutletContext } from "react-router-dom";
import Playlist from "../components/Playlist";
import { Track } from "../types";

type ContextType = {
  playlist: Track[];
  setPlaylist: (playlist: Track[]) => void;
  currentTrack: Track | null;
  setCurrentTrack: (track: Track | null) => void;
  setShouldAutoPlay: (shouldAutoPlay: boolean) => void;
};

export default function Home() {
  const { playlist, setPlaylist, currentTrack, setCurrentTrack, setShouldAutoPlay } =
    useOutletContext<ContextType>();

  return (
    <Playlist
      tracks={playlist}
      currentTrack={currentTrack}
      onTrackSelect={setCurrentTrack}
      onPlaylistUpdate={setPlaylist}
      setShouldAutoPlay={setShouldAutoPlay}
    />
  );
}

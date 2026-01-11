import { Outlet } from "react-router-dom";
import { UserMenu } from "../components/UserMenu";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Player from "../components/Player";
import { Track } from "../types";

export default function MainLayout() {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);

  return (
    <div className="h-screen w-full bg-gray-900 text-white flex flex-col">
      <div className="fixed top-0 left-0 right-0 bg-gray-900 z-10">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-xl font-semibold text-white">{t("title")}</h1>
          <button
            onClick={() => setIsMenuOpen(true)}
            className="p-2 hover:bg-gray-800 rounded-full transition-colors"
          >
            <Bars3Icon className="w-6 h-6 text-gray-400" />
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto mt-[72px] mb-[120px] px-4">
        <Outlet
          context={{ 
            playlist, 
            setPlaylist, 
            currentTrack, 
            setCurrentTrack,
            setShouldAutoPlay 
          }}
        />
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 z-10">
        <Player
          currentTrack={currentTrack}
          playlist={playlist}
          onTrackChange={setCurrentTrack}
          shouldAutoPlay={shouldAutoPlay}
          onAutoPlayHandled={() => setShouldAutoPlay(false)}
        />
      </div>

      <UserMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </div>
  );
}

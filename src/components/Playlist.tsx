import { useState, useCallback, useEffect, useRef } from "react";
import { Track } from "../types";
import {
  PlayIcon,
  MusicalNoteIcon,
  TrashIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/solid";
import { useTranslation } from "react-i18next";
import { getAllTracks, saveTrack, deleteTrack } from "../services/indexedDB";

interface PlaylistProps {
  tracks: Track[];
  currentTrack: Track | null;
  onTrackSelect: (track: Track) => void;
  onPlaylistUpdate: (tracks: Track[]) => void;
  playlistId?: string;
}

const BREAK_TIME_KEY = "playerBreakTime";
const TRACKS_ORDER_KEY = "tracksOrder";
const PLAYLIST_TITLE_KEY = "playlistTitle";

export default function Playlist({
  tracks,
  currentTrack,
  onTrackSelect,
  onPlaylistUpdate,
}: PlaylistProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedTrack, setDraggedTrack] = useState<Track | null>(null);
  const [breakTime, setBreakTime] = useState(() => {
    const savedBreakTime = localStorage.getItem(BREAK_TIME_KEY);
    return savedBreakTime ? parseInt(savedBreakTime) : 0;
  });
  const { t } = useTranslation();
  const [showCopiedFeedback, setShowCopiedFeedback] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState(() => {
    const savedTitle = localStorage.getItem(PLAYLIST_TITLE_KEY);
    return savedTitle || t("playList");
  });
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Guardar break time cuando cambie
  useEffect(() => {
    localStorage.setItem(BREAK_TIME_KEY, breakTime.toString());
  }, [breakTime]);

  // Cargar tracks de IndexedDB y aplicar orden guardado
  useEffect(() => {
    const loadTracks = async () => {
      try {
        const savedTracks = await getAllTracks();
        const tracksWithUrls = savedTracks.map((track) => ({
          id: track.id,
          title: track.title,
          duration: track.duration,
          artist: track.artist,
          url: URL.createObjectURL(track.fileBlob),
          file: new File([track.fileBlob], track.title + ".mp3", {
            type: "audio/mpeg",
          }),
        }));

        // Recuperar y aplicar el orden guardado
        const savedOrder = localStorage.getItem(TRACKS_ORDER_KEY);
        if (savedOrder) {
          const orderIds = JSON.parse(savedOrder);
          const orderedTracks = orderIds
            .map((id: string) =>
              tracksWithUrls.find((track: Track) => track.id === id)
            )
            .filter(Boolean);

          // Añadir nuevas canciones al final
          const newTracks = tracksWithUrls.filter(
            (track: Track) => !orderIds.includes(track.id)
          );

          onPlaylistUpdate([...orderedTracks, ...newTracks]);
        } else {
          onPlaylistUpdate(tracksWithUrls);
        }
      } catch (error) {
        console.error("Error loading tracks:", error);
      }
    };
    loadTracks();
  }, [onPlaylistUpdate]);

  // Guardar orden cuando la playlist cambie
  useEffect(() => {
    if (tracks.length > 0) {
      const orderIds = tracks.map((track) => track.id);
      localStorage.setItem(TRACKS_ORDER_KEY, JSON.stringify(orderIds));
    }
  }, [tracks]);

  // Save title when it changes
  useEffect(() => {
    localStorage.setItem(PLAYLIST_TITLE_KEY, playlistTitle);
  }, [playlistTitle]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter(
        (file) => file.type === "audio/mpeg"
      );

      const newTracks = [...tracks];

      for (const file of files) {
        const url = URL.createObjectURL(file);
        const audio = new Audio(url);

        await new Promise((resolve) => {
          audio.addEventListener("loadedmetadata", async () => {
            const newTrack: Track = {
              id: Math.random().toString(36).substr(2, 9),
              title: file.name.replace(".mp3", ""),
              duration: audio.duration,
              url,
              file,
            };

            try {
              await saveTrack({
                id: newTrack.id,
                title: newTrack.title,
                duration: newTrack.duration,
                artist: newTrack.artist,
                fileBlob: file,
              });

              newTracks.push(newTrack);
              resolve(null);
            } catch (error) {
              console.error("Error saving track:", error);
              resolve(null);
            }
          });
        });
      }

      onPlaylistUpdate(newTracks);
    },
    [tracks, onPlaylistUpdate]
  );

  const formatDuration = (duration: number) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const totalDuration = tracks.reduce(
    (sum, track) => sum + track.duration + breakTime,
    tracks.length > 0 ? -breakTime : 0
  );

  const handleTrackDragStart = (track: Track) => {
    setDraggedTrack(track);
  };

  const handleTrackDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevenir que se active el drag & drop de archivos
  };

  const handleTrackDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation(); // Prevenir que se active el drag & drop de archivos

    if (!draggedTrack) return;

    const dragIndex = tracks.findIndex((t) => t.id === draggedTrack.id);
    if (dragIndex === dropIndex) return;

    const newTracks = [...tracks];
    newTracks.splice(dragIndex, 1);
    newTracks.splice(dropIndex, 0, draggedTrack);

    onPlaylistUpdate(newTracks);
    setDraggedTrack(null);
  };

  const handleDeleteTrack = useCallback(
    async (e: React.MouseEvent, trackId: string) => {
      e.stopPropagation();
      try {
        await deleteTrack(trackId);
        const newTracks = tracks.filter((track) => track.id !== trackId);
        onPlaylistUpdate(newTracks);
      } catch (error) {
        console.error("Error deleting track:", error);
      }
    },
    [tracks, onPlaylistUpdate]
  );

  const handleBreakTimeChange = (value: number) => {
    setBreakTime(value);
    localStorage.setItem(BREAK_TIME_KEY, value.toString());
  };

  const calculateAccumulatedTime = useCallback(
    (index: number): number => {
      return (
        tracks.slice(0, index + 1).reduce((acc, track) => {
          return acc + track.duration + (breakTime > 0 ? breakTime : 0);
        }, 0) - (breakTime > 0 ? breakTime : 0)
      ); // Restamos el último break
    },
    [tracks, breakTime]
  );

  const handleCopyToClipboard = useCallback(() => {
    const playlistText = tracks
      .map((track, index) => {
        const duration = formatDuration(track.duration);
        const breakTimeText =
          breakTime > 0 && index < tracks.length - 1
            ? ` (+${formatDuration(breakTime)})`
            : "";
        const accumulatedTime = formatDuration(calculateAccumulatedTime(index));
        return `${index + 1}. ${track.title}${
          track.artist ? ` - ${track.artist}` : ""
        } [${duration}${breakTimeText}] [${t(
          "accumulated"
        )}: ${accumulatedTime}]`;
      })
      .join("\n");

    const totalDurationText = `\n${t("totalDuration")}: ${formatDuration(
      totalDuration
    )}`;

    navigator.clipboard.writeText(playlistText + totalDurationText);
    setShowCopiedFeedback(true);
    setTimeout(() => setShowCopiedFeedback(false), 2000);
  }, [tracks, breakTime, totalDuration, t, calculateAccumulatedTime]);

  const handleTitleClick = () => {
    setIsEditingTitle(true);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaylistTitle(e.target.value);
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setIsEditingTitle(false);
    }
  };

  // Add this effect to handle text selection
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  return (
    <div
      className={`min-h-full w-full pt-4 ${
        isDragging
          ? "border-2 border-dashed border-gray-500 bg-gray-800/50"
          : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mb-12">
        <div className="flex justify-between items-center">
          {isEditingTitle ? (
            <input
              type="text"
              value={playlistTitle}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="text-2xl font-bold bg-transparent outline-none"
              autoFocus
              ref={titleInputRef}
            />
          ) : (
            <h2
              className="text-2xl font-bold cursor-pointer hover:text-gray-300"
              onClick={handleTitleClick}
            >
              {playlistTitle}
            </h2>
          )}
          {tracks.length > 0 && (
            <button
              onClick={handleCopyToClipboard}
              className="flex items-center space-x-2 px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-md relative group"
              title={showCopiedFeedback ? t("copied") : t("copyToClipboard")}
            >
              <ClipboardDocumentIcon className="w-4 h-4" />
              <span>
                {showCopiedFeedback ? t("copied") : t("copyToClipboard")}
              </span>
              <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-900 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
                {showCopiedFeedback ? t("copied") : t("copyToClipboard")}
              </div>
            </button>
          )}
        </div>
        <div className="mt-4 flex items-center space-x-2">
          <label htmlFor="breakTime" className="text-sm text-gray-400">
            {t("breakTimeLabel")}
          </label>
          <input
            id="breakTime"
            type="number"
            min="0"
            max="300"
            value={breakTime}
            onChange={(e) => handleBreakTimeChange(Number(e.target.value))}
            className="w-20 px-2 py-1 text-sm bg-gray-700 rounded-md text-white"
            placeholder="0"
          />
          <span className="text-sm text-gray-400">{t("seconds")}</span>
        </div>
        {tracks.length === 0 && (
          <p className="text-gray-400 mt-4">{t("noTracks")}</p>
        )}
      </div>

      <div className="space-y-1">
        {tracks.map((track, index) => {
          const isCurrentTrack = currentTrack?.id === track.id;

          return (
            <div
              key={track.id}
              className={`flex items-center space-x-4 p-2 hover:bg-gray-800/50 rounded-md group cursor-pointer
                ${isCurrentTrack ? "bg-gray-800/30" : ""}`}
              onClick={() => {
                onTrackSelect(track);
                const audioElement = document.querySelector("audio");
                if (audioElement) {
                  audioElement.play();
                }
              }}
              draggable
              onDragStart={() => handleTrackDragStart(track)}
              onDragOver={(e) => handleTrackDragOver(e, index)}
              onDrop={(e) => handleTrackDrop(e, index)}
            >
              <div
                className={`w-8 text-sm ${
                  isCurrentTrack ? "text-green-500" : "text-gray-400"
                } group-hover:hidden`}
              >
                {index + 1}
              </div>
              <div className="w-8 hidden group-hover:block">
                <PlayIcon
                  className={`w-5 h-5 ${
                    isCurrentTrack ? "text-green-500" : "text-white"
                  }`}
                />
              </div>
              <div className="flex items-center flex-1">
                <MusicalNoteIcon
                  className={`w-5 h-5 mr-3 ${
                    isCurrentTrack ? "text-green-500" : "text-gray-400"
                  }`}
                />
                <div>
                  <div
                    className={`font-medium ${
                      isCurrentTrack ? "text-green-500" : ""
                    }`}
                  >
                    {track.title}
                  </div>
                  {track.artist && (
                    <div className="text-sm text-gray-400">{track.artist}</div>
                  )}
                </div>
              </div>
              <div className="text-sm text-gray-400">
                <div>
                  {formatDuration(track.duration)}
                  {breakTime > 0 && index < tracks.length - 1 && (
                    <span className="text-gray-500 ml-1">
                      (+{formatDuration(breakTime)})
                    </span>
                  )}
                </div>
                <div className=" text-gray-500 text-left">
                  {/* {t("accumulated")}:{" "} */}
                  {formatDuration(calculateAccumulatedTime(index))}
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteTrack(e, track.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded-full"
              >
                <TrashIcon className="w-4 h-4 text-red-500" />
              </button>
            </div>
          );
        })}
      </div>

      {tracks.length > 0 && (
        <div className="my-4 text-sm text-gray-400 pb-8">
          {t("totalDuration")}: {formatDuration(totalDuration)}
        </div>
      )}
    </div>
  );
}

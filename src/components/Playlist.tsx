import { useState, useCallback, useEffect, useRef } from "react";
import { Track } from "../types";
import {
  PlayIcon,
  MusicalNoteIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/solid";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { getAllTracks, saveTrack, deleteTrack } from "../services/indexedDB";
import { syncTracksToFirestore, isOnline, performFullSync, syncTracksOrderToFirestore } from "../services/syncService";
import { addToSyncQueue } from "../services/syncQueue";
import SyncStatus from "./SyncStatus";

interface PlaylistProps {
  tracks: Track[];
  currentTrack: Track | null;
  onTrackSelect: (track: Track) => void;
  onPlaylistUpdate: (tracks: Track[]) => void;
  setShouldAutoPlay: (shouldAutoPlay: boolean) => void;
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
  setShouldAutoPlay,
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
  const [startTime, setStartTime] = useState(() => {
    const savedTime = localStorage.getItem("concertStartTime");
    return savedTime || "";
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number | null>(
    null
  );
  const [isMobile, setIsMobile] = useState(false);

  // Mover calculateTimeAtPoint aquí, antes de handleCopyToClipboard
  const calculateTimeAtPoint = useCallback(
    (accumulatedSeconds: number): string => {
      if (!startTime) return "";

      const [hours, minutes] = startTime.split(":").map(Number);
      const startDate = new Date();
      startDate.setHours(hours, minutes, 0, 0);

      const timeAtPoint = new Date(
        startDate.getTime() + accumulatedSeconds * 1000
      );
      return timeAtPoint.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [startTime]
  );

  // Guardar break time cuando cambie
  useEffect(() => {
    localStorage.setItem(BREAK_TIME_KEY, breakTime.toString());
  }, [breakTime]);

  // Function to load tracks from IndexedDB
  const loadTracks = useCallback(async () => {
    try {
      const savedTracks = await getAllTracks();
      const tracksWithUrls: Track[] = [];
      for (const track of savedTracks) {
        if (track.fileBlob) {
          try {
            tracksWithUrls.push({
              id: track.id,
              title: track.title,
              duration: track.duration,
              artist: track.artist,
              url: URL.createObjectURL(track.fileBlob),
              file: new File([track.fileBlob], track.title + ".mp3", {
                type: "audio/mpeg",
              }),
            });
          } catch (error) {
            console.error(`Error creating URL for track ${track.id}:`, error);
          }
        }
      }

      // Sort tracks by order field from IndexedDB, then by created_at as fallback
      const sortedTracks = tracksWithUrls.sort((a, b) => {
        const trackA = savedTracks.find(t => t.id === a.id);
        const trackB = savedTracks.find(t => t.id === b.id);
        const orderA = trackA?.order ?? 0;
        const orderB = trackB?.order ?? 0;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        // If order is the same, maintain original order
        return 0;
      });

      onPlaylistUpdate(sortedTracks);
    } catch (error) {
      console.error("Error loading tracks:", error);
    }
  }, [onPlaylistUpdate]);

  // Load tracks from IndexedDB on mount and after sync events
  useEffect(() => {
    loadTracks();
    
    // Listen for sync completion events to reload tracks
    const handleSyncComplete = () => {
      console.log('Sync completed, reloading tracks...');
      // Small delay to ensure IndexedDB has been updated
      setTimeout(() => {
        loadTracks();
      }, 500);
    };
    
    const handleTracksSynced = () => {
      console.log('Tracks synced, reloading tracks...');
      setTimeout(() => {
        loadTracks();
      }, 500);
    };
    
    // Listen for custom sync events
    window.addEventListener('sync-complete', handleSyncComplete);
    window.addEventListener('tracks-synced', handleTracksSynced);
    window.addEventListener('initial-sync-complete', handleSyncComplete);
    window.addEventListener('online', handleSyncComplete);
    
    return () => {
      window.removeEventListener('sync-complete', handleSyncComplete);
      window.removeEventListener('tracks-synced', handleTracksSynced);
      window.removeEventListener('initial-sync-complete', handleSyncComplete);
      window.removeEventListener('online', handleSyncComplete);
    };
  }, [loadTracks]);

  // Save order to IndexedDB and sync to Supabase when tracks are reordered
  const saveTracksOrder = useCallback(async (tracksToSave: Track[]) => {
    if (tracksToSave.length === 0) return;

    try {
      // Update order in IndexedDB for each track
      const updatePromises = tracksToSave.map(async (track, index) => {
        const savedTracks = await getAllTracks();
        const savedTrack = savedTracks.find(t => t.id === track.id);
        if (savedTrack) {
          await saveTrack({
            ...savedTrack,
            order: index,
            updatedAt: Date.now(),
          });
        }
      });

      await Promise.all(updatePromises);

      // Sync order to Supabase if online
      if (isOnline()) {
        try {
          const trackOrders = tracksToSave.map((track, index) => ({
            trackId: track.id,
            order: index,
          }));
          await syncTracksOrderToFirestore(trackOrders);
        } catch (error) {
          console.error("Error syncing order to Supabase:", error);
          // Add to sync queue for later retry
          await addToSyncQueue({
            type: "UPDATE_TRACK_ORDER",
            data: {
              trackOrders: tracksToSave.map((track, index) => ({
                trackId: track.id,
                order: index,
              })),
            },
          });
        }
      } else {
        // Add to sync queue if offline
        await addToSyncQueue({
          type: "UPDATE_TRACK_ORDER",
          data: {
            trackOrders: tracksToSave.map((track, index) => ({
              trackId: track.id,
              order: index,
            })),
          },
        });
      }

      // Also save to localStorage as backup
      const orderIds = tracksToSave.map((track) => track.id);
      localStorage.setItem(TRACKS_ORDER_KEY, JSON.stringify(orderIds));
    } catch (error) {
      console.error("Error saving tracks order:", error);
    }
  }, []);

  // Guardar orden cuando la playlist cambie
  useEffect(() => {
    if (tracks.length > 0) {
      saveTracksOrder(tracks);
    }
  }, [tracks, saveTracksOrder]);

  // Auto-select first track when tracks are loaded and no track is selected
  useEffect(() => {
    if (tracks.length > 0 && !currentTrack) {
      const firstTrack = tracks[0];
      if (firstTrack && firstTrack.url) {
        console.log('Auto-selecting first track:', firstTrack.title);
        onTrackSelect(firstTrack);
      }
    }
  }, [tracks, currentTrack, onTrackSelect]);

  // Save title when it changes
  useEffect(() => {
    localStorage.setItem(PLAYLIST_TITLE_KEY, playlistTitle);
  }, [playlistTitle]);

  // Detectar si es dispositivo móvil
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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
                synced: false,
                updatedAt: Date.now(),
              });

              // Sync to Firestore if online, otherwise queue
              if (isOnline()) {
                syncTracksToFirestore().catch((error) => {
                  console.error("Error syncing track to Firestore:", error);
                });
              } else {
                addToSyncQueue({
                  type: "ADD_TRACK",
                  data: {
                    id: newTrack.id,
                    title: newTrack.title,
                    duration: newTrack.duration,
                    artist: newTrack.artist,
                    fileBlob: file,
                  },
                }).catch((error) => {
                  console.error("Error adding to sync queue:", error);
                });
              }

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
        
        // Sync deletion to Firestore if online, otherwise queue
        if (isOnline()) {
          import("../services/supabaseService").then(({ deleteTrack: deleteTrackFromFirestore }) => {
            deleteTrackFromFirestore(trackId).catch((error) => {
              console.error("Error deleting track from Firestore:", error);
            });
          });
        } else {
          addToSyncQueue({
            type: "DELETE_TRACK",
            data: { id: trackId },
          }).catch((error) => {
            console.error("Error adding to sync queue:", error);
          });
        }
        
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
        const estimatedTime = startTime
          ? ` [${calculateTimeAtPoint(calculateAccumulatedTime(index))}]`
          : "";
        return `${index + 1}. ${track.title}${
          track.artist ? ` - ${track.artist}` : ""
        } [${duration}${breakTimeText}] [${t(
          "accumulated"
        )}: ${accumulatedTime}]${estimatedTime}`;
      })
      .join("\n");

    const totalDurationText = `\n${t("totalDuration")}: ${formatDuration(
      totalDuration
    )}`;

    const startTimeText = startTime
      ? `\n${t("startTimeLabel")} ${startTime}`
      : "";

    navigator.clipboard.writeText(
      playlistText + totalDurationText + startTimeText
    );
    setShowCopiedFeedback(true);
    setTimeout(() => setShowCopiedFeedback(false), 2000);
  }, [
    tracks,
    breakTime,
    totalDuration,
    t,
    calculateAccumulatedTime,
    startTime,
    calculateTimeAtPoint,
  ]);

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

  const handleStartTimeChange = (value: string) => {
    setStartTime(value);
    localStorage.setItem("concertStartTime", value);
  };

  const handleAddSongClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
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
            // Set order to current tracks length + index of new track
            const order = tracks.length + newTracks.length;
            await saveTrack({
              id: newTrack.id,
              title: newTrack.title,
              duration: newTrack.duration,
              artist: newTrack.artist,
              fileBlob: file,
              order,
              synced: false,
              updatedAt: Date.now(),
            });

            // Sync to Firestore if online, otherwise queue
            if (isOnline()) {
              syncTracksToFirestore().catch((error) => {
                console.error("Error syncing track to Firestore:", error);
              });
            } else {
              addToSyncQueue({
                type: "ADD_TRACK",
                data: {
                  id: newTrack.id,
                  title: newTrack.title,
                  duration: newTrack.duration,
                  artist: newTrack.artist,
                  fileBlob: file,
                },
              }).catch((error) => {
                console.error("Error adding to sync queue:", error);
              });
            }

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
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePlayButtonClick = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent track click handler from firing
    const selectedTrack = tracks[index];
    if (selectedTrack) {
      // If track doesn't have a URL, try to create one from fileBlob
      if (!selectedTrack.url && selectedTrack.file) {
        try {
          const blobUrl = URL.createObjectURL(selectedTrack.file);
          const trackWithUrl = { ...selectedTrack, url: blobUrl };
          console.log('Created blob URL for track:', selectedTrack.title);
          setShouldAutoPlay(true);
          onTrackSelect(trackWithUrl);
          return;
        } catch (error) {
          console.error('Error creating blob URL:', error);
        }
      }
      
      if (selectedTrack.url) {
        // Validate URL format
        const isValidUrl = selectedTrack.url.startsWith('blob:') || 
                          selectedTrack.url.startsWith('http://') || 
                          selectedTrack.url.startsWith('https://');
        
        if (isValidUrl) {
          console.log('Selecting track to play:', selectedTrack.title, 'URL:', selectedTrack.url);
          setShouldAutoPlay(true);
          onTrackSelect(selectedTrack);
        } else {
          console.error('Invalid track URL format:', selectedTrack.url);
          alert('Track URL is invalid. Please try uploading the track again.');
        }
      } else {
        console.warn('Track missing URL at index:', index, selectedTrack);
        alert('Track is missing audio file. Please try uploading the track again.');
      }
    }
  }, [tracks, onTrackSelect, setShouldAutoPlay]);

  const handleTrackClick = async (index: number) => {
    if (isMobile) {
      setSelectedTrackIndex(selectedTrackIndex === index ? null : index);
    } else {
      const selectedTrack = tracks[index];
      if (selectedTrack) {
        // If track doesn't have a URL, try to create one from fileBlob
        if (!selectedTrack.url && selectedTrack.file) {
          try {
            const blobUrl = URL.createObjectURL(selectedTrack.file);
            const trackWithUrl = { ...selectedTrack, url: blobUrl };
            console.log('Created blob URL for track:', selectedTrack.title);
            onTrackSelect(trackWithUrl);
            return;
          } catch (error) {
            console.error('Error creating blob URL:', error);
          }
        }
        
        if (selectedTrack.url) {
          // Validate URL format
          const isValidUrl = selectedTrack.url.startsWith('blob:') || 
                            selectedTrack.url.startsWith('http://') || 
                            selectedTrack.url.startsWith('https://');
          
          if (isValidUrl) {
            console.log('Selecting track:', selectedTrack.title, 'URL:', selectedTrack.url);
            onTrackSelect(selectedTrack);
          } else {
            console.error('Invalid track URL format:', selectedTrack.url);
            alert('Track URL is invalid. Please try uploading the track again.');
          }
        } else {
          console.warn('Track missing URL at index:', index, selectedTrack);
          alert('Track is missing audio file. Please try uploading the track again.');
        }
      } else {
        console.warn('Track not found at index:', index);
      }
    }
  };

  const moveTrack = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= tracks.length) return;

    const newTracks = [...tracks];
    const [movedTrack] = newTracks.splice(fromIndex, 1);
    newTracks.splice(toIndex, 0, movedTrack);
    onPlaylistUpdate(newTracks);
    setSelectedTrackIndex(toIndex);
  };

  const handleRefresh = useCallback(async () => {
    try {
      // Sync from Supabase if online
      if (isOnline()) {
        await performFullSync();
      }
      // Reload tracks from IndexedDB
      await loadTracks();
    } catch (error) {
      console.error("Error refreshing playlist:", error);
    }
  }, [loadTracks]);

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
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between gap-4">
            {isEditingTitle ? (
              <input
                type="text"
                value={playlistTitle}
                onChange={handleTitleChange}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKeyDown}
                className="text-2xl md:text-3xl font-bold bg-transparent outline-none flex-1"
                autoFocus
                ref={titleInputRef}
              />
            ) : (
              <h2
                className="text-2xl md:text-3xl font-bold cursor-pointer hover:text-gray-300 flex-1"
                onClick={handleTitleClick}
              >
                {playlistTitle}
              </h2>
            )}
            <SyncStatus />
          </div>
          <div className="flex flex-row items-center space-x-2">
            <button
              type="button"
              onClick={handleAddSongClick}
              className="flex items-center justify-center space-x-2 px-3 py-2 text-base md:text-sm bg-gray-700 hover:bg-gray-600 rounded-md flex-1"
              aria-label="Add Song"
            >
              <PlusIcon className="w-5 h-5 md:w-4 md:h-4" />
              <span>Add</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="audio/mpeg,audio/*"
              multiple
              style={{ display: "none" }}
              tabIndex={-1}
            />
            <button
              onClick={handleRefresh}
              className="flex items-center justify-center px-3 py-2 text-base md:text-sm bg-gray-700 hover:bg-gray-600 rounded-md"
              aria-label="Refresh Playlist"
              title={t("refresh", "Refresh playlist")}
            >
              <ArrowPathIcon className="w-5 h-5 md:w-4 md:h-4" />
            </button>
            {tracks.length > 0 && (
              <button
                onClick={handleCopyToClipboard}
                className="flex items-center justify-center space-x-2 px-3 py-2 text-base md:text-sm bg-gray-700 hover:bg-gray-600 rounded-md relative group flex-1"
                title={showCopiedFeedback ? t("copied") : t("copyToClipboard")}
              >
                <ClipboardDocumentIcon className="w-5 h-5 md:w-4 md:h-4" />
                <span>
                  {showCopiedFeedback ? t("copied") : t("copyToClipboard")}
                </span>
                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-900 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  {showCopiedFeedback ? t("copied") : t("copyToClipboard")}
                </div>
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex items-center space-x-2">
            <label
              htmlFor="breakTime"
              className="text-base md:text-sm text-gray-400 w-1/2"
            >
              {t("breakTimeLabel")} {t("seconds")}
            </label>
            <input
              id="breakTime"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              max="300"
              value={breakTime}
              onChange={(e) =>
                handleBreakTimeChange(Number(e.target.value) || 0)
              }
              className="w-1/2 px-2 py-1 text-base md:text-sm bg-gray-700 rounded-md text-white"
              placeholder="0"
            />
          </div>

          <div className="flex items-center space-x-2">
            <label
              htmlFor="startTime"
              className="text-base md:text-sm text-gray-400 w-1/2"
            >
              {t("startTimeLabel")}
            </label>
            <input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="w-1/2 px-2 py-1 text-base md:text-sm bg-gray-700 rounded-md text-white"
            />
          </div>
        </div>
        {tracks.length === 0 && (
          <p className="text-base md:text-sm text-gray-400 mt-4">
            {t("noTracks")}
          </p>
        )}
      </div>

      <div className="space-y-1">
        {tracks.map((track, index) => {
          const isCurrentTrack = currentTrack?.id === track.id;
          const isSelected = selectedTrackIndex === index;

          return (
            <div
              key={track.id}
              className={`flex flex-col p-3 md:p-2 hover:bg-gray-800/50 rounded-md group cursor-pointer
                ${isCurrentTrack ? "bg-gray-800/30" : ""}
                ${isSelected ? "bg-gray-800/70" : ""}`}
              onClick={() => handleTrackClick(index)}
              draggable={!isMobile}
              onDragStart={() => !isMobile && handleTrackDragStart(track)}
              onDragOver={(e) => !isMobile && handleTrackDragOver(e)}
              onDrop={(e) => !isMobile && handleTrackDrop(e, index)}
            >
              <div className="flex items-center space-x-4">
                <div
                  className={`w-8 text-base md:text-sm ${
                    isCurrentTrack ? "text-green-500" : "text-gray-400"
                  } group-hover:hidden`}
                >
                  {index + 1}
                </div>
                <div className="w-8 hidden group-hover:block">
                  <button
                    onClick={(e) => handlePlayButtonClick(index, e)}
                    className="flex items-center justify-center"
                    aria-label={`Play ${track.title}`}
                    title={t("play", "Play")}
                  >
                    <PlayIcon
                      className={`w-6 h-6 md:w-5 md:h-5 ${
                        isCurrentTrack ? "text-green-500" : "text-white"
                      } hover:text-green-500 transition-colors`}
                    />
                  </button>
                </div>
                <div className="flex items-center flex-1">
                  <MusicalNoteIcon
                    className={`w-6 h-6 md:w-5 md:h-5 mr-3 ${
                      isCurrentTrack ? "text-green-500" : "text-gray-400"
                    }`}
                  />
                  <div>
                    <div
                      className={`text-base md:text-sm font-medium ${
                        isCurrentTrack ? "text-green-500" : ""
                      }`}
                    >
                      {track.title}
                    </div>
                    {track.artist && (
                      <div className="text-base md:text-sm text-gray-400">
                        {track.artist}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2">
                <div className="text-base md:text-sm text-gray-400">
                  <div>
                    {formatDuration(track.duration)}
                    {breakTime > 0 && index < tracks.length - 1 && (
                      <span className="text-gray-500 ml-1">
                        (+{formatDuration(breakTime)})
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500">
                    {formatDuration(calculateAccumulatedTime(index))}
                    {startTime && (
                      <span className="ml-2 text-gray-400">
                        {calculateTimeAtPoint(calculateAccumulatedTime(index))}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {isMobile && isSelected && (
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTrack(index, index - 1);
                        }}
                        className="p-2 hover:bg-gray-700 rounded-full"
                        disabled={index === 0}
                      >
                        <ChevronUpIcon className="w-7 h-7 md:w-6 md:h-6 text-gray-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTrack(index, index + 1);
                        }}
                        className="p-2 hover:bg-gray-700 rounded-full"
                        disabled={index === tracks.length - 1}
                      >
                        <ChevronDownIcon className="w-7 h-7 md:w-6 md:h-6 text-gray-400" />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={(e) => handleDeleteTrack(e, track.id)}
                    className={`p-2 hover:bg-gray-700 rounded-full ${
                      isMobile
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <TrashIcon className="w-7 h-7 md:w-6 md:h-6 text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {tracks.length > 0 && (
        <div className="my-4 text-base md:text-sm text-gray-400 pb-8">
          {t("totalDuration")}: {formatDuration(totalDuration)}
        </div>
      )}
    </div>
  );
}

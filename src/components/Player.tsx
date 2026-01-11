import { useState, useRef, useEffect, useCallback } from "react";
import {
  PlayIcon,
  PauseIcon,
  ForwardIcon,
  BackwardIcon,
  ArrowPathRoundedSquareIcon,
  ArrowsRightLeftIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/24/solid";
import { Track } from "../types";

interface PlayerProps {
  currentTrack: Track | null;
  playlist: Track[];
  onTrackChange: (track: Track) => void;
  shouldAutoPlay?: boolean;
  onAutoPlayHandled?: () => void;
}

export default function Player({
  currentTrack,
  playlist,
  onTrackChange,
  shouldAutoPlay = false,
  onAutoPlayHandled,
}: PlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [volume, setVolume] = useState(1);
  const [prevVolume, setPrevVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showVolumeControl, setShowVolumeControl] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [isAudioInitialized, setIsAudioInitialized] = useState(false);
  const [gradientColors, setGradientColors] = useState({
    start: "#22c55e",
    end: "#166534",
  });

  const initializeAudio = async () => {
    try {
      if (!audioContextRef.current && audioRef.current) {
        audioContextRef.current = new AudioContext();
        
        // Only resume if context is suspended (requires user interaction)
        if (audioContextRef.current.state === 'suspended') {
          try {
            await audioContextRef.current.resume();
          } catch (error) {
            // AudioContext resume requires user interaction - this is expected
            // The context will be resumed when user interacts with the page
          }
        }

        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.minDecibels = -90;
        analyserRef.current.maxDecibels = -10;
        analyserRef.current.smoothingTimeConstant = 0.85;

        sourceRef.current = audioContextRef.current.createMediaElementSource(
          audioRef.current
        );
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
        setIsAudioInitialized(true);
      } else if (
        audioContextRef.current &&
        audioContextRef.current.state === "suspended"
      ) {
        try {
          await audioContextRef.current.resume();
        } catch (error) {
          // AudioContext resume requires user interaction - this is expected
        }
      }
    } catch (error) {
    }
  };

  // Mover playNextTrack aquí, antes de los efectos
  const playNextTrack = useCallback(() => {
    if (!currentTrack || playlist.length === 0) return;
    
    // Prevent multiple simultaneous calls
    if (isAutoChangingRef.current) return;
    isAutoChangingRef.current = true;

    const currentIndex = playlist.findIndex(
      (track) => track.id === currentTrack.id
    );
    
    // If we're at the last track and not repeating, stop playback
    if (currentIndex === playlist.length - 1 && !isRepeating) {
      setIsPlaying(false);
      isAutoChangingRef.current = false;
      return;
    }
    
    let nextIndex;

    if (isShuffled) {
      let newIndex;
      do {
        newIndex = Math.floor(Math.random() * playlist.length);
      } while (newIndex === currentIndex && playlist.length > 1);
      nextIndex = newIndex;
    } else {
      nextIndex = (currentIndex + 1) % playlist.length;
    }

    // Stop current audio before changing track to prevent conflicts
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    // Change track
    onTrackChange(playlist[nextIndex]);
    // Set isPlaying after a delay to ensure track change is processed
    // The useEffect will handle setting isPlaying when track changes
    setTimeout(() => {
      isAutoChangingRef.current = false;
    }, 300);
  }, [currentTrack, playlist, isShuffled, isRepeating, onTrackChange]);

  // Track when currentTrack changes
  const prevTrackRef = useRef<Track | null>(null);
  const prevTrackUrlRef = useRef<string>(''); // Track the URL to detect actual changes
  const userInteractedRef = useRef(false);
  // Track to prevent auto-play loops when track changes automatically
  const isAutoChangingRef = useRef(false);
  const isPlayingRef = useRef(false); // Track playing state to prevent loops
  const playAttemptRef = useRef(false); // Track if we're currently attempting to play
  
  // Track user interaction to enable audio playback
  useEffect(() => {
    const handleUserInteraction = () => {
      userInteractedRef.current = true;
    };
    
    window.addEventListener('click', handleUserInteraction, { once: true });
    window.addEventListener('touchstart', handleUserInteraction, { once: true });
    
    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);
  
  useEffect(() => {
    // Update playing ref when isPlaying changes
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  
  useEffect(() => {
    // If track changed and user has interacted, auto-play
    if (currentTrack && currentTrack.id !== prevTrackRef.current?.id) {
      prevTrackRef.current = currentTrack;
      
      // Only auto-play if user has interacted or shouldAutoPlay is true
      // Skip if we're in the middle of an automatic track change
      if (!isAutoChangingRef.current && (userInteractedRef.current || shouldAutoPlay)) {
        isPlayingRef.current = true;
        setIsPlaying(true);
        if (shouldAutoPlay && onAutoPlayHandled) {
          onAutoPlayHandled();
        }
      } else if (isAutoChangingRef.current) {
        // If it's an automatic change, set playing state after a delay
        setTimeout(() => {
          isPlayingRef.current = true;
          setIsPlaying(true);
          isAutoChangingRef.current = false;
        }, 200);
      }
    }
  }, [currentTrack, shouldAutoPlay, onAutoPlayHandled]);

  // Efecto para manejar el cambio de pista y la reproducción
  useEffect(() => {
    let isSubscribed = true;

    const playTrack = async () => {
      if (!audioRef.current) return;

      try {
        // Solo inicializamos si es necesario
        if (!isAudioInitialized) {
          await initializeAudio();
        }

        // Si no hay currentTrack pero hay playlist, comenzar con la primera canción
        if (!currentTrack && playlist.length > 0) {
          onTrackChange(playlist[0]);
          return; // Salimos y dejamos que el efecto se ejecute de nuevo con la nueva pista
        }

        // Solo actualizamos la fuente si ha cambiado la pista o la URL
        let urlChanged = false;
        if (currentTrack && currentTrack.url) {
          const trackUrl = currentTrack.url;
          
          // Check if URL has actually changed - compare with previous URL
          urlChanged = prevTrackUrlRef.current !== trackUrl;
          
          if (urlChanged && trackUrl) {
            // Update the ref to track the current URL
            prevTrackUrlRef.current = trackUrl;
            
            // Stop and reset current audio before loading new one
            if (audioRef.current && !audioRef.current.paused) {
              audioRef.current.pause();
            }
            audioRef.current.currentTime = 0;
            playAttemptRef.current = false; // Reset play attempt flag
            // Validate URL before setting
            try {
              // Test if URL is valid
              if (trackUrl.startsWith('blob:') || trackUrl.startsWith('http://') || trackUrl.startsWith('https://')) {
                // For blob URLs, always recreate if we have the file (especially important on mobile)
                if (trackUrl.startsWith('blob:') && currentTrack?.file) {
                  // Recreate blob URL to ensure it's fresh and valid (especially important on mobile)
                  // Revoke old URL if it exists
                  if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
                    URL.revokeObjectURL(audioRef.current.src);
                  }
                  const newBlobUrl = URL.createObjectURL(currentTrack.file);
                  audioRef.current.src = newBlobUrl;
                  // MIME type is handled by the File/blob object, no need to set on audio element
                  } else {
                    // Set the audio source directly for HTTP/HTTPS URLs
                    if (!audioRef.current.src || audioRef.current.src !== trackUrl) {
                      audioRef.current.src = trackUrl;
                    }
                  }
                
                // Add error handler for audio loading
                const handleAudioError = (_e: Event) => {
                  if (isSubscribed) {
                    setIsPlaying(false);
                  }
                  // Log error details for debugging
                  if (audioRef.current?.error) {
                    const error = audioRef.current.error;
                    let errorMessage = 'Unknown audio error';
                    
                    // Map error codes to user-friendly messages
                    switch (error.code) {
                      case MediaError.MEDIA_ERR_ABORTED:
                        errorMessage = 'Audio playback was aborted';
                        break;
                      case MediaError.MEDIA_ERR_NETWORK:
                        errorMessage = 'Network error while loading audio';
                        break;
                      case MediaError.MEDIA_ERR_DECODE:
                        errorMessage = 'Audio decoding error - file may be corrupted';
                        break;
                      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        errorMessage = 'Audio format not supported on this device';
                        break;
                      default:
                        errorMessage = `Audio error (code ${error.code}): ${error.message || 'Unknown error'}`;
                    }
                    
                    // On mobile or for blob URLs, try to recreate blob URL with proper MIME type
                    if (currentTrack?.file && trackUrl.startsWith('blob:')) {
                      try {
                        // Revoke old blob URL
                        URL.revokeObjectURL(trackUrl);
                        // Create new blob URL (MIME type is handled by the File object)
                        const newBlobUrl = URL.createObjectURL(currentTrack.file);
                        audioRef.current.src = newBlobUrl;
                        audioRef.current.load();
                        // Try playing again after a short delay
                        setTimeout(() => {
                          if (isSubscribed && isPlaying && audioRef.current) {
                            audioRef.current.play().catch(() => {
                              alert(errorMessage + '\n\nPlease try selecting the track again.');
                            });
                          }
                        }, 200);
                        return; // Don't show error if we're retrying
                      } catch (retryError) {
                        // If retry fails, show error
                      }
                    }
                    
                    // Show error to user
                    alert(errorMessage + '\n\nIf this persists, try refreshing the page or re-uploading the track.');
                  }
                };
                
                // Add canplay handler to ensure audio is ready
                const handleCanPlay = () => {
                  // Only auto-play if isPlaying is true, we're subscribed, and not already attempting to play
                  if (isSubscribed && isPlayingRef.current && audioRef.current && audioRef.current.paused && !playAttemptRef.current) {
                    playAttemptRef.current = true;
                    audioRef.current.play().then(() => {
                      playAttemptRef.current = false;
                    }).catch((_playError) => {
                      playAttemptRef.current = false;
                      if (isSubscribed) {
                        setIsPlaying(false);
                        isPlayingRef.current = false;
                      }
                    });
                  }
                };
                
                // Add loadedmetadata handler
                const handleLoadedMetadata = () => {
                  // Audio metadata is loaded, we can check duration
                };
                
                audioRef.current.addEventListener('error', handleAudioError, { once: true });
                audioRef.current.addEventListener('canplay', handleCanPlay, { once: true });
                audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
                
                // Load the audio source
                audioRef.current.load();
                
                // Auto-play if isPlaying is true and audio is ready (only if URL actually changed)
                if (isSubscribed && isPlayingRef.current && !playAttemptRef.current) {
                  // Wait for the audio to be ready
                  const tryPlay = () => {
                    if (audioRef.current && audioRef.current.readyState >= 2 && audioRef.current.paused && !playAttemptRef.current) {
                      playAttemptRef.current = true;
                      audioRef.current.play().then(() => {
                        playAttemptRef.current = false;
                      }).catch((_playError) => {
                        playAttemptRef.current = false;
                        if (isSubscribed) {
                          setIsPlaying(false);
                          isPlayingRef.current = false;
                        }
                      });
                    } else if (audioRef.current && audioRef.current.readyState < 2) {
                      // Audio not ready yet, wait a bit more
                      setTimeout(tryPlay, 50);
                    }
                  };
                  setTimeout(tryPlay, 100);
                }
              } else {
                throw new Error('Invalid track URL format');
              }
            } catch (error) {
              if (isSubscribed) {
                setIsPlaying(false);
              }
            }
          }
        }

        // Handle play/pause - only if audio source is set and ready
        // Only handle play/pause if URL hasn't changed (to avoid conflicts with new track loading)
        if (!urlChanged && audioRef.current.src) {
          if (isPlaying && isSubscribed && currentTrack) {
            // Resume audio context if needed
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
              try {
                await audioContextRef.current.resume();
              } catch (_error) {
                // AudioContext resume requires user interaction - this is expected
              }
            }
            
            // Only try to play if audio is paused, ready, and we're not already attempting to play
            if (audioRef.current.paused && audioRef.current.readyState >= 2 && !playAttemptRef.current) {
              playAttemptRef.current = true;
              try {
                await audioRef.current.play();
                playAttemptRef.current = false;
              } catch (playError) {
                playAttemptRef.current = false;
                if (isSubscribed) {
                  setIsPlaying(false);
                  isPlayingRef.current = false;
                }
              }
            }
          } else if (!isPlaying && audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
            isPlayingRef.current = false;
          }
        }
      } catch (error) {
        if (isSubscribed) {
          setIsPlaying(false);
        }
      }
    };

    playTrack();

    return () => {
      isSubscribed = false;
    };
  }, [
    currentTrack,
    isPlaying,
    playlist,
    onTrackChange,
    isAudioInitialized,
    initializeAudio,
  ]);

  // Ahora los efectos pueden usar playNextTrack
  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;

      const updateTime = () => {
        setCurrentTime(audio.currentTime);
      };

      const handleEnded = () => {
        // Prevent multiple calls by checking if audio is still at the end
        if (audio.ended && !isAutoChangingRef.current) {
          if (isRepeating) {
            audio.currentTime = 0;
            audio.play().catch(() => {
              // If play fails, try playNextTrack as fallback
              playNextTrack();
            });
          } else {
            // Call playNextTrack which will handle the track change
            playNextTrack();
          }
        }
      };

      audio.addEventListener("timeupdate", updateTime);
      audio.addEventListener("ended", handleEnded);

      return () => {
        audio.removeEventListener("timeupdate", updateTime);
        audio.removeEventListener("ended", handleEnded);
      };
    }
  }, [isRepeating, playNextTrack]);

  // Efecto para manejar cambios en el volumen
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Efecto para el visualizador
  useEffect(() => {
    if (!isAudioInitialized || !analyserRef.current || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;

    // Función para redimensionar el canvas
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    // Añadir listener para redimensionar
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas(); // Llamar inicialmente

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      if (!analyserRef.current || !canvasRef.current) return;

      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);

      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.fillStyle = "rgb(20, 20, 20)";
      ctx.fillRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        const gradient = ctx.createLinearGradient(
          0,
          height,
          0,
          height - barHeight
        );

        gradient.addColorStop(0, gradientColors.start);
        gradient.addColorStop(1, gradientColors.end);

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [currentTrack, isAudioInitialized, gradientColors]);

  const togglePlay = async () => {
    try {
      // Initialize audio on user interaction (play button click)
      if (!isAudioInitialized) {
        await initializeAudio();
      }
      
      // Si no hay currentTrack pero hay playlist, comenzar con la primera canción
      if (!currentTrack && playlist.length > 0) {
        onTrackChange(playlist[0]);
        setIsPlaying(true);
        return;
      }
      
      if (!currentTrack) {
        return;
      }
      
      // Ensure track has a valid URL
      if (!currentTrack.url && currentTrack.file) {
        const blobUrl = URL.createObjectURL(currentTrack.file);
        const trackWithUrl = { ...currentTrack, url: blobUrl };
        onTrackChange(trackWithUrl);
      }
      
      // Ensure audio source is set
      if (audioRef.current && currentTrack.url) {
        if (!audioRef.current.src || audioRef.current.src !== currentTrack.url) {
          audioRef.current.src = currentTrack.url;
          await audioRef.current.load();
        }
      }
      
      // Resume audio context if suspended (required for user interaction)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      // Toggle play/pause
      if (isPlaying) {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
        // Try to play immediately
        if (audioRef.current && audioRef.current.readyState >= 2) {
          try {
            await audioRef.current.play();
          } catch (playError) {
            // Play will be handled by the useEffect
          }
        }
      }
    } catch (error) {
      // Error handled
    }
  };

  const handleTimeChange = (newTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const playPreviousTrack = () => {
    if (!currentTrack || playlist.length === 0) return;

    const currentIndex = playlist.findIndex(
      (track) => track.id === currentTrack.id
    );
    let previousIndex;

    if (isShuffled) {
      previousIndex = Math.floor(Math.random() * playlist.length);
    } else {
      previousIndex =
        currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
    }

    onTrackChange(playlist[previousIndex]);
    setIsPlaying(true);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
  };

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume);
    }
  };

  const generateRandomColor = () => {
    const color = Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "0");
    // Validar que el color sea un formato hexadecimal válido
    if (/^[0-9A-F]{6}$/i.test(color)) {
      return "#" + color;
    }
    // Si por alguna razón el color no es válido, devolver un color por defecto
    return "#22c55e";
  };

  const changeVisualizerColors = () => {
    setGradientColors({
      start: generateRandomColor(),
      end: generateRandomColor(),
    });
  };

  // Always render the player container, but show content only when track is available
  return (
    <div className="h-auto bg-gray-800 border-t border-gray-700 px-4 py-3 flex flex-col min-h-[120px]">
      {currentTrack ? (
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm truncate">
              <div className="font-semibold truncate">{currentTrack.title}</div>
              <div className="text-black text-xs truncate">
                {currentTrack.artist}
              </div>
            </div>
          </div>

          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-center space-x-4">
              <button
                className="p-2 hover:bg-gray-700 rounded-full bg-white active:bg-white"
                onClick={() => setIsShuffled(!isShuffled)}
              >
                <ArrowsRightLeftIcon
                  className={`w-5 h-5 ${
                    isShuffled ? "text-green-500" : "text-black"
                  }`}
                />
              </button>

              <button
                className="p-2 hover:bg-gray-700 rounded-full bg-white active:bg-white"
                onClick={playPreviousTrack}
              >
                <BackwardIcon className="w-5 h-5 text-black" />
              </button>

              <button
                className="p-3 bg-white rounded-full hover:scale-105 transition active:bg-white"
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <PauseIcon className="w-6 h-6 text-black bg-white active:bg-white" />
                ) : (
                  <PlayIcon className="w-6 h-6 text-black" />
                )}
              </button>

              <button
                className="p-2 hover:bg-gray-700 rounded-full bg-white active:bg-white"
                onClick={playNextTrack}
              >
                <ForwardIcon className="w-5 h-5 text-black" />
              </button>

              <button
                className="p-2 hover:bg-gray-700 rounded-full bg-white active:bg-white"
                onClick={() => setIsRepeating(!isRepeating)}
              >
                <ArrowPathRoundedSquareIcon
                  className={`w-5 h-5 ${
                    isRepeating ? "text-green-500" : "text-black"
                  }`}
                />
              </button>

              <div className="relative">
                <button
                  className="p-2 hover:bg-gray-700 rounded-full bg-white active:bg-white"
                  onClick={toggleMute}
                  onMouseEnter={() => setShowVolumeControl(true)}
                  onMouseLeave={() => setShowVolumeControl(false)}
                >
                  {volume === 0 ? (
                    <SpeakerXMarkIcon className="w-5 h-5 text-black-800" />
                  ) : (
                    <SpeakerWaveIcon className="w-5 h-5 text-black" />
                  )}
                </button>
                {showVolumeControl && (
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0 p-2 bg-transparent rounded-lg"
                    onMouseEnter={() => setShowVolumeControl(true)}
                    onMouseLeave={() => setShowVolumeControl(false)}
                  >
                    <div className="h-24 w-1 bg-transparent rounded-full relative">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={(e) =>
                          handleVolumeChange(Number(e.target.value))
                        }
                        className="absolute w-200 h-4 bottom-0 left-1/2 -translate-x-1/2 appearance-none cursor-pointer rounded-full bg-black
                        bg-gradient-to-r from-transparent to-green-500/50
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-2.5
                        [&::-webkit-slider-thumb]:h-2.5
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-green-500
                        [&::-webkit-slider-thumb]:shadow-md"
                        style={{
                          transform: "rotate(-90deg) translateY(50%)",
                          transformOrigin: "left bottom",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="relative">
              <button
                onClick={changeVisualizerColors}
                className="absolute top-2 right-2 z-10 p-1 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                title="Cambiar colores"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-white"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <canvas
                ref={canvasRef}
                className="w-full h-12 rounded-lg bg-gray-900 max-w-full"
                style={{
                  minHeight: "48px",
                  touchAction: "none", // Prevenir gestos táctiles no deseados
                }}
              />
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-white w-10">
                {formatTime(currentTime)}
              </span>
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max={currentTrack.duration}
                  value={currentTime}
                  onChange={(e) => handleTimeChange(Number(e.target.value))}
                  className="w-full h-2 appearance-none rounded-lg cursor-pointer  bg-black
                  bg-gradient-to-r from-gray-700/50 to-green-500/50
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-2.5
                  [&::-webkit-slider-thumb]:h-2.5
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-green-500
                  [&::-webkit-slider-thumb]:shadow-md"
                />
              </div>
              <span className="text-xs text-white w-10">
                {formatTime(currentTrack.duration)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-12 text-gray-500 text-sm">
          Select a track to play
        </div>
      )}
      <audio ref={audioRef} />
    </div>
  );
}

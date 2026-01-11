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
import { debugLog } from "./DebugPanel";
import { supabase } from "../config/supabase";

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
      // Initialize audio context on first user interaction (required for mobile)
      if (!isAudioInitialized && audioRef.current) {
        initializeAudio().catch(() => {
          // AudioContext initialization may fail, that's okay
        });
      }
    };
    
    // Listen to multiple events to catch user interaction
    window.addEventListener('click', handleUserInteraction, { passive: true });
    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    window.addEventListener('touchend', handleUserInteraction, { passive: true });
    
    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('touchend', handleUserInteraction);
    };
  }, [isAudioInitialized]);
  
  useEffect(() => {
    // Update playing ref when isPlaying changes
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  
  useEffect(() => {
    // If track changed and user has interacted, auto-play
    if (currentTrack && currentTrack.id !== prevTrackRef.current?.id) {
      prevTrackRef.current = currentTrack;
      
      // Only auto-play if user has interacted or shouldAutoPlay is true
      // For mobile, we need user interaction to play audio
      const canAutoPlay = userInteractedRef.current || shouldAutoPlay;
      
      // Skip if we're in the middle of an automatic track change
      if (!isAutoChangingRef.current && canAutoPlay) {
        isPlayingRef.current = true;
        setIsPlaying(true);
        if (shouldAutoPlay && onAutoPlayHandled) {
          onAutoPlayHandled();
        }
      } else if (isAutoChangingRef.current && canAutoPlay) {
        // If it's an automatic change and user has interacted, set playing state after a delay
        setTimeout(() => {
          isPlayingRef.current = true;
          setIsPlaying(true);
          isAutoChangingRef.current = false;
        }, 200);
      } else if (isAutoChangingRef.current && !canAutoPlay) {
        // If it's an automatic change but user hasn't interacted, just reset the flag
        // Don't auto-play (mobile browsers will block it anyway)
        setTimeout(() => {
          isAutoChangingRef.current = false;
        }, 200);
      }
    }
  }, [currentTrack, shouldAutoPlay, onAutoPlayHandled]);

  // Efecto para manejar el cambio de pista y la reproducción
  useEffect(() => {
    let isSubscribed = true;

    const playTrack = async () => {
      if (!audioRef.current) {
        debugLog('warn', 'playTrack: audioRef.current is null');
        return;
      }

      try {
        debugLog('info', `playTrack effect - currentTrack: ${currentTrack?.title || 'none'}, isPlaying: ${isPlaying}, urlChanged: checking...`);
        
        // Solo inicializamos si es necesario
        if (!isAudioInitialized) {
          debugLog('info', 'playTrack: Initializing audio...');
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
                // On mobile, use storageUrl directly if available (avoids blob URL issues)
                // On desktop, use blob URLs
                const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                
                if (isMobileDevice && currentTrack?.storageUrl) {
                  debugLog('info', `playTrack: Using storageUrl on mobile: ${currentTrack.storageUrl.substring(0, 50)}...`);
                  // Use storageUrl directly on mobile
                  if (!audioRef.current.src || audioRef.current.src !== currentTrack.storageUrl) {
                    audioRef.current.src = currentTrack.storageUrl;
                  }
                } else if (trackUrl.startsWith('blob:') && currentTrack?.file) {
                  debugLog('info', `playTrack: Recreating blob URL - file type: ${currentTrack.file.type}, size: ${currentTrack.file.size}`);
                  // Recreate blob URL to ensure it's fresh and valid (desktop)
                  // Don't revoke old URL yet - wait until new one is confirmed working
                  const newBlobUrl = URL.createObjectURL(currentTrack.file);
                  audioRef.current.src = newBlobUrl;
                  debugLog('info', `playTrack: New blob URL set: ${newBlobUrl.substring(0, 50)}...`);
                  // MIME type is handled by the File/blob object, no need to set on audio element
                } else {
                  // Set the audio source directly for HTTP/HTTPS URLs
                  if (!audioRef.current.src || audioRef.current.src !== trackUrl) {
                    audioRef.current.src = trackUrl;
                  }
                }
                
                // Add error handler for audio loading
                const handleAudioError = async (_e: Event) => {
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
                    
                    debugLog('error', `playTrack: Audio error - code: ${error.code}, message: ${errorMessage}`);
                    
                    // If error code 4 and we have storageUrl, try downloading using Supabase Storage API
                    if (error.code === 4 && currentTrack?.storageUrl && !currentTrack.storageUrl.startsWith('blob:')) {
                      try {
                        debugLog('info', 'playTrack: Attempting to download file from Supabase Storage');
                        
                        // Extract path from storageUrl
                        let path = currentTrack.storageUrl;
                        if (path.includes('/storage/v1/object/public/')) {
                          const parts = path.split('/storage/v1/object/public/');
                          if (parts.length > 1) {
                            path = parts[1].replace('music-planner/', '');
                          }
                        }
                        
                        debugLog('info', `playTrack: Downloading path: ${path}`);
                        
                        // Use Supabase Storage download method
                        const { data: blob, error: downloadError } = await supabase.storage
                          .from('music-planner')
                          .download(path);
                        
                        if (downloadError) {
                          throw new Error(`Supabase download error: ${downloadError.message}`);
                        }
                        
                        if (!blob) {
                          throw new Error('No data returned from Supabase Storage');
                        }
                        
                        debugLog('info', `playTrack: File downloaded from Supabase, size: ${blob.size}, type: ${blob.type}`);
                        
                        // Revoke old URL if it was a blob
                        if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
                          URL.revokeObjectURL(audioRef.current.src);
                        }
                        
                        // Create blob URL from downloaded file
                        const downloadedBlobUrl = URL.createObjectURL(blob);
                        if (audioRef.current) {
                          audioRef.current.src = downloadedBlobUrl;
                          audioRef.current.load();
                          debugLog('info', `playTrack: Downloaded blob URL set, attempting to play`);
                          
                          // Try playing after load
                          setTimeout(() => {
                            if (isSubscribed && isPlaying && audioRef.current && audioRef.current.readyState >= 2) {
                              audioRef.current.play().catch(() => {
                                debugLog('error', 'playTrack: Play failed after download');
                              });
                            }
                          }, 200);
                        }
                        return; // Don't show error if we're retrying
                      } catch (downloadError: any) {
                        debugLog('error', `playTrack: Supabase download failed: ${downloadError?.message}`);
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
                  debugLog('info', `loadedmetadata event - readyState: ${audioRef.current?.readyState}, duration: ${audioRef.current?.duration}`);
                };
                
                // Add loadstart handler
                const handleLoadStart = () => {
                  debugLog('info', 'loadstart event - Audio loading started');
                };
                
                // Add progress handler
                const handleProgress = () => {
                  if (audioRef.current) {
                    const buffered = audioRef.current.buffered;
                    const bufferedLength = buffered && buffered.length > 0 ? buffered.end(0) : 0;
                    debugLog('info', `progress event - readyState: ${audioRef.current.readyState}, buffered: ${bufferedLength}`);
                  }
                };
                
                // Add stalled handler (when loading stops)
                const handleStalled = () => {
                  debugLog('warn', 'stalled event - Audio loading stalled');
                };
                
                // Add suspend handler
                const handleSuspend = () => {
                  debugLog('warn', 'suspend event - Audio loading suspended');
                };
                
                // Add abort handler
                const handleAbort = () => {
                  debugLog('warn', 'abort event - Audio loading aborted');
                };
                
                // Add all event listeners
                audioRef.current.addEventListener('error', handleAudioError, { once: true });
                audioRef.current.addEventListener('canplay', handleCanPlay, { once: true });
                audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
                audioRef.current.addEventListener('loadstart', handleLoadStart, { once: true });
                audioRef.current.addEventListener('progress', handleProgress);
                audioRef.current.addEventListener('stalled', handleStalled, { once: true });
                audioRef.current.addEventListener('suspend', handleSuspend, { once: true });
                audioRef.current.addEventListener('abort', handleAbort, { once: true });
                
                // Log the source URL before loading
                debugLog('info', `About to load audio - src: ${audioRef.current.src.substring(0, 100)}...`);
                
                // Load the audio source
                audioRef.current.load();
                debugLog('info', `load() called - readyState after load: ${audioRef.current.readyState}`);
                
                // Auto-play if isPlaying is true and audio is ready (only if URL actually changed)
                // Also check if user has interacted (required for mobile autoplay policies)
                if (isSubscribed && isPlayingRef.current && userInteractedRef.current && !playAttemptRef.current) {
                  // Wait for the audio to be ready
                  const tryPlay = () => {
                    if (audioRef.current && audioRef.current.readyState >= 2 && audioRef.current.paused && !playAttemptRef.current) {
                      playAttemptRef.current = true;
                      // Resume AudioContext if needed (important for mobile)
                      const playAudio = () => {
                        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                          return audioContextRef.current.resume().then(() => {
                            if (audioRef.current) {
                              return audioRef.current.play();
                            }
                          });
                        } else if (audioRef.current) {
                          return audioRef.current.play();
                        }
                        return Promise.resolve();
                      };
                      
                      playAudio().then(() => {
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
          debugLog('info', `playTrack: Handling play/pause - isPlaying: ${isPlaying}, paused: ${audioRef.current.paused}, readyState: ${audioRef.current.readyState}`);
          
          if (isPlaying && isSubscribed && currentTrack) {
            // Resume audio context if needed
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
              try {
                debugLog('info', 'playTrack: Resuming AudioContext...');
                await audioContextRef.current.resume();
                debugLog('info', `playTrack: AudioContext resumed, state: ${audioContextRef.current.state}`);
              } catch (error: any) {
                debugLog('error', `playTrack: Failed to resume AudioContext: ${error?.message}`);
              }
            }
            
            // Only try to play if audio is paused, ready, and we're not already attempting to play
            if (audioRef.current.paused && audioRef.current.readyState >= 2 && !playAttemptRef.current) {
              debugLog('info', 'playTrack: Attempting to play...');
              playAttemptRef.current = true;
              try {
                await audioRef.current.play();
                debugLog('info', `playTrack: Playback started - paused: ${audioRef.current.paused}, currentTime: ${audioRef.current.currentTime}`);
                playAttemptRef.current = false;
              } catch (playError: any) {
                debugLog('error', `playTrack: Play failed: ${playError?.name} - ${playError?.message}`);
                playAttemptRef.current = false;
                if (isSubscribed) {
                  setIsPlaying(false);
                  isPlayingRef.current = false;
                }
              }
            } else {
              debugLog('info', `playTrack: Skipping play - paused: ${audioRef.current.paused}, readyState: ${audioRef.current.readyState}, playAttempt: ${playAttemptRef.current}`);
            }
          } else if (!isPlaying && audioRef.current && !audioRef.current.paused) {
            debugLog('info', 'playTrack: Pausing audio');
            audioRef.current.pause();
            isPlayingRef.current = false;
          }
        } else {
          debugLog('info', `playTrack: Skipping play/pause - urlChanged: ${urlChanged}, hasSrc: ${!!audioRef.current?.src}`);
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
      debugLog('info', `togglePlay called - isPlaying: ${isPlaying}, hasTrack: ${!!currentTrack}`);
      
      // Mark user interaction (critical for mobile autoplay policies)
      userInteractedRef.current = true;
      debugLog('info', 'User interaction marked');
      
      // Initialize audio on user interaction (play button click)
      if (!isAudioInitialized) {
        debugLog('info', 'Initializing audio...');
        await initializeAudio();
        debugLog('info', `Audio initialized - AudioContext state: ${audioContextRef.current?.state}`);
      }
      
      // Si no hay currentTrack pero hay playlist, comenzar con la primera canción
      if (!currentTrack && playlist.length > 0) {
        debugLog('info', 'No current track, selecting first track from playlist');
        onTrackChange(playlist[0]);
        isPlayingRef.current = true;
        setIsPlaying(true);
        return;
      }
      
      if (!currentTrack) {
        debugLog('warn', 'No current track available');
        return;
      }
      
      debugLog('info', `Current track: ${currentTrack.title}, URL: ${currentTrack.url ? 'exists' : 'missing'}, hasFile: ${!!currentTrack.file}`);
      
      // Ensure track has a valid URL
      if (!currentTrack.url && currentTrack.file) {
        debugLog('info', 'Creating blob URL from file');
        const blobUrl = URL.createObjectURL(currentTrack.file);
        const trackWithUrl = { ...currentTrack, url: blobUrl };
        onTrackChange(trackWithUrl);
        debugLog('info', `Blob URL created: ${blobUrl.substring(0, 50)}...`);
      }
      
      // Resume audio context if suspended (required for user interaction, especially on mobile)
      if (audioContextRef.current) {
        const contextState = audioContextRef.current.state;
        debugLog('info', `AudioContext state: ${contextState}`);
        if (contextState === 'suspended') {
          try {
            await audioContextRef.current.resume();
            debugLog('info', `AudioContext resumed, new state: ${audioContextRef.current.state}`);
          } catch (error: any) {
            debugLog('error', `Failed to resume AudioContext: ${error?.message}`);
          }
        }
      }
      
      // Ensure audio source is set
      if (audioRef.current && currentTrack.url) {
        const currentSrc = audioRef.current.src;
        debugLog('info', `Current audio src: ${currentSrc ? currentSrc.substring(0, 50) + '...' : 'none'}`);
        
        // On mobile, if we have storageUrl, use it directly instead of blob URLs
        // Blob URLs don't work well on mobile (error code 4)
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const oldSrc = audioRef.current.src;
        let newBlobUrl: string | null = null;
        
        // Prefer storageUrl on mobile, blob URLs on desktop
        if (isMobileDevice && currentTrack.storageUrl) {
          debugLog('info', `Using storageUrl on mobile: ${currentTrack.storageUrl.substring(0, 50)}...`);
          if (!audioRef.current.src || audioRef.current.src !== currentTrack.storageUrl) {
            audioRef.current.src = currentTrack.storageUrl;
            debugLog('info', `Storage URL set - readyState before load: ${audioRef.current.readyState}`);
          }
        } else if (currentTrack.url.startsWith('blob:') && currentTrack.file) {
          debugLog('info', `File info - name: ${currentTrack.file.name}, type: ${currentTrack.file.type || 'unknown'}, size: ${currentTrack.file.size}`);
          
          // Check if current src is a blob URL and if it's different from track URL
          // On desktop, try to reuse the existing blob URL if it exists and is valid
          if (oldSrc && oldSrc.startsWith('blob:') && oldSrc === currentTrack.url) {
            debugLog('info', 'Reusing existing blob URL (matches track URL)');
            // Keep using the existing blob URL
            audioRef.current.src = oldSrc;
          } else {
            debugLog('info', 'Creating new blob URL');
            // Create new blob URL but don't revoke old one yet
            newBlobUrl = URL.createObjectURL(currentTrack.file);
            debugLog('info', `Created new blob URL: ${newBlobUrl.substring(0, 50)}...`);
            
            // Set the new source
            audioRef.current.src = newBlobUrl;
            debugLog('info', `New blob URL set - readyState before load: ${audioRef.current.readyState}`);
          }
        } else if (!audioRef.current.src || audioRef.current.src !== currentTrack.url) {
          audioRef.current.src = currentTrack.url;
          debugLog('info', `Audio src updated to track URL - readyState before load: ${audioRef.current.readyState}`);
        }
        
        // Add event listeners before loading
        let errorFired = false;
        let canPlayFired = false;
        let loadStartFired = false;
        
        const handleLoadStart = () => {
          loadStartFired = true;
          debugLog('info', 'togglePlay: loadstart event');
        };
        
        const handleCanPlay = () => {
          canPlayFired = true;
          debugLog('info', `togglePlay: canplay event - readyState: ${audioRef.current?.readyState}`);
          // Now it's safe to revoke old blob URL if we created a new one
          if (newBlobUrl && oldSrc && oldSrc.startsWith('blob:') && oldSrc !== newBlobUrl) {
            debugLog('info', 'canplay fired, revoking old blob URL');
            URL.revokeObjectURL(oldSrc);
          }
        };
        
        const handleLoadedMetadata = () => {
          debugLog('info', `togglePlay: loadedmetadata event - readyState: ${audioRef.current?.readyState}, duration: ${audioRef.current?.duration}`);
        };
        
        const handleError = async () => {
          errorFired = true;
          const error = audioRef.current?.error;
          debugLog('error', `togglePlay: error event - code: ${error?.code}, message: ${error?.message || 'No message'}`);
          
          // Don't revoke old blob URL if there's an error - might need it
          // If error code 4 (SRC_NOT_SUPPORTED), try downloading the file and creating a local blob URL
          if (error?.code === 4) {
            debugLog('info', 'togglePlay: Error code 4 detected, trying to download file and create local blob URL');
            
            // If we have storageUrl, try downloading it using Supabase Storage API
            if (currentTrack.storageUrl && !currentTrack.storageUrl.startsWith('blob:')) {
              try {
                debugLog('info', `togglePlay: Downloading file from Supabase Storage`);
                
                // Extract path from storageUrl
                let path = currentTrack.storageUrl;
                if (path.includes('/storage/v1/object/public/')) {
                  const parts = path.split('/storage/v1/object/public/');
                  if (parts.length > 1) {
                    path = parts[1].replace('music-planner/', '');
                  }
                }
                
                debugLog('info', `togglePlay: Downloading path: ${path}`);
                
                // Use Supabase Storage download method
                const { data: blob, error: downloadError } = await supabase.storage
                  .from('music-planner')
                  .download(path);
                
                if (downloadError) {
                  throw new Error(`Supabase download error: ${downloadError.message}`);
                }
                
                if (!blob) {
                  throw new Error('No data returned from Supabase Storage');
                }
                
                debugLog('info', `togglePlay: File downloaded from Supabase, size: ${blob.size}, type: ${blob.type}`);
                
                // Revoke old URL if it was a blob
                if (newBlobUrl) {
                  URL.revokeObjectURL(newBlobUrl);
                }
                if (oldSrc && oldSrc.startsWith('blob:')) {
                  URL.revokeObjectURL(oldSrc);
                }
                
                // Create blob URL from downloaded file
                const downloadedBlobUrl = URL.createObjectURL(blob);
                if (audioRef.current) {
                  audioRef.current.src = downloadedBlobUrl;
                  audioRef.current.load();
                  debugLog('info', `togglePlay: Downloaded blob URL created: ${downloadedBlobUrl.substring(0, 50)}...`);
                  
                  // Set up error handler for this attempt
                  const handleDownloadError = () => {
                    const downloadError = audioRef.current?.error;
                    debugLog('error', `togglePlay: Downloaded blob URL failed - code: ${downloadError?.code}`);
                  };
                  audioRef.current.addEventListener('error', handleDownloadError, { once: true });
                }
              } catch (downloadError: any) {
                debugLog('error', `togglePlay: Supabase download failed: ${downloadError?.message}`);
                
                // Fallback: try with file if available
                if (currentTrack.file) {
                  debugLog('info', 'togglePlay: Fallback: Using file directly');
                  try {
                    const fileType = currentTrack.file.type || 'audio/mpeg';
                    const blob = new Blob([currentTrack.file], { type: fileType });
                    const fallbackBlobUrl = URL.createObjectURL(blob);
                    if (audioRef.current) {
                      audioRef.current.src = fallbackBlobUrl;
                      audioRef.current.load();
                      debugLog('info', `togglePlay: Fallback blob URL created: ${fallbackBlobUrl.substring(0, 50)}...`);
                    }
                  } catch (fallbackError: any) {
                    debugLog('error', `togglePlay: Fallback also failed: ${fallbackError?.message}`);
                  }
                }
              }
            } else if (currentTrack.file) {
              // If we have the file, try creating blob from it
              debugLog('info', 'togglePlay: Attempting to create blob from file');
              try {
                const fileType = currentTrack.file.type || 'audio/mpeg';
                const blob = new Blob([currentTrack.file], { type: fileType });
                const retryBlobUrl = URL.createObjectURL(blob);
                if (audioRef.current) {
                  audioRef.current.src = retryBlobUrl;
                  audioRef.current.load();
                  debugLog('info', `togglePlay: Retry blob URL created: ${retryBlobUrl.substring(0, 50)}...`);
                }
              } catch (retryError: any) {
                debugLog('error', `togglePlay: Failed to create blob from file: ${retryError?.message}`);
              }
            }
          }
        };
        
        audioRef.current.addEventListener('loadstart', handleLoadStart, { once: true });
        audioRef.current.addEventListener('canplay', handleCanPlay, { once: true });
        audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
        audioRef.current.addEventListener('error', handleError, { once: true });
        
        debugLog('info', 'Calling audio.load()...');
        audioRef.current.load();
        debugLog('info', `load() called - readyState immediately after: ${audioRef.current.readyState}`);
        
        // Wait and check status - but DON'T revoke old blob URL until canplay fires or we confirm error
        setTimeout(() => {
          debugLog('info', `Status after 200ms - readyState: ${audioRef.current?.readyState}, paused: ${audioRef.current?.paused}, loadStart: ${loadStartFired}, canPlay: ${canPlayFired}, error: ${errorFired}`);
          // Only revoke old blob URL if canplay fired (audio is ready)
          // If error fired, don't revoke - might need the old URL
          if (!canPlayFired && !errorFired && newBlobUrl && oldSrc && oldSrc.startsWith('blob:') && oldSrc !== newBlobUrl) {
            debugLog('info', 'Audio still loading, keeping old blob URL for now');
          }
        }, 200);
      }
      
      // Toggle play/pause
      if (isPlaying) {
        debugLog('info', 'Pausing audio');
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
        }
        isPlayingRef.current = false;
        setIsPlaying(false);
      } else {
        debugLog('info', 'Starting playback');
        isPlayingRef.current = true;
        setIsPlaying(true);
        
        // Try to play immediately - wait for audio to be ready
        let tryPlayAttempts = 0;
        const MAX_ATTEMPTS = 40; // Max 2 seconds of waiting (40 * 50ms)
        
        const tryPlay = async () => {
          if (audioRef.current) {
            const readyState = audioRef.current.readyState;
            const paused = audioRef.current.paused;
            const hasSrc = !!audioRef.current.src;
            const src = audioRef.current.src;
            
            tryPlayAttempts++;
            debugLog('info', `tryPlay attempt ${tryPlayAttempts}/${MAX_ATTEMPTS} - readyState: ${readyState}, paused: ${paused}, hasSrc: ${hasSrc}, src: ${src ? src.substring(0, 50) + '...' : 'none'}`);
            
            // Check if there's an error
            if (audioRef.current.error) {
              const error = audioRef.current.error;
              debugLog('error', `Audio has error - code: ${error.code}, message: ${error.message}`);
              isPlayingRef.current = false;
              setIsPlaying(false);
              return;
            }
            
            if (readyState >= 2) {
              try {
                debugLog('info', 'Calling audio.play()...');
                await audioRef.current.play();
                debugLog('info', `Playback started successfully - paused: ${audioRef.current.paused}, currentTime: ${audioRef.current.currentTime}`);
                
                // Add event listeners to track playback state
                const handlePlay = () => {
                  debugLog('info', 'Audio play event fired');
                };
                const handlePause = () => {
                  debugLog('warn', 'Audio pause event fired');
                };
                const handleEnded = () => {
                  debugLog('info', 'Audio ended event fired');
                };
                const handleError = () => {
                  const error = audioRef.current?.error;
                  debugLog('error', `Audio error event - code: ${error?.code}, message: ${error?.message}`);
                };
                
                audioRef.current.addEventListener('play', handlePlay, { once: true });
                audioRef.current.addEventListener('pause', handlePause, { once: true });
                audioRef.current.addEventListener('ended', handleEnded, { once: true });
                audioRef.current.addEventListener('error', handleError, { once: true });
              } catch (playError: any) {
                debugLog('error', `Play failed: ${playError?.name} - ${playError?.message}`);
                // Play failed, reset state
                isPlayingRef.current = false;
                setIsPlaying(false);
              }
            } else if (tryPlayAttempts < MAX_ATTEMPTS) {
              debugLog('info', `Audio not ready (readyState: ${readyState}), waiting...`);
              // Audio not ready yet, wait a bit more
              setTimeout(tryPlay, 50);
            } else {
              debugLog('error', `Audio never became ready after ${MAX_ATTEMPTS} attempts. readyState stuck at ${readyState}`);
              // Give up after max attempts
              isPlayingRef.current = false;
              setIsPlaying(false);
            }
          } else {
            debugLog('warn', 'audioRef.current is null in tryPlay');
          }
        };
        await tryPlay();
      }
    } catch (error: any) {
      debugLog('error', `togglePlay error: ${error?.name} - ${error?.message}`);
      isPlayingRef.current = false;
      setIsPlaying(false);
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

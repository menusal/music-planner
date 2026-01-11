import {
  getAllTracks as getFirestoreTracks,
  uploadTrack as uploadTrackToFirestore,
  deleteTrack as deleteTrackFromFirestore,
  convertFirestoreTrackToDBTrack,
  getAllPlaylists as getFirestorePlaylists,
  uploadPlaylist as uploadPlaylistToFirestore,
  deletePlaylist as deletePlaylistFromFirestore,
  updateTracksOrder,
} from "./supabaseService";
import {
  getAllTracks as getIndexedDBTracks,
  saveTrack as saveTrackToIndexedDB,
  deleteTrack as deleteTrackFromIndexedDB,
  getAllPlaylists as getIndexedDBPlaylists,
  savePlaylists as savePlaylistToIndexedDB,
  deletePlaylist as deletePlaylistFromIndexedDB,
  Playlist as IndexedDBPlaylist,
} from "./indexedDB";
import {
  getAllQueuedOperations,
  removeFromSyncQueue,
  incrementRetry,
  getQueueSize,
} from "./syncQueue";

const MAX_RETRIES = 3;
const SYNC_INTERVAL = 30000; // 30 seconds

let syncIntervalId: number | null = null;
let isSyncing = false;

export const isOnline = (): boolean => {
  return navigator.onLine;
};

// Sync tracks from Firestore to IndexedDB
export const syncTracksFromFirestore = async (): Promise<void> => {
  if (!isOnline()) {
    return;
  }

  try {
    const firestoreTracks = await getFirestoreTracks();
    
    if (!Array.isArray(firestoreTracks)) {
      return;
    }
    
    let indexedDBTracks: any[] = [];
    try {
      indexedDBTracks = await getIndexedDBTracks();
    } catch (indexedDBError) {
      indexedDBTracks = [];
    }
    
    if (!Array.isArray(indexedDBTracks)) {
      indexedDBTracks = [];
    }
    

    // Create a map of existing tracks
    const existingTracksMap = new Map(
      indexedDBTracks.map((track) => [track.id, track])
    );

    let syncedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;


    // Sync tracks from Firestore (server wins on conflict)
    for (let i = 0; i < firestoreTracks.length; i++) {
      const firestoreTrack = firestoreTracks[i];
      try {
        const dbTrack = await convertFirestoreTrackToDBTrack(firestoreTrack);
        const existingTrack = existingTracksMap.get(dbTrack.id);

        // If track doesn't exist locally or Firestore version is newer, update
        if (!existingTrack || firestoreTrack.updatedAt > (existingTrack as any).updatedAt) {
          try {
            const trackToSave = {
              ...dbTrack,
              order: firestoreTrack.order ?? 0,
              synced: true,
              updatedAt: firestoreTrack.updatedAt,
            };
            const savePromise = saveTrackToIndexedDB(trackToSave as any);
            
            // Add timeout to detect hanging promises
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Save operation timed out after 30 seconds')), 30000);
            });
            
            await Promise.race([savePromise, timeoutPromise]);
            syncedCount++;
          } catch (saveError) {
            errorCount++;
            // Don't re-throw - continue with other tracks
          }
        } else {
          skippedCount++;
        }
      } catch (error) {
        errorCount++;
        // Continue with other tracks
      }
    }
    

    // Remove tracks that were deleted from Firestore
    const firestoreTrackIds = new Set(firestoreTracks.map((t) => t.id));
    for (const indexedDBTrack of indexedDBTracks) {
      if (!firestoreTrackIds.has(indexedDBTrack.id)) {
        await deleteTrackFromIndexedDB(indexedDBTrack.id);
      }
    }
    
    // Always dispatch event to notify that sync completed (even if no tracks)
    // This ensures the UI reloads tracks from IndexedDB
    window.dispatchEvent(new CustomEvent('tracks-synced', { 
      detail: { trackCount: syncedCount, totalTracks: firestoreTracks.length } 
    }));
  } catch (error) {
    // Still dispatch event so UI can try to load what's available
    window.dispatchEvent(new CustomEvent('tracks-synced', { 
      detail: { trackCount: 0, error: true } 
    }));
    throw error;
  }
};

// Sync tracks from IndexedDB to Firestore
export const syncTracksToFirestore = async (): Promise<void> => {
  if (!isOnline()) {
    return;
  }

  try {
    const indexedDBTracks = await getIndexedDBTracks();
    const unsyncedTracks = indexedDBTracks.filter(
      (track) => !(track as any).synced
    );

    for (const track of unsyncedTracks) {
      try {
        await uploadTrackToFirestore(
          track.id,
          track.title,
          track.artist,
          track.duration,
          track.fileBlob,
          (track as any).order ?? 0
        );

        // Mark as synced
        await saveTrackToIndexedDB({
          ...track,
          synced: true,
          updatedAt: Date.now(),
        } as any);
      } catch (error) {
        // Don't throw, continue with other tracks
      }
    }
  } catch (error) {
    throw error;
  }
};

// Sync playlists from Firestore to IndexedDB
export const syncPlaylistsFromFirestore = async (): Promise<void> => {
  if (!isOnline()) {
    return;
  }

  try {
    const firestorePlaylists = await getFirestorePlaylists();
    const indexedDBPlaylists = (await getIndexedDBPlaylists()) as IndexedDBPlaylist[];

    // Create a map of existing playlists
    const existingPlaylistsMap = new Map(
      indexedDBPlaylists.map((playlist) => [playlist.id, playlist])
    );

    // Sync playlists from Firestore (server wins on conflict)
    for (const firestorePlaylist of firestorePlaylists) {
      const existingPlaylist = existingPlaylistsMap.get(firestorePlaylist.id);

      // If playlist doesn't exist locally or Firestore version is newer, update
      if (
        !existingPlaylist ||
        firestorePlaylist.updatedAt > (existingPlaylist.updatedAt || 0)
      ) {
        await savePlaylistToIndexedDB({
          ...firestorePlaylist,
          synced: true,
        } as IndexedDBPlaylist);
      }
    }

    // Remove playlists that were deleted from Firestore
    const firestorePlaylistIds = new Set(firestorePlaylists.map((p) => p.id));
    for (const indexedDBPlaylist of indexedDBPlaylists) {
      if (!firestorePlaylistIds.has(indexedDBPlaylist.id)) {
        await deletePlaylistFromIndexedDB(indexedDBPlaylist.id);
      }
    }
  } catch (error) {
    throw error;
  }
};

// Sync playlists from IndexedDB to Firestore
export const syncPlaylistsToFirestore = async (): Promise<void> => {
  if (!isOnline()) {
    return;
  }

  try {
    const indexedDBPlaylists = (await getIndexedDBPlaylists()) as IndexedDBPlaylist[];
    const unsyncedPlaylists = indexedDBPlaylists.filter(
      (playlist) => !playlist.synced
    );

    for (const playlist of unsyncedPlaylists) {
      try {
        await uploadPlaylistToFirestore(
          playlist.id,
          playlist.title,
          playlist.tracks,
          playlist.breakTime,
          playlist.startTime
        );

        // Mark as synced
        await savePlaylistToIndexedDB({
          ...playlist,
          synced: true,
          updatedAt: Date.now(),
        } as IndexedDBPlaylist);
      } catch (error) {
        // Don't throw, continue with other playlists
      }
    }
  } catch (error) {
    throw error;
  }
};

// Process sync queue
export const processSyncQueue = async (): Promise<void> => {
  if (!isOnline()) {
    return;
  }

  if (isSyncing) {
    return; // Already syncing
  }

  isSyncing = true;

  try {
    const queuedOperations = await getAllQueuedOperations();

    for (const operation of queuedOperations) {
      try {
        switch (operation.type) {
          case "ADD_TRACK": {
            const trackData = operation.data as {
              id: string;
              title: string;
              artist?: string;
              duration: number;
              fileBlob: Blob;
              order?: number;
            };
            await uploadTrackToFirestore(
              trackData.id,
              trackData.title,
              trackData.artist,
              trackData.duration,
              trackData.fileBlob,
              trackData.order ?? 0
            );
            await saveTrackToIndexedDB({
              ...trackData,
              synced: true,
              updatedAt: Date.now(),
            } as any);
            await removeFromSyncQueue(operation.id);
            break;
          }

          case "DELETE_TRACK": {
            const deleteData = operation.data as { id: string };
            await deleteTrackFromFirestore(deleteData.id);
            await removeFromSyncQueue(operation.id);
            break;
          }

          case "ADD_PLAYLIST":
          case "UPDATE_PLAYLIST": {
            const playlistData = operation.data as {
              id: string;
              title: string;
              tracks: string[];
              breakTime: number;
              startTime?: string;
            };
            await uploadPlaylistToFirestore(
              playlistData.id,
              playlistData.title,
              playlistData.tracks,
              playlistData.breakTime,
              playlistData.startTime
            );
            await savePlaylistToIndexedDB({
              ...playlistData,
              synced: true,
              updatedAt: Date.now(),
            } as any);
            await removeFromSyncQueue(operation.id);
            break;
          }

          case "DELETE_PLAYLIST": {
            const deleteData = operation.data as { id: string };
            await deletePlaylistFromFirestore(deleteData.id);
            await removeFromSyncQueue(operation.id);
            break;
          }

          case "UPDATE_TRACK_ORDER": {
            const orderData = operation.data as { tracks: { id: string; order: number }[] };
            // Convert from { id, order } to { trackId, order } format
            const trackOrders = orderData.tracks.map(({ id, order }) => ({
              trackId: id,
              order,
            }));
            await updateTracksOrder(trackOrders);
            await removeFromSyncQueue(operation.id);
            break;
          }

          default:
            await removeFromSyncQueue(operation.id);
        }
      } catch (error) {
        operation.retries += 1;

        if (operation.retries >= MAX_RETRIES) {
          // Remove operation after max retries
          await removeFromSyncQueue(operation.id);
        } else {
          await incrementRetry(operation.id);
        }
      }
    }
  } finally {
    isSyncing = false;
  }
};

// Full sync: bidirectional sync
export const performFullSync = async (): Promise<void> => {
  if (!isOnline()) {
    return;
  }

  try {
    
    // First, sync from Firestore to IndexedDB (get latest from server)
    await syncTracksFromFirestore();
    
    await syncPlaylistsFromFirestore();

    // Then, sync local changes to Firestore
    await syncTracksToFirestore();
    
    await syncPlaylistsToFirestore();

    // Process any queued operations
    await processSyncQueue();
    
    // Dispatch event to notify that sync is complete
    window.dispatchEvent(new CustomEvent('sync-complete'));
  } catch (error) {
    // Still dispatch event so UI can try to load what's available
    window.dispatchEvent(new CustomEvent('sync-complete'));
    throw error;
  }
};

// Start periodic sync
export const startPeriodicSync = (): void => {
  if (syncIntervalId !== null) {
    return; // Already started
  }

  // Perform initial sync
  if (isOnline()) {
    performFullSync().catch((_error) => {
    });
  }

  // Set up periodic sync
  syncIntervalId = window.setInterval(() => {
    if (isOnline()) {
      performFullSync().catch((_error) => {
      });
    }
  }, SYNC_INTERVAL);

  // Listen for online/offline events
  window.addEventListener("online", () => {
    performFullSync().catch((_error) => {
    });
  });
};

// Stop periodic sync
export const stopPeriodicSync = (): void => {
  if (syncIntervalId !== null) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
};

// Get sync status
// Sync track order to Supabase
export const syncTracksOrderToFirestore = async (
  trackOrders: { trackId: string; order: number }[]
): Promise<void> => {
  if (!isOnline()) {
    return;
  }

  try {
    await updateTracksOrder(trackOrders);
  } catch (error) {
    throw error;
  }
};

export const getSyncStatus = async (): Promise<{
  isOnline: boolean;
  isSyncing: boolean;
  pendingOperations: number;
}> => {
  const pendingOperations = await getQueueSize();
  return {
    isOnline: isOnline(),
    isSyncing,
    pendingOperations,
  };
};

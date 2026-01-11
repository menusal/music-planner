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
    console.log("Offline: Cannot sync from Firestore");
    return;
  }

  try {
    const firestoreTracks = await getFirestoreTracks();
    const indexedDBTracks = await getIndexedDBTracks();

    // Create a map of existing tracks
    const existingTracksMap = new Map(
      indexedDBTracks.map((track) => [track.id, track])
    );

    // Sync tracks from Firestore (server wins on conflict)
    for (const firestoreTrack of firestoreTracks) {
      try {
        const dbTrack = await convertFirestoreTrackToDBTrack(firestoreTrack);
        const existingTrack = existingTracksMap.get(dbTrack.id);

        // If track doesn't exist locally or Firestore version is newer, update
        if (!existingTrack || firestoreTrack.updatedAt > (existingTrack as any).updatedAt) {
          await saveTrackToIndexedDB({
            ...dbTrack,
            order: firestoreTrack.order ?? 0,
            synced: true,
            updatedAt: firestoreTrack.updatedAt,
          } as any);
        }
      } catch (error) {
        console.error(`Error converting track ${firestoreTrack.id} from Firestore:`, error);
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
    
    // Dispatch event to notify that tracks were synced
    if (firestoreTracks.length > 0) {
      window.dispatchEvent(new CustomEvent('tracks-synced'));
    }
  } catch (error) {
    console.error("Error syncing tracks from Firestore:", error);
    throw error;
  }
};

// Sync tracks from IndexedDB to Firestore
export const syncTracksToFirestore = async (): Promise<void> => {
  if (!isOnline()) {
    console.log("Offline: Cannot sync to Firestore");
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
        console.error(`Error syncing track ${track.id} to Firestore:`, error);
        // Don't throw, continue with other tracks
      }
    }
  } catch (error) {
    console.error("Error syncing tracks to Firestore:", error);
    throw error;
  }
};

// Sync playlists from Firestore to IndexedDB
export const syncPlaylistsFromFirestore = async (): Promise<void> => {
  if (!isOnline()) {
    console.log("Offline: Cannot sync playlists from Firestore");
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
    console.error("Error syncing playlists from Firestore:", error);
    throw error;
  }
};

// Sync playlists from IndexedDB to Firestore
export const syncPlaylistsToFirestore = async (): Promise<void> => {
  if (!isOnline()) {
    console.log("Offline: Cannot sync playlists to Firestore");
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
        console.error(
          `Error syncing playlist ${playlist.id} to Firestore:`,
          error
        );
        // Don't throw, continue with other playlists
      }
    }
  } catch (error) {
    console.error("Error syncing playlists to Firestore:", error);
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
          case "ADD_TRACK":
            await uploadTrackToFirestore(
              operation.data.id,
              operation.data.title,
              operation.data.artist,
              operation.data.duration,
              operation.data.fileBlob
            );
            await saveTrackToIndexedDB({
              ...operation.data,
              synced: true,
              updatedAt: Date.now(),
            } as any);
            await removeFromSyncQueue(operation.id);
            break;

          case "DELETE_TRACK":
            await deleteTrackFromFirestore(operation.data.id);
            await removeFromSyncQueue(operation.id);
            break;

          case "ADD_PLAYLIST":
          case "UPDATE_PLAYLIST":
            await uploadPlaylistToFirestore(
              operation.data.id,
              operation.data.title,
              operation.data.tracks,
              operation.data.breakTime,
              operation.data.startTime
            );
            await savePlaylistToIndexedDB({
              ...operation.data,
              synced: true,
              updatedAt: Date.now(),
            } as any);
            await removeFromSyncQueue(operation.id);
            break;

          case "DELETE_PLAYLIST":
            await deletePlaylistFromFirestore(operation.data.id);
            await removeFromSyncQueue(operation.id);
            break;

          case "UPDATE_TRACK_ORDER":
            if (operation.data.trackOrders && Array.isArray(operation.data.trackOrders)) {
              await updateTracksOrder(operation.data.trackOrders);
            }
            await removeFromSyncQueue(operation.id);
            break;

          default:
            console.warn(`Unknown operation type: ${operation.type}`);
            await removeFromSyncQueue(operation.id);
        }
      } catch (error) {
        console.error(`Error processing sync operation ${operation.id}:`, error);
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
    console.log("Offline: Cannot perform full sync");
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
    console.error("Error performing full sync:", error);
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
    performFullSync().catch((error) => {
      console.error("Error in initial sync:", error);
    });
  }

  // Set up periodic sync
  syncIntervalId = window.setInterval(() => {
    if (isOnline()) {
      performFullSync().catch((error) => {
        console.error("Error in periodic sync:", error);
      });
    }
  }, SYNC_INTERVAL);

  // Listen for online/offline events
  window.addEventListener("online", () => {
    performFullSync().catch((error) => {
      console.error("Error syncing after coming online:", error);
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
    console.log("Offline: Cannot sync order to Firestore");
    return;
  }

  try {
    await updateTracksOrder(trackOrders);
  } catch (error) {
    console.error("Error syncing tracks order to Firestore:", error);
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

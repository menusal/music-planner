const DB_NAME = "musicPlayerDB";
const DB_VERSION = 4; // Incremented to match existing database version
const STORE_NAME = "tracks";
const QUEUE_STORE_NAME = "syncQueue";

export interface DBTrack {
  id: string;
  title: string;
  duration: number;
  artist?: string;
  fileBlob: Blob;
  order?: number; // Order/position of the track in the playlist
  synced?: boolean;
  updatedAt?: number;
  storageUrl?: string; // URL from Supabase Storage (for mobile compatibility)
}

export interface Playlist {
  id: string;
  title: string;
  tracks: string[]; // Array of track IDs
  breakTime: number;
  startTime?: string;
  createdAt: number;
  updatedAt: number;
  synced?: boolean;
}

// Cache for the database connection to avoid multiple simultaneous opens
let dbPromise: Promise<IDBDatabase> | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  // If there's already an ongoing initialization, wait for it
  if (dbPromise) {
    return dbPromise.then(db => {
      // Verify the database is still open and has the required stores
      if (db.objectStoreNames.contains(STORE_NAME)) {
        return db;
      }
      // If stores are missing, close and reinitialize
      db.close();
      dbPromise = null;
      return initDB();
    });
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    
    request.onsuccess = () => {
      const db = request.result;
      
      // Verify all required stores exist
      const hasTracksStore = db.objectStoreNames.contains(STORE_NAME);
      const hasPlaylistsStore = db.objectStoreNames.contains("playlists");
      const hasQueueStore = db.objectStoreNames.contains(QUEUE_STORE_NAME);
      
      if (!hasTracksStore || !hasPlaylistsStore || !hasQueueStore) {
        
        // Close the database
        db.close();
        dbPromise = null;
        
        // Delete and recreate the database
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => {
          // Retry initialization
          dbPromise = null;
          initDB().then(resolve).catch(reject);
        };
        deleteRequest.onerror = () => {
          dbPromise = null;
          reject(new Error('Failed to delete corrupted database'));
        };
        return;
      }
      
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion || 0;
      const transaction = (event.target as IDBOpenDBRequest).transaction;


      // Create stores if they don't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const trackStore = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        trackStore.createIndex("synced", "synced", { unique: false });
        trackStore.createIndex("updatedAt", "updatedAt", { unique: false });
        trackStore.createIndex("order", "order", { unique: false });
      } else if (oldVersion < 4 && transaction) {
        // Add order index to existing store if upgrading from version 3 or earlier
        try {
          const trackStore = transaction.objectStore(STORE_NAME);
          // Check if order index already exists by trying to create it
          if (!trackStore.indexNames.contains("order")) {
            trackStore.createIndex("order", "order", { unique: false });
          }
        } catch (error: unknown) {
          const err = error as { name?: string; code?: number };
          if (err?.name !== "ConstraintError" && err?.code !== 0) {
          }
        }
      }

      // Create playlists store
      const PLAYLISTS_STORE = "playlists";
      if (!db.objectStoreNames.contains(PLAYLISTS_STORE)) {
        const playlistStore = db.createObjectStore(PLAYLISTS_STORE, {
          keyPath: "id",
        });
        playlistStore.createIndex("createdAt", "createdAt", { unique: false });
        playlistStore.createIndex("updatedAt", "updatedAt", { unique: false });
        playlistStore.createIndex("synced", "synced", { unique: false });
      }

      // Create syncQueue store
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        db.createObjectStore(QUEUE_STORE_NAME, { keyPath: "id" });
      }
      
    };
  });

  return dbPromise;
};

export const saveTrack = async (track: DBTrack, retryCount = 0): Promise<void> => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 100; // 100ms delay between retries
  
  try {
    
    const db = await initDB();
    
    // Verify the store exists before creating a transaction
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      
      // Close the database and retry after a delay
      db.close();
      
      if (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
        return saveTrack(track, retryCount + 1);
      } else {
        throw new Error(`Store "${STORE_NAME}" does not exist after ${MAX_RETRIES} retries`);
      }
    }
    
    
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        
        transaction.onerror = () => {
          reject(transaction.error);
        };
        
        transaction.oncomplete = () => {
        };
        
        transaction.onabort = () => {
          reject(new Error('Transaction aborted'));
        };
        
        const store = transaction.objectStore(STORE_NAME);
        
        // Ensure synced and updatedAt are set
        const trackToSave = {
          ...track,
          synced: track.synced ?? false,
          updatedAt: track.updatedAt ?? Date.now(),
        };
        
        const request = store.put(trackToSave);

        request.onerror = () => {
          
          // If it's a NotFoundError and we haven't exceeded retries, retry
          if (request.error?.name === 'NotFoundError' && retryCount < MAX_RETRIES) {
            db.close();
            setTimeout(() => {
              saveTrack(track, retryCount + 1).then(resolve).catch(reject);
            }, RETRY_DELAY * (retryCount + 1));
            return;
          }
          
          reject(request.error);
        };
        
        request.onsuccess = () => {
          resolve();
        };
      } catch (error) {
        // If it's a NotFoundError and we haven't exceeded retries, retry
        if (error instanceof Error && error.name === 'NotFoundError' && retryCount < MAX_RETRIES) {
          db.close();
          setTimeout(() => {
            saveTrack(track, retryCount + 1).then(resolve).catch(reject);
          }, RETRY_DELAY * (retryCount + 1));
          return;
        }
        
        reject(error);
      }
    });
  } catch (error) {
    // If it's a NotFoundError or version error and we haven't exceeded retries, retry
    if (retryCount < MAX_RETRIES && (
      (error instanceof Error && error.name === 'NotFoundError') ||
      (error instanceof Error && error.message.includes('object stores was not found'))
    )) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
      return saveTrack(track, retryCount + 1);
    }
    
    throw error;
  }
};

export const getAllTracks = async (): Promise<DBTrack[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

export const deleteTrack = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const savePlaylists = async (playlist: Playlist): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["playlists"], "readwrite");
    const store = transaction.objectStore("playlists");
    
    // Ensure synced and updatedAt are set
    const playlistToSave = {
      ...playlist,
      synced: playlist.synced ?? false,
      updatedAt: playlist.updatedAt ?? Date.now(),
      createdAt: playlist.createdAt ?? Date.now(),
    };
    
    const request = store.put(playlistToSave);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const getPlaylist = async (id: string) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["playlists"], "readonly");
    const store = transaction.objectStore("playlists");
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

export const getAllPlaylists = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["playlists"], "readonly");
    const store = transaction.objectStore("playlists");
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

export const deletePlaylist = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["playlists"], "readwrite");
    const store = transaction.objectStore("playlists");
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

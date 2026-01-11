const DB_NAME = "musicPlayerDB";
const DB_VERSION = 3; // Incremented to add order field
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

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

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
      } else if (oldVersion < 3 && transaction) {
        // Add order index to existing store if upgrading from version 2 or earlier
        // We can't reliably check if index exists during upgrade, so we try to create it
        // and ignore errors if it already exists
        try {
          const trackStore = transaction.objectStore(STORE_NAME);
          // Try to create the index - if it exists, this will throw, which we'll catch
          trackStore.createIndex("order", "order", { unique: false });
        } catch (error: any) {
          // Index might already exist (error code 0 or ConstraintError)
          // or there's another issue - log but don't fail the upgrade
          if (error?.name !== "ConstraintError" && error?.code !== 0) {
            console.warn("Could not add order index:", error);
          }
          // Continue with upgrade even if index creation fails
        }
      }

      // Create playlists store
      const PLAYLISTS_STORE = "playlists";
      if (!db.objectStoreNames.contains(PLAYLISTS_STORE)) {
        const playlistStore = db.createObjectStore(PLAYLISTS_STORE, {
          keyPath: "id",
        });
        // Optionally add indexes if needed
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
};

export const saveTrack = async (track: DBTrack): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    
    // Ensure synced and updatedAt are set
    const trackToSave = {
      ...track,
      synced: track.synced ?? false,
      updatedAt: track.updatedAt ?? Date.now(),
    };
    
    const request = store.put(trackToSave);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
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

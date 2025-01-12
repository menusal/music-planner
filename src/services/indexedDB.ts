const DB_NAME = "musicPlayerDB";
const DB_VERSION = 1;
const STORE_NAME = "tracks";

interface DBTrack {
  id: string;
  title: string;
  duration: number;
  artist?: string;
  fileBlob: Blob;
}

interface Playlist {
  id: string;
  title: string;
  tracks: string[]; // Array of track IDs
  breakTime: number;
  createdAt: number;
  updatedAt: number;
}

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create stores if they don't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
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
      }
    };
  });
};

export const saveTrack = async (track: DBTrack): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(track);

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
    const request = store.put(playlist);

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

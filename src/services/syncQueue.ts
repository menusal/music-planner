const QUEUE_STORE_NAME = "syncQueue";
const DB_NAME = "musicPlayerDB";
const DB_VERSION = 3; // Must match indexedDB.ts version

export type SyncOperationType = 
  | "ADD_TRACK" 
  | "DELETE_TRACK" 
  | "UPDATE_PLAYLIST" 
  | "DELETE_PLAYLIST"
  | "ADD_PLAYLIST"
  | "UPDATE_TRACK_ORDER";

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  data: any;
  timestamp: number;
  retries: number;
}

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        db.createObjectStore(QUEUE_STORE_NAME, { keyPath: "id" });
      }
    };
  });
};

export const addToSyncQueue = async (operation: Omit<SyncOperation, "id" | "timestamp" | "retries">): Promise<void> => {
  try {
    const db = await initDB();
    
    // Check if store exists, if not, return (store will be created on next upgrade)
    if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
      console.warn("SyncQueue store not found, operation will be lost. Database upgrade needed.");
      return;
    }
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([QUEUE_STORE_NAME], "readwrite");
      const store = transaction.objectStore(QUEUE_STORE_NAME);
      
      const syncOperation: SyncOperation = {
        id: `${operation.type}-${Date.now()}-${Math.random()}`,
        ...operation,
        timestamp: Date.now(),
        retries: 0,
      };

      const request = store.add(syncOperation);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error("Error adding to sync queue:", error);
    throw error;
  }
};

export const getAllQueuedOperations = async (): Promise<SyncOperation[]> => {
  try {
    const db = await initDB();
    
    // Check if store exists
    if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
      return [];
    }
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([QUEUE_STORE_NAME], "readonly");
      const store = transaction.objectStore(QUEUE_STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  } catch (error) {
    console.error("Error getting queued operations:", error);
    return [];
  }
};

export const removeFromSyncQueue = async (operationId: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(QUEUE_STORE_NAME);
    const request = store.delete(operationId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const incrementRetry = async (operationId: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(QUEUE_STORE_NAME);
    const getRequest = store.get(operationId);

    getRequest.onerror = () => reject(getRequest.error);
    getRequest.onsuccess = () => {
      const operation = getRequest.result;
      if (operation) {
        operation.retries += 1;
        const putRequest = store.put(operation);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      } else {
        resolve();
      }
    };
  });
};

export const clearSyncQueue = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(QUEUE_STORE_NAME);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const getQueueSize = async (): Promise<number> => {
  const operations = await getAllQueuedOperations();
  return operations.length;
};

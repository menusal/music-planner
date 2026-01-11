import { supabase } from "../config/supabase";
import { DBTrack } from "./indexedDB";

export interface SupabaseTrack {
  id: string;
  title: string;
  artist?: string;
  duration: number;
  storage_url: string; // URL to audio file in Supabase Storage
  order: number; // Order/position of the track in the playlist
  created_at: string; // ISO timestamp string
  updated_at: string; // ISO timestamp string
}

export interface SupabasePlaylist {
  id: string;
  title: string;
  tracks: string[]; // Array of track IDs
  break_time: number;
  start_time?: string;
  created_at: string; // ISO timestamp string
  updated_at: string; // ISO timestamp string
}

// Internal interface matching our app's expectations (camelCase with timestamps as numbers)
export interface FirestoreTrack {
  id: string;
  title: string;
  artist?: string;
  duration: number;
  storageUrl: string;
  order: number; // Order/position of the track in the playlist
  createdAt: number;
  updatedAt: number;
}

export interface FirestorePlaylist {
  id: string;
  title: string;
  tracks: string[];
  breakTime: number;
  startTime?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_BUCKET = "music-planner";
const STORAGE_TRACKS_PATH = "tracks";

// Convert Supabase timestamp to number (milliseconds)
const timestampToNumber = (timestamp: string): number => {
  return new Date(timestamp).getTime();
};

// Convert number (milliseconds) to ISO timestamp string
const numberToTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toISOString();
};

// Convert Supabase track to app format
const convertSupabaseTrackToApp = (supabaseTrack: SupabaseTrack): FirestoreTrack => {
  return {
    id: supabaseTrack.id,
    title: supabaseTrack.title,
    artist: supabaseTrack.artist,
    duration: supabaseTrack.duration,
    storageUrl: supabaseTrack.storage_url,
    order: supabaseTrack.order ?? 0, // Default to 0 if order is not set
    createdAt: timestampToNumber(supabaseTrack.created_at),
    updatedAt: timestampToNumber(supabaseTrack.updated_at),
  };
};


// Upload file to Supabase Storage and get public URL
const uploadFileToStorage = async (
  fileBlob: Blob,
  path: string
): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, fileBlob, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
};

// Download file from Supabase Storage
// url can be either a full URL or just the path
const downloadFileFromStorage = async (url: string): Promise<Blob> => {
  // Extract path from URL if it's a full URL
  let path = url;
  if (url.includes('/storage/v1/object/public/')) {
    // Extract path after the bucket name
    const parts = url.split('/storage/v1/object/public/');
    if (parts.length > 1) {
      path = parts[1].replace(`${STORAGE_BUCKET}/`, '');
    }
  } else if (url.includes('/storage/v1/object/')) {
    // Extract path for signed URLs
    const parts = url.split('/storage/v1/object/');
    if (parts.length > 1) {
      const pathPart = parts[1].split('/').slice(1).join('/');
      path = pathPart;
    }
  }

  // Use Supabase storage download method
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(path);

  if (error) {
    throw new Error(`Failed to download file from storage: ${error.message}`);
  }

  if (!data) {
    throw new Error('No data returned from storage download');
  }

  return data;
};

// Track operations
export const uploadTrack = async (
  trackId: string,
  title: string,
  artist: string | undefined,
  duration: number,
  fileBlob: Blob,
  order: number = 0
): Promise<void> => {
  try {
    // Upload file to Supabase Storage
    const storagePath = `${STORAGE_TRACKS_PATH}/${trackId}.mp3`;
    const storageUrl = await uploadFileToStorage(fileBlob, storagePath);

    const now = Date.now();

    const trackData: Partial<SupabaseTrack> = {
      id: trackId,
      title,
      duration,
      storage_url: storageUrl,
      order,
      created_at: numberToTimestamp(now),
      updated_at: numberToTimestamp(now),
    };

    // Only include artist if it's defined
    if (artist !== undefined && artist !== null && artist !== '') {
      trackData.artist = artist;
    }

    const { error } = await supabase
      .from("tracks")
      .upsert(trackData, { onConflict: "id" });

    if (error) {
      throw error;
    }
  } catch (error) {
    throw error;
  }
};

export const getAllTracks = async (): Promise<FirestoreTrack[]> => {
  try {
    const { data, error } = await supabase
      .from("tracks")
      .select("*")
      .order("order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data || []).map((track: SupabaseTrack) => convertSupabaseTrackToApp(track));
  } catch (error) {
    throw error;
  }
};

export const getTrack = async (trackId: string): Promise<FirestoreTrack | null> => {
  try {
    const { data, error } = await supabase
      .from("tracks")
      .select("*")
      .eq("id", trackId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned
        return null;
      }
      throw error;
    }

    return data ? convertSupabaseTrackToApp(data as SupabaseTrack) : null;
  } catch (error) {
    throw error;
  }
};

export const updateTrackOrder = async (
  trackId: string,
  order: number
): Promise<void> => {
  try {
    const { error } = await supabase
      .from("tracks")
      .update({ 
        order,
        updated_at: numberToTimestamp(Date.now())
      })
      .eq("id", trackId);

    if (error) {
      throw error;
    }
  } catch (error) {
    throw error;
  }
};

export const updateTracksOrder = async (
  trackOrders: { trackId: string; order: number }[]
): Promise<void> => {
  try {
    // Update all tracks in a batch
    const updates = trackOrders.map(({ trackId, order }) =>
      supabase
        .from("tracks")
        .update({ 
          order,
          updated_at: numberToTimestamp(Date.now())
        })
        .eq("id", trackId)
    );

    const results = await Promise.all(updates);
    
    // Check for errors
    for (const result of results) {
      if (result.error) {
        throw result.error;
      }
    }
  } catch (error) {
    throw error;
  }
};

export const deleteTrack = async (trackId: string): Promise<void> => {
  try {
    // Delete from database
    const { error: dbError } = await supabase
      .from("tracks")
      .delete()
      .eq("id", trackId);

    if (dbError) {
      throw dbError;
    }

    // Delete from Storage
    try {
      const storagePath = `${STORAGE_TRACKS_PATH}/${trackId}.mp3`;
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath]);

      if (storageError) {
        // If file doesn't exist in storage, that's okay (might be old data)
      }
    } catch (storageError) {
    }
  } catch (error) {
    throw error;
  }
};

// Playlist operations
export const uploadPlaylist = async (
  playlistId: string,
  title: string,
  tracks: string[],
  breakTime: number,
  startTime?: string
): Promise<void> => {
  try {
    const now = Date.now();

    const playlistData: Partial<SupabasePlaylist> = {
      id: playlistId,
      title,
      tracks,
      break_time: breakTime,
      created_at: numberToTimestamp(now),
      updated_at: numberToTimestamp(now),
    };

    // Only include startTime if it's defined
    if (startTime !== undefined && startTime !== null && startTime !== '') {
      playlistData.start_time = startTime;
    }

    const { error } = await supabase
      .from("playlists")
      .upsert(playlistData, { onConflict: "id" });

    if (error) {
      throw error;
    }
  } catch (error) {
    throw error;
  }
};

export const getAllPlaylists = async (): Promise<FirestorePlaylist[]> => {
  try {
    const { data, error } = await supabase
      .from("playlists")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data || []).map((playlist: SupabasePlaylist) => ({
      id: playlist.id,
      title: playlist.title,
      tracks: playlist.tracks,
      breakTime: playlist.break_time,
      startTime: playlist.start_time,
      createdAt: timestampToNumber(playlist.created_at),
      updatedAt: timestampToNumber(playlist.updated_at),
    }));
  } catch (error) {
    throw error;
  }
};

export const getPlaylist = async (playlistId: string): Promise<FirestorePlaylist | null> => {
  try {
    const { data, error } = await supabase
      .from("playlists")
      .select("*")
      .eq("id", playlistId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned
        return null;
      }
      throw error;
    }

    if (!data) {
      return null;
    }

    const playlist = data as SupabasePlaylist;
    return {
      id: playlist.id,
      title: playlist.title,
      tracks: playlist.tracks,
      breakTime: playlist.break_time,
      startTime: playlist.start_time,
      createdAt: timestampToNumber(playlist.created_at),
      updatedAt: timestampToNumber(playlist.updated_at),
    };
  } catch (error) {
    throw error;
  }
};

export const deletePlaylist = async (playlistId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from("playlists")
      .delete()
      .eq("id", playlistId);

    if (error) {
      throw error;
    }
  } catch (error) {
    throw error;
  }
};

// Utility functions for conversion (keeping same interface for compatibility)
export const convertFirestoreTrackToDBTrack = async (
  firestoreTrack: FirestoreTrack
): Promise<DBTrack> => {
  try {
    // Download file from Storage
    const fileBlob = await downloadFileFromStorage(firestoreTrack.storageUrl);
    
    return {
      id: firestoreTrack.id,
      title: firestoreTrack.title,
      duration: firestoreTrack.duration,
      artist: firestoreTrack.artist,
      fileBlob,
      order: firestoreTrack.order,
      synced: true,
      updatedAt: firestoreTrack.updatedAt,
      storageUrl: firestoreTrack.storageUrl, // Save storage URL for mobile compatibility
    };
  } catch (error) {
    throw error;
  }
};

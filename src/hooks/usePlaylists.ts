import { useState, useCallback } from "react";
import { Track } from "../types";
import { syncPlaylistsToFirestore, isOnline } from "../services/syncService";
import { addToSyncQueue } from "../services/syncQueue";
import { savePlaylists as savePlaylistToIndexedDB } from "../services/indexedDB";

export interface PlaylistData {
  id: string;
  title: string;
  tracks: Track[];
  breakTime: number;
}

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<PlaylistData[]>(() => {
    const saved = localStorage.getItem("playlists");
    if (saved) {
      return JSON.parse(saved);
    }
    // Crear playlist por defecto si no hay ninguna guardada
    const defaultPlaylist = {
      id: "default",
      title: "Playlist",
      tracks: [],
      breakTime: 0,
    };
    localStorage.setItem("playlists", JSON.stringify([defaultPlaylist]));
    return [defaultPlaylist];
  });

  const savePlaylist = useCallback(async (playlistToSave: PlaylistData) => {
    setPlaylists((currentPlaylists) => {
      const updatedPlaylists = currentPlaylists.map((playlist) =>
        playlist.id === playlistToSave.id ? playlistToSave : playlist
      );

      // Si no existe la playlist, la añadimos
      if (!currentPlaylists.some((p) => p.id === playlistToSave.id)) {
        updatedPlaylists.push(playlistToSave);
      }

      // Guardar en localStorage
      localStorage.setItem("playlists", JSON.stringify(updatedPlaylists));
      
      // Also save to IndexedDB for sync
      const playlistForIndexedDB = {
        id: playlistToSave.id,
        title: playlistToSave.title,
        tracks: playlistToSave.tracks.map((t) => t.id),
        breakTime: playlistToSave.breakTime,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        synced: false,
      };
      
      savePlaylistToIndexedDB(playlistForIndexedDB).catch((_error) => {
      });
      
      // Sync to Firestore if online, otherwise queue
      if (isOnline()) {
        syncPlaylistsToFirestore().catch((_error) => {
        });
      } else {
        addToSyncQueue({
          type: "UPDATE_PLAYLIST",
          data: playlistForIndexedDB,
        }).catch((_error) => {
        });
      }
      
      return updatedPlaylists;
    });
  }, []);

  const deletePlaylist = useCallback(async (playlistId: string) => {
    setPlaylists((currentPlaylists) => {
      const updatedPlaylists = currentPlaylists.filter(
        (p) => p.id !== playlistId
      );
      localStorage.setItem("playlists", JSON.stringify(updatedPlaylists));
      
      // Delete from IndexedDB
      import("../services/indexedDB").then(({ deletePlaylist: deletePlaylistFromIndexedDB }) => {
        deletePlaylistFromIndexedDB(playlistId).catch((_error) => {
        });
      });
      
      // Sync deletion to Firestore if online, otherwise queue
      if (isOnline()) {
        import("../services/supabaseService").then(({ deletePlaylist: deletePlaylistFromFirestore }) => {
          deletePlaylistFromFirestore(playlistId).catch((_error) => {
          });
        });
      } else {
        addToSyncQueue({
          type: "DELETE_PLAYLIST",
          data: { id: playlistId },
        }).catch((_error) => {
        });
      }
      
      return updatedPlaylists;
    });
  }, []);

  const createPlaylist = useCallback((title: string = "New Playlist") => {
    const newPlaylist: PlaylistData = {
      id: `playlist-${Date.now()}`, // Generamos un ID único
      title,
      tracks: [],
      breakTime: 0,
    };

    setPlaylists((currentPlaylists) => {
      const updatedPlaylists = [...currentPlaylists, newPlaylist];
      localStorage.setItem("playlists", JSON.stringify(updatedPlaylists));
      
      // Also save to IndexedDB for sync
      const playlistForIndexedDB = {
        id: newPlaylist.id,
        title: newPlaylist.title,
        tracks: [],
        breakTime: newPlaylist.breakTime,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        synced: false,
      };
      
      savePlaylistToIndexedDB(playlistForIndexedDB).catch((_error) => {
      });
      
      // Sync to Firestore if online, otherwise queue
      if (isOnline()) {
        syncPlaylistsToFirestore().catch((_error) => {
        });
      } else {
        addToSyncQueue({
          type: "ADD_PLAYLIST",
          data: playlistForIndexedDB,
        }).catch((_error) => {
        });
      }
      
      return updatedPlaylists;
    });

    return newPlaylist;
  }, []);

  return {
    playlists,
    savePlaylist,
    deletePlaylist,
    createPlaylist,
  };
}

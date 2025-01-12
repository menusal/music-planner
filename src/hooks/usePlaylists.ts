import { useState, useCallback } from "react";
import { Track } from "../types";

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

  const savePlaylist = useCallback((playlistToSave: PlaylistData) => {
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
      return updatedPlaylists;
    });
  }, []);

  const deletePlaylist = useCallback((playlistId: string) => {
    setPlaylists((currentPlaylists) => {
      const updatedPlaylists = currentPlaylists.filter(
        (p) => p.id !== playlistId
      );
      localStorage.setItem("playlists", JSON.stringify(updatedPlaylists));
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

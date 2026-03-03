import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { favoritesAPI } from "../../services/api";

export interface Favorite {
  id: string;
  displayOrder: number;
  description?: string;
  projectId: string;
  taskId?: string;
  project?: {
    id: string;
    name: string;
    color: string;
  };
  task?: {
    id: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface FavoritesState {
  favorites: Favorite[];
  loading: boolean;
  error: string | null;
}

export const MAX_FAVORITES = 5;

const initialState: FavoritesState = {
  favorites: [],
  loading: false,
  error: null,
};

// Async thunks
export const fetchFavorites = createAsyncThunk(
  "favorites/fetchFavorites",
  async () => {
    const response = await favoritesAPI.getFavorites();
    return response;
  }
);

export const createFavorite = createAsyncThunk(
  "favorites/createFavorite",
  async (data: {
    projectId: string;
    taskId?: string;
    description?: string;
  }) => {
    const response = await favoritesAPI.createFavorite(data);
    return response;
  }
);

export const deleteFavorite = createAsyncThunk(
  "favorites/deleteFavorite",
  async (id: string) => {
    await favoritesAPI.deleteFavorite(id);
    return id;
  }
);

const favoritesSlice = createSlice({
  name: "favorites",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    // Socket event reducers
    favoriteCreatedFromSocket: (state, action: PayloadAction<Favorite>) => {
      const favorite = action.payload;
      if (!state.favorites.find((f) => f.id === favorite.id)) {
        state.favorites.push(favorite);
        state.favorites.sort((a, b) => a.displayOrder - b.displayOrder);
      }
    },
    favoriteDeletedFromSocket: (
      state,
      action: PayloadAction<{ id: string }>
    ) => {
      state.favorites = state.favorites.filter(
        (f) => f.id !== action.payload.id
      );
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFavorites.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFavorites.fulfilled, (state, action) => {
        state.loading = false;
        state.favorites = action.payload;
      })
      .addCase(fetchFavorites.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch favorites";
      })
      .addCase(createFavorite.fulfilled, (state, action) => {
        if (!state.favorites.find((f) => f.id === action.payload.id)) {
          state.favorites.push(action.payload);
          state.favorites.sort((a, b) => a.displayOrder - b.displayOrder);
        }
      })
      .addCase(createFavorite.rejected, (state, action) => {
        state.error = action.error.message || "Failed to create favorite";
      })
      .addCase(deleteFavorite.fulfilled, (state, action) => {
        state.favorites = state.favorites.filter(
          (f) => f.id !== action.payload
        );
      })
  },
});

export const {
  clearError,
  favoriteCreatedFromSocket,
  favoriteDeletedFromSocket,
} = favoritesSlice.actions;

export default favoritesSlice.reducer;

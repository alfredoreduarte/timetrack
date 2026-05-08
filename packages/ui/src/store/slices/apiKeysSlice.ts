import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { apiKeysAPI } from "../../services/api";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

interface ApiKeysState {
  apiKeys: ApiKey[];
  loading: boolean;
  error: string | null;
}

const initialState: ApiKeysState = {
  apiKeys: [],
  loading: false,
  error: null,
};

export const fetchApiKeys = createAsyncThunk("apiKeys/fetch", async () => {
  return apiKeysAPI.list();
});

export const createApiKey = createAsyncThunk(
  "apiKeys/create",
  async (data: { name: string; expiresAt?: string }) => {
    return apiKeysAPI.create(data);
  }
);

export const revokeApiKey = createAsyncThunk(
  "apiKeys/revoke",
  async (id: string) => {
    await apiKeysAPI.revoke(id);
    return id;
  }
);

const apiKeysSlice = createSlice({
  name: "apiKeys",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchApiKeys.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchApiKeys.fulfilled, (state, action) => {
        state.loading = false;
        state.apiKeys = action.payload;
      })
      .addCase(fetchApiKeys.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch API keys";
      })
      .addCase(createApiKey.fulfilled, (state, action) => {
        state.apiKeys.unshift(action.payload.apiKey);
      })
      .addCase(createApiKey.rejected, (state, action) => {
        state.error = action.error.message || "Failed to create API key";
      })
      .addCase(revokeApiKey.fulfilled, (state, action) => {
        state.apiKeys = state.apiKeys.filter((k) => k.id !== action.payload);
      })
      .addCase(revokeApiKey.rejected, (state, action) => {
        state.error = action.error.message || "Failed to revoke API key";
      });
  },
});

export const { clearError } = apiKeysSlice.actions;
export default apiKeysSlice.reducer;

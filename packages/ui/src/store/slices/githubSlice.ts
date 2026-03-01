import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { githubAPI } from "../../services/api";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  description?: string;
  html_url: string;
  private: boolean;
  open_issues_count: number;
}

interface GitHubState {
  connected: boolean;
  username: string | null;
  avatarUrl: string | null;
  repos: GitHubRepo[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
}

const initialState: GitHubState = {
  connected: false,
  username: null,
  avatarUrl: null,
  repos: [],
  loading: false,
  syncing: false,
  error: null,
};

export const fetchGitHubStatus = createAsyncThunk(
  "github/fetchStatus",
  async () => {
    return githubAPI.getStatus();
  }
);

export const fetchGitHubRepos = createAsyncThunk(
  "github/fetchRepos",
  async () => {
    const response = await githubAPI.getRepos();
    return response.repos;
  }
);

export const disconnectGitHub = createAsyncThunk(
  "github/disconnect",
  async () => {
    await githubAPI.disconnect();
  }
);

export const syncGitHubIssues = createAsyncThunk(
  "github/syncIssues",
  async (projectId: string) => {
    return githubAPI.syncIssues(projectId);
  }
);

const githubSlice = createSlice({
  name: "github",
  initialState,
  reducers: {
    clearGitHubError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchGitHubStatus.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchGitHubStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.connected = action.payload.connected;
        state.username = action.payload.username || null;
        state.avatarUrl = action.payload.avatarUrl || null;
      })
      .addCase(fetchGitHubStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch GitHub status";
      })
      .addCase(fetchGitHubRepos.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchGitHubRepos.fulfilled, (state, action) => {
        state.loading = false;
        state.repos = action.payload;
      })
      .addCase(fetchGitHubRepos.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch repos";
      })
      .addCase(disconnectGitHub.fulfilled, (state) => {
        state.connected = false;
        state.username = null;
        state.avatarUrl = null;
        state.repos = [];
      })
      .addCase(syncGitHubIssues.pending, (state) => {
        state.syncing = true;
      })
      .addCase(syncGitHubIssues.fulfilled, (state) => {
        state.syncing = false;
      })
      .addCase(syncGitHubIssues.rejected, (state, action) => {
        state.syncing = false;
        state.error = action.error.message || "Failed to sync issues";
      });
  },
});

export const { clearGitHubError } = githubSlice.actions;
export default githubSlice.reducer;

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { authAPI, User, setInMemoryToken } from "../../services/api";
import { secureStorage, storage } from "../../services/storage";

export type { User } from "../../services/api";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  hasCheckedAuth: boolean;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,
  hasCheckedAuth: false,
};

// Rehydrate auth state from storage on app startup
export const rehydrateAuth = createAsyncThunk(
  "auth/rehydrate",
  async (_, { rejectWithValue }) => {
    try {
      const token = await secureStorage.getItem("token");
      const userJson = await storage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;

      if (token) {
        setInMemoryToken(token);
      }

      return { token, user };
    } catch {
      return rejectWithValue("Failed to rehydrate auth");
    }
  }
);

export const loginUser = createAsyncThunk(
  "auth/login",
  async (
    credentials: { email: string; password: string },
    { rejectWithValue }
  ) => {
    try {
      const response = await authAPI.login(credentials);
      setInMemoryToken(response.token);
      await secureStorage.setItem("token", response.token);
      await storage.setItem("user", JSON.stringify(response.user));
      return response;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        "Login failed";
      return rejectWithValue(errorMessage);
    }
  }
);

export const registerUser = createAsyncThunk(
  "auth/register",
  async (
    userData: {
      email: string;
      password: string;
      name: string;
      captchaId: string;
      captchaValue: string;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await authAPI.register(userData);
      setInMemoryToken(response.token);
      await secureStorage.setItem("token", response.token);
      await storage.setItem("user", JSON.stringify(response.user));
      return response;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        "Registration failed";
      return rejectWithValue(errorMessage);
    }
  }
);

export const getCurrentUser = createAsyncThunk(
  "auth/getCurrentUser",
  async (_, { rejectWithValue }) => {
    try {
      const response = await authAPI.getCurrentUser();
      await storage.setItem("user", JSON.stringify(response));
      return response;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        "Failed to get user";
      return rejectWithValue(errorMessage);
    }
  }
);

export const updateProfile = createAsyncThunk(
  "auth/updateProfile",
  async (
    profileData: {
      name?: string;
      email?: string;
      defaultHourlyRate?: number;
      idleTimeoutSeconds?: number;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await authAPI.updateProfile(profileData);
      await storage.setItem("user", JSON.stringify(response));
      return response;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        "Failed to update profile";
      return rejectWithValue(errorMessage);
    }
  }
);

export const logoutUser = createAsyncThunk("auth/logout", async () => {
  setInMemoryToken(null);
  await secureStorage.removeItem("token");
  await storage.removeItem("user");
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCredentials: (
      state,
      action: PayloadAction<{ user: User; token: string }>
    ) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
      state.hasCheckedAuth = true;
    },
  },
  extraReducers: (builder) => {
    builder
      // Rehydrate
      .addCase(rehydrateAuth.fulfilled, (state, action) => {
        const { token, user } = action.payload;
        if (token) {
          state.token = token;
          state.user = user;
          state.isAuthenticated = true;
        }
        state.hasCheckedAuth = true;
      })
      .addCase(rehydrateAuth.rejected, (state) => {
        state.hasCheckedAuth = true;
      })
      // Login
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.error = null;
        state.hasCheckedAuth = true;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      })
      // Register
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.error = null;
        state.hasCheckedAuth = true;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      })
      // Get current user
      .addCase(getCurrentUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
        state.hasCheckedAuth = true;
      })
      .addCase(getCurrentUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        state.token = null;
        state.hasCheckedAuth = true;
      })
      // Update profile
      .addCase(updateProfile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        state.error = null;
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Logout
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.error = null;
        state.hasCheckedAuth = false;
      });
  },
});

export const { clearError, setCredentials } = authSlice.actions;
export default authSlice.reducer;

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { projectsAPI, tasksAPI } from "../../services/api";
import { fetchDashboardEarnings } from "./dashboardSlice";

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  hourlyRate?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  hourlyRate?: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectsState {
  projects: Project[];
  tasks: Task[];
  loading: boolean;
  error: string | null;
}

const initialState: ProjectsState = {
  projects: [],
  tasks: [],
  loading: false,
  error: null,
};

// Async thunks for projects
export const fetchProjects = createAsyncThunk(
  "projects/fetchProjects",
  async () => {
    const response = await projectsAPI.getProjects();
    return response;
  }
);

export const createProject = createAsyncThunk(
  "projects/createProject",
  async (projectData: {
    name: string;
    description?: string;
    color?: string;
    hourlyRate?: number;
  }) => {
    const response = await projectsAPI.createProject(projectData);
    return response;
  }
);

export const updateProject = createAsyncThunk(
  "projects/updateProject",
  async ({ id, data }: { id: string; data: Partial<Project> }) => {
    const response = await projectsAPI.updateProject(id, data);
    return response;
  }
);

export const deleteProject = createAsyncThunk(
  "projects/deleteProject",
  async (id: string, { dispatch }) => {
    await projectsAPI.deleteProject(id);
    // Refresh dashboard earnings after deleting a project since this affects associated time entries
    dispatch(fetchDashboardEarnings());
    return id;
  }
);

// Async thunks for tasks
export const fetchTasks = createAsyncThunk(
  "projects/fetchTasks",
  async (projectId?: string) => {
    const response = await tasksAPI.getTasks(projectId);
    return response;
  }
);

export const createTask = createAsyncThunk(
  "projects/createTask",
  async (taskData: {
    name: string;
    description?: string;
    projectId: string;
    hourlyRate?: number;
  }) => {
    const response = await tasksAPI.createTask(taskData);
    return response;
  }
);

export const updateTask = createAsyncThunk(
  "projects/updateTask",
  async ({ id, data }: { id: string; data: Partial<Task> }) => {
    const response = await tasksAPI.updateTask(id, data);
    return response;
  }
);

export const deleteTask = createAsyncThunk(
  "projects/deleteTask",
  async (id: string, { dispatch }) => {
    await tasksAPI.deleteTask(id);
    // Refresh dashboard earnings after deleting a task since this affects associated time entries
    dispatch(fetchDashboardEarnings());
    return id;
  }
);

const projectsSlice = createSlice({
  name: "projects",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Projects
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.loading = false;
        state.projects = action.payload;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch projects";
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.projects.push(action.payload);
      })
      .addCase(updateProject.fulfilled, (state, action) => {
        const index = state.projects.findIndex(
          (p) => p.id === action.payload.id
        );
        if (index !== -1) {
          state.projects[index] = action.payload;
        }
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.projects = state.projects.filter((p) => p.id !== action.payload);
      })
      // Tasks
      .addCase(fetchTasks.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTasks.fulfilled, (state, action) => {
        state.loading = false;
        state.tasks = action.payload;
      })
      .addCase(fetchTasks.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch tasks";
      })
      .addCase(createTask.fulfilled, (state, action) => {
        state.tasks.push(action.payload);
      })
      .addCase(updateTask.fulfilled, (state, action) => {
        const index = state.tasks.findIndex((t) => t.id === action.payload.id);
        if (index !== -1) {
          state.tasks[index] = action.payload;
        }
      })
      .addCase(deleteTask.fulfilled, (state, action) => {
        state.tasks = state.tasks.filter((t) => t.id !== action.payload);
      });
  },
});

export const { clearError } = projectsSlice.actions;
export default projectsSlice.reducer;

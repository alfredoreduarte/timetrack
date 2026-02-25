import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { projectsAPI, tasksAPI, Project, Task } from "../../services/api";
import { fetchDashboardEarnings } from "./dashboardSlice";

export type { Project, Task } from "../../services/api";

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

export const fetchProjects = createAsyncThunk(
  "projects/fetchProjects",
  async () => {
    return await projectsAPI.getProjects();
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
    return await projectsAPI.createProject(projectData);
  }
);

export const updateProject = createAsyncThunk(
  "projects/updateProject",
  async ({ id, data }: { id: string; data: Partial<Project> }) => {
    return await projectsAPI.updateProject(id, data);
  }
);

export const deleteProject = createAsyncThunk(
  "projects/deleteProject",
  async (id: string, { dispatch }) => {
    await projectsAPI.deleteProject(id);
    dispatch(fetchDashboardEarnings());
    return id;
  }
);

export const fetchTasks = createAsyncThunk(
  "projects/fetchTasks",
  async ({
    projectId,
    isCompleted,
  }: {
    projectId?: string;
    isCompleted?: boolean;
  } = {}) => {
    return await tasksAPI.getTasks(projectId, isCompleted);
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
    return await tasksAPI.createTask(taskData);
  }
);

export const updateTask = createAsyncThunk(
  "projects/updateTask",
  async ({ id, data }: { id: string; data: Partial<Task> }) => {
    return await tasksAPI.updateTask(id, data);
  }
);

export const deleteTask = createAsyncThunk(
  "projects/deleteTask",
  async (id: string, { dispatch }) => {
    await tasksAPI.deleteTask(id);
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
    projectCreatedFromSocket: (state, action: PayloadAction<Project>) => {
      if (!state.projects.find((p) => p.id === action.payload.id)) {
        state.projects.push(action.payload);
      }
    },
    projectUpdatedFromSocket: (state, action: PayloadAction<Project>) => {
      const index = state.projects.findIndex((p) => p.id === action.payload.id);
      if (index !== -1) {
        state.projects[index] = action.payload;
      }
    },
    projectDeletedFromSocket: (state, action: PayloadAction<{ id: string }>) => {
      state.projects = state.projects.filter((p) => p.id !== action.payload.id);
    },
    taskCreatedFromSocket: (state, action: PayloadAction<Task>) => {
      if (!state.tasks.find((t) => t.id === action.payload.id)) {
        state.tasks.push(action.payload);
      }
    },
    taskUpdatedFromSocket: (state, action: PayloadAction<Task>) => {
      const index = state.tasks.findIndex((t) => t.id === action.payload.id);
      if (index !== -1) {
        state.tasks[index] = action.payload;
      }
    },
    taskDeletedFromSocket: (state, action: PayloadAction<{ id: string }>) => {
      state.tasks = state.tasks.filter((t) => t.id !== action.payload.id);
    },
  },
  extraReducers: (builder) => {
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
        const index = state.projects.findIndex((p) => p.id === action.payload.id);
        if (index !== -1) {
          state.projects[index] = action.payload;
        }
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.projects = state.projects.filter((p) => p.id !== action.payload);
      })
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

export const {
  clearError,
  projectCreatedFromSocket,
  projectUpdatedFromSocket,
  projectDeletedFromSocket,
  taskCreatedFromSocket,
  taskUpdatedFromSocket,
  taskDeletedFromSocket,
} = projectsSlice.actions;
export default projectsSlice.reducer;

# Feature: Favorite / Pinned Timers for One-Click Start

## Summary

Users currently have no way to quickly start timers for their most common project/task combinations. The existing "Resume Last Timer" feature (`ResumeLastTimer.tsx`) only surfaces the single most recent completed entry, which changes every time a new entry is stopped. For freelancers and developers who regularly alternate between 3-5 recurring project/task combos throughout the day, this means repeatedly navigating project and task dropdowns to start a timer they have already configured dozens of times before.

This feature introduces **Favorites** (also referred to as "pinned timers"): a persistent, user-ordered list of up to 5 project/task/description combinations that appear as one-click launch cards on the Dashboard. Users can star entries from their recent time entries list, or add favorites manually, and start any of them with a single click.

**Value proposition**: Reduces the time-to-start-tracking from ~10 seconds (open dropdown, find project, select task, type description, click start) to ~1 second (click play on a favorite card).

---

## Motivation / User Stories

1. **As a freelancer**, I want to pin my 3-5 most common project/task combos so I can start tracking with one click, without navigating dropdowns every time I switch between clients.

2. **As a developer**, I want to see my favorites on the Dashboard without scrolling, so I can start tracking immediately when I begin a work session.

3. **As a user**, I want to star/unstar time entries from the recent entries list, so that adding a new favorite is effortless and contextual.

4. **As a user with multiple devices**, I want my favorites to sync across my web, desktop, and mobile clients in real-time via Socket.IO.

5. **As a user**, I want to reorder my favorites so the most frequently used ones appear first.

6. **As a user**, I want clear feedback when a favorited project or task no longer exists, so I can clean up stale favorites.

---

## Detailed Design

### Data Model

**Two options were considered:**

| | Option A: Separate `Favorite` Model | Option B: JSON Array on `User` |
|---|---|---|
| Relational integrity | Foreign keys to Project and Task; cascading deletes handled by the DB | No FK enforcement; stale references persist silently |
| Query flexibility | Can query favorites with `include` for project/task details, filter, paginate | Must parse JSON in application code |
| Ordering | `displayOrder` column with DB-level sorting | Array index ordering works but is fragile under concurrent updates |
| Migration complexity | One new table + migration | ALTER TABLE to add a JSON column |
| Socket.IO sync | Each favorite has a stable `id` for granular create/update/delete events | Must send the entire array on every change |

**Recommendation: Option A** -- a dedicated `Favorite` model. Relational integrity and granular Socket.IO events make this the clear winner for a multi-client app.

#### Prisma Schema Addition

Add to `packages/api/prisma/schema.prisma`:

```prisma
model Favorite {
  id            String   @id @default(cuid())
  displayOrder  Int      @default(0) @map("display_order")
  description   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  taskId    String?
  task      Task?    @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@unique([userId, projectId, taskId, description], name: "unique_favorite")
  @@map("favorites")
  @@index([userId])
  @@index([userId, displayOrder])
}
```

**Key decisions:**

- `onDelete: Cascade` on all foreign keys -- when a project, task, or user is deleted, the associated favorites are automatically removed. This is cleaner than `SetNull` because a favorite without a project is meaningless.
- `@@unique` compound constraint prevents duplicate favorites for the same project+task+description combination per user. Note: `description` can be `null`, and PostgreSQL treats each `null` as distinct in unique constraints, so two favorites with the same projectId and taskId but both with `null` descriptions will be allowed. The server-side validation (see API section) handles this by normalizing `null`/`undefined`/`""` descriptions before the uniqueness check.
- `displayOrder` defaults to 0. When inserting, the API assigns the next available order value. This keeps ordering logic server-side.
- `@@index([userId, displayOrder])` optimizes the most common query: fetching a user's favorites in order.

**Required changes to existing models:**

Add the `favorites` relation to `User`, `Project`, and `Task`:

```prisma
// In User model, add:
favorites    Favorite[]

// In Project model, add:
favorites    Favorite[]

// In Task model, add:
favorites    Favorite[]
```

#### Shared Types

Add to `packages/shared/src/types/index.ts`:

```typescript
// Favorite types
export interface Favorite {
  id: string;
  displayOrder: number;
  description?: string;
  userId: string;
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

export interface CreateFavoriteRequest {
  projectId: string;
  taskId?: string;
  description?: string;
  displayOrder?: number;
}

export interface UpdateFavoriteRequest {
  description?: string;
  displayOrder?: number;
}

export interface ReorderFavoritesRequest {
  orderedIds: string[];
}
```

---

### API Endpoints

Create `packages/api/src/routes/favorites.ts` following the existing route patterns (Zod validation, `asyncHandler`, `AuthenticatedRequest`, Socket.IO emission).

#### `GET /favorites`

List all favorites for the authenticated user, ordered by `displayOrder`.

**Response:**
```json
{
  "favorites": [
    {
      "id": "clxyz...",
      "displayOrder": 0,
      "description": "Daily standup notes",
      "projectId": "clxyz...",
      "taskId": "clxyz...",
      "project": {
        "id": "clxyz...",
        "name": "Acme Corp",
        "color": "#3B82F6"
      },
      "task": {
        "id": "clxyz...",
        "name": "Meetings"
      },
      "createdAt": "2026-02-28T10:00:00.000Z",
      "updatedAt": "2026-02-28T10:00:00.000Z"
    }
  ]
}
```

#### `POST /favorites`

Create a new favorite.

**Request body:**
```json
{
  "projectId": "clxyz...",
  "taskId": "clxyz...",
  "description": "Daily standup notes"
}
```

**Validation rules:**
- `projectId` is required and must reference an active project owned by the user
- `taskId` is optional; if provided, must reference a task owned by the user within the specified project
- `description` is optional, max 200 characters
- Reject if user already has 5 favorites (HTTP 400)
- Reject if duplicate project+task+description combo exists (HTTP 409)
- `displayOrder` is auto-assigned as `max(existing displayOrder) + 1`

**Response (201):**
```json
{
  "message": "Favorite created successfully",
  "favorite": { ... }
}
```

**Error responses:**
- `400`: "Maximum of 5 favorites allowed"
- `404`: "Project not found" / "Task not found"
- `409`: "This combination is already a favorite"

**Socket.IO event:** `favorite-created` emitted to `user-{userId}` room.

#### `DELETE /favorites/:id`

Remove a favorite.

**Response (200):**
```json
{
  "message": "Favorite deleted successfully"
}
```

**Error responses:**
- `404`: "Favorite not found"

**Socket.IO event:** `favorite-deleted` emitted with `{ id }`.

#### `PUT /favorites/:id`

Update a single favorite (description or displayOrder).

**Request body:**
```json
{
  "description": "Updated description",
  "displayOrder": 2
}
```

**Validation rules:**
- At least one field must be provided
- `description` max 200 characters
- `displayOrder` must be a non-negative integer

**Response (200):**
```json
{
  "message": "Favorite updated successfully",
  "favorite": { ... }
}
```

**Socket.IO event:** `favorite-updated` emitted with the full favorite object.

#### `PUT /favorites/reorder`

Bulk reorder all favorites. Accepts an ordered array of favorite IDs.

**Request body:**
```json
{
  "orderedIds": ["clxyz1...", "clxyz2...", "clxyz3..."]
}
```

**Validation rules:**
- `orderedIds` must contain exactly the same set of IDs as the user's current favorites (no additions, no omissions)
- Each ID must belong to the authenticated user

**Implementation:** Uses a Prisma transaction to update all `displayOrder` values atomically:
```typescript
await prisma.$transaction(
  orderedIds.map((id, index) =>
    prisma.favorite.update({
      where: { id },
      data: { displayOrder: index },
    })
  )
);
```

**Response (200):**
```json
{
  "message": "Favorites reordered successfully",
  "favorites": [ ... ]
}
```

**Socket.IO event:** `favorites-reordered` emitted with the full ordered array.

---

### Redux Slice

Create `packages/ui/src/store/slices/favoritesSlice.ts`:

```typescript
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

export const updateFavorite = createAsyncThunk(
  "favorites/updateFavorite",
  async ({ id, data }: { id: string; data: { description?: string; displayOrder?: number } }) => {
    const response = await favoritesAPI.updateFavorite(id, data);
    return response;
  }
);

export const reorderFavorites = createAsyncThunk(
  "favorites/reorderFavorites",
  async (orderedIds: string[]) => {
    const response = await favoritesAPI.reorderFavorites(orderedIds);
    return response;
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
    favoriteDeletedFromSocket: (state, action: PayloadAction<{ id: string }>) => {
      state.favorites = state.favorites.filter((f) => f.id !== action.payload.id);
    },
    favoriteUpdatedFromSocket: (state, action: PayloadAction<Favorite>) => {
      const index = state.favorites.findIndex((f) => f.id === action.payload.id);
      if (index !== -1) {
        state.favorites[index] = action.payload;
      }
      state.favorites.sort((a, b) => a.displayOrder - b.displayOrder);
    },
    favoritesReorderedFromSocket: (state, action: PayloadAction<Favorite[]>) => {
      state.favorites = action.payload;
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
        state.favorites.push(action.payload);
        state.favorites.sort((a, b) => a.displayOrder - b.displayOrder);
      })
      .addCase(createFavorite.rejected, (state, action) => {
        state.error = action.error.message || "Failed to create favorite";
      })
      .addCase(deleteFavorite.fulfilled, (state, action) => {
        state.favorites = state.favorites.filter((f) => f.id !== action.payload);
      })
      .addCase(updateFavorite.fulfilled, (state, action) => {
        const index = state.favorites.findIndex((f) => f.id === action.payload.id);
        if (index !== -1) {
          state.favorites[index] = action.payload;
        }
        state.favorites.sort((a, b) => a.displayOrder - b.displayOrder);
      })
      .addCase(reorderFavorites.fulfilled, (state, action) => {
        state.favorites = action.payload;
      });
  },
});

export const {
  clearError,
  favoriteCreatedFromSocket,
  favoriteDeletedFromSocket,
  favoriteUpdatedFromSocket,
  favoritesReorderedFromSocket,
} = favoritesSlice.actions;

export default favoritesSlice.reducer;
```

---

### UI Components

#### FavoritesBar

A horizontal row of favorite cards rendered on the Dashboard between the Timer/Earnings section and the Recent Time Entries section.

**Location:** `packages/ui/src/components/FavoritesBar.tsx`

**Behavior:**
- Fetches favorites on mount via `dispatch(fetchFavorites())`
- Renders up to 5 `FavoriteCard` components in a horizontal flex row
- If the user has fewer than 5 favorites, renders an `[+ Add]` button as the last item
- When the `[+ Add]` button is clicked, opens an `AddFavoriteModal` (a dialog that lets the user pick a project, task, and optional description)
- Collapses to a horizontal scroll on mobile (< 640px breakpoint)
- Hidden entirely when the favorites list is empty and replaced by an empty state prompt
- Hidden when loading (shows skeleton placeholders)

**Props:** None (reads from Redux store).

**Empty state:** When the user has no favorites, display a subtle prompt:
> "Pin your most-used timers here for one-click start. Star a recent entry or click [+ Add Favorite] to get started."

#### FavoriteCard

An individual card within the `FavoritesBar`.

**Location:** `packages/ui/src/components/FavoriteCard.tsx`

**Props:**
```typescript
interface FavoriteCardProps {
  favorite: Favorite;
  onStart: (favorite: Favorite) => void;
  onRemove: (id: string) => void;
  disabled?: boolean; // true when a timer is already running
}
```

**Visual design:**
- Compact card with `min-w-[160px] max-w-[200px]`
- Left border accent using the project's `color` (4px solid border-left)
- First line: project name (bold, truncated)
- Second line: task name (gray, truncated) -- omitted if no task
- Third line: description preview (light gray, truncated to ~25 chars) -- omitted if no description
- Play button (green `PlayIcon` from `@heroicons/react/24/solid`) on the right side
- Small `XMarkIcon` button in the top-right corner (visible on hover, always visible on mobile) for removal
- Entire card (except the X button) is clickable to start the timer
- `opacity-50 cursor-not-allowed` when `disabled` is true (timer already running)
- Hover: `shadow-md` transition
- Tailwind classes: `card p-3 border-l-4 flex flex-col cursor-pointer hover:shadow-md transition-shadow`

#### FavoriteButton (Star Toggle)

A toggle button that appears on time entry rows. Lets users quickly add/remove a favorite based on an entry's project+task+description combo.

**Location:** `packages/ui/src/components/FavoriteButton.tsx`

**Props:**
```typescript
interface FavoriteButtonProps {
  projectId: string;
  taskId?: string | null;
  description?: string | null;
}
```

**Behavior:**
- Reads `state.favorites.favorites` from Redux
- Computes whether a matching favorite already exists by comparing `projectId`, `taskId`, and `description` (normalizing `null`/`undefined`/`""` to `undefined` for comparison)
- Renders a `StarIcon` from `@heroicons/react/24/outline` (unfavorited) or `@heroicons/react/24/solid` (favorited) with a filled yellow color
- On click:
  - If not favorited: dispatches `createFavorite({ projectId, taskId, description })`
  - If favorited: dispatches `deleteFavorite(matchingFavorite.id)`
- Disables the button during the pending thunk to prevent double-clicks
- Enforces the 5-favorite limit client-side: if already at 5 favorites, shows a tooltip "Maximum 5 favorites reached" and disables the star button for non-favorited entries
- Size: `h-5 w-5` with a `p-1` click target

**Placement:**
- Dashboard recent entries list: next to the existing play button on each entry row
- Time entries page: in the actions column of each row (if applicable)
- Timer card: shown briefly after stopping a timer (alongside the ResumeLastTimer display)

#### AddFavoriteModal

A modal dialog for manually creating a favorite (without starring an existing entry).

**Location:** `packages/ui/src/components/AddFavoriteModal.tsx`

**UI:**
- Project dropdown (required, filtered to active projects only)
- Task dropdown (optional, filtered to tasks of the selected project)
- Description text input (optional, max 200 chars)
- [Cancel] and [Save] buttons
- Error display for duplicate/limit violations

---

## UI Mockups

### 1. Dashboard with FavoritesBar (3 favorites + add button)

```
┌────────────────────────────────────────────────────────────────────┐
│  Dashboard                                                         │
│  Track your time and monitor earnings                              │
├────────────────────────┬───────────────────────────────────────────┤
│  Time Tracker          │  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  ┌────────────────┐    │  │  Today   │ │ This Week│ │ Earning  │  │
│  │   00:00:00     │    │  │  $45.00  │ │  $320.00 │ │ Now      │  │
│  │                │    │  │          │ │          │ │ $12.50   │  │
│  │  [Project v]   │    │  └──────────┘ └──────────┘ └──────────┘  │
│  │  [Task    v]   │    │                                           │
│  │  [Desc......] │    │                                           │
│  │                │    │                                           │
│  │  [ > Start ]   │    │                                           │
│  │                │    │                                           │
│  │  Resume: Last  │    │                                           │
│  └────────────────┘    │                                           │
├────────────────────────┴───────────────────────────────────────────┤
│                                                                    │
│  Favorites                                                         │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐    │
│  │▌ Acme Corp     > │ │▌ Internal      > │ │▌ Freelance     > │ ┌─┐│
│  │  Meetings        │ │  Code Review     │ │  API work        │ │+││
│  │  "Daily stand.." │ │                  │ │  "Backend de.."  │ └─┘│
│  └──────────────────┘ └──────────────────┘ └──────────────────┘    │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│  Recent Time Entries                                               │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ * Acme Corp  Meetings  "Daily standup"  0:30:00  $15.00 > │    │
│  │ * Internal   Code Review                1:15:00  $62.50 > │    │
│  │ * Freelance  API work   "Backend de.."  2:00:00  $90.00 > │    │
│  │ * Acme Corp  Design     "Logo revisi.." 0:45:00  $22.50 > │    │
│  │   Personal   Learning                   0:30:00   $0.00 > │    │
│  └────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘

Legend: ▌ = project color accent bar, > = play button, * = filled star, + = add button
```

### 2. FavoriteCard Detail

```
┌─────────────────────────────┐
│▌                          x │   x = remove button (visible on hover)
│▌  Acme Corp             [>]│   ▌ = 4px left border in project color
│▌  Meetings                 │   [>] = green play button
│▌  "Daily standup notes"    │
│▌                            │
└─────────────────────────────┘
  ├─ 160px min / 200px max ─┤

Anatomy:
  ┌─────────────────────────────┐
  │▌ [XMarkIcon]              │  <- top-right, opacity-0 group-hover:opacity-100
  │▌ Project Name (font-medium)│  <- text-gray-900, truncate
  │▌ Task Name                 │  <- text-sm text-gray-500, truncate
  │▌ "Description..."     [>] │  <- text-xs text-gray-400, truncate
  └─────────────────────────────┘
```

### 3. Star Toggle on a Time Entry Row

```
Before (not favorited):
┌──────────────────────────────────────────────────────────────────┐
│  o  Acme Corp  Meetings  "Daily standup"   0:30:00  $15.00  [>] │
└──────────────────────────────────────────────────────────────────┘
   ^                                                            ^
   |                                                            |
   Outline star (StarIcon outline)                     Play button

After (favorited):
┌──────────────────────────────────────────────────────────────────┐
│  *  Acme Corp  Meetings  "Daily standup"   0:30:00  $15.00  [>] │
└──────────────────────────────────────────────────────────────────┘
   ^
   |
   Filled yellow star (StarIcon solid, text-yellow-400)
```

### 4. Mobile Responsive Layout (favorites as horizontal scroll)

```
┌──────────────────────────┐
│  Dashboard               │
│  Track your time and...  │
├──────────────────────────┤
│  Time Tracker            │
│  ┌──────────────────┐   │
│  │     00:00:00      │   │
│  │  [ > Start ]      │   │
│  └──────────────────┘   │
├──────────────────────────┤
│  Today     This Week     │
│  $45.00    $320.00       │
├──────────────────────────┤
│  Favorites          >>>  │  <- ">>>" indicates horizontal scroll
│  ┌─────────┐┌─────────┐ │
│  │▌Acme   >││▌Intern >│ │  <- Cards scroll horizontally
│  │ Meetings ││ Code R. │~│  <- ~ indicates more cards off-screen
│  └─────────┘└─────────┘ │
├──────────────────────────┤
│  Recent Time Entries     │
│  ...                     │
└──────────────────────────┘
```

### 5. Empty State (no favorites)

```
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Favorites                                                         │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                                                            │    │
│  │       Pin your most-used timers for one-click start.       │    │
│  │                                                            │    │
│  │    Star a recent entry below, or add one manually:         │    │
│  │                                                            │    │
│  │              [ + Add Favorite ]                            │    │
│  │                                                            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
```

---

## Implementation Plan

### Step 1: Prisma Schema and Migration

1. Edit `packages/api/prisma/schema.prisma`:
   - Add the `Favorite` model (see schema above)
   - Add `favorites Favorite[]` relation to `User`, `Project`, and `Task` models
2. Generate and apply migration:
   ```bash
   cd packages/api
   npx prisma migrate dev --name add_favorites
   ```
3. Apply in Docker:
   ```bash
   npm run migrate
   docker exec timetrack-api npm run db:generate
   docker restart timetrack-api
   ```

### Step 2: Shared Types

4. Add `Favorite`, `CreateFavoriteRequest`, `UpdateFavoriteRequest`, and `ReorderFavoritesRequest` interfaces to `packages/shared/src/types/index.ts`
5. Rebuild shared package: `npm run build:shared`

### Step 3: API Routes

6. Create `packages/api/src/routes/favorites.ts` with all five endpoints (GET, POST, DELETE, PUT /:id, PUT /reorder)
7. Register the route in `packages/api/src/server.ts`:
   ```typescript
   import favoriteRoutes from "./routes/favorites";
   // ...
   app.use("/favorites", favoriteRoutes);
   ```

### Step 4: API Client

8. Add `favorites` section to `packages/ui/src/services/api.ts` (the `APIClient` class):
   ```typescript
   favorites = {
     getFavorites: async () => { ... },
     createFavorite: async (data) => { ... },
     deleteFavorite: async (id) => { ... },
     updateFavorite: async (id, data) => { ... },
     reorderFavorites: async (orderedIds) => { ... },
   };
   ```
   Export `favoritesAPI` alongside existing exports.

### Step 5: Redux Slice

9. Create `packages/ui/src/store/slices/favoritesSlice.ts` (see full implementation above)
10. Register in `packages/ui/src/store/index.ts`:
    ```typescript
    import favoritesSlice from "./slices/favoritesSlice";
    // ...
    reducer: {
      // ... existing slices
      favorites: favoritesSlice,
    },
    ```

### Step 6: Socket.IO Integration

11. Add favorite events to the `SocketEventHandlers` interface and `setupEventListeners` method in `packages/ui/src/services/socket.ts`:
    ```typescript
    // In SocketEventHandlers interface:
    onFavoriteCreated?: EventCallback<Favorite>;
    onFavoriteDeleted?: EventCallback<{ id: string }>;
    onFavoriteUpdated?: EventCallback<Favorite>;
    onFavoritesReordered?: EventCallback<Favorite[]>;
    ```
12. Wire up Socket.IO handlers to dispatch Redux actions in the `useSocket` hook (`packages/ui/src/hooks/useSocket.ts`) or wherever Socket.IO event handlers are connected to the Redux store:
    ```typescript
    onFavoriteCreated: (data) => dispatch(favoriteCreatedFromSocket(data)),
    onFavoriteDeleted: (data) => dispatch(favoriteDeletedFromSocket(data)),
    onFavoriteUpdated: (data) => dispatch(favoriteUpdatedFromSocket(data)),
    onFavoritesReordered: (data) => dispatch(favoritesReorderedFromSocket(data)),
    ```

### Step 7: UI Components

13. Create `packages/ui/src/components/FavoriteCard.tsx`
14. Create `packages/ui/src/components/FavoriteButton.tsx`
15. Create `packages/ui/src/components/FavoritesBar.tsx`
16. Create `packages/ui/src/components/AddFavoriteModal.tsx`

### Step 8: Dashboard Integration

17. Import and render `FavoritesBar` in `packages/ui/src/pages/Dashboard.tsx` between the Timer/Earnings grid and the "Recent Time Entries" section:
    ```tsx
    {/* Favorites Bar */}
    <FavoritesBar />

    {/* Recent Time Entries */}
    <div className="card">
    ```
18. Add `FavoriteButton` to each entry row in the Dashboard's recent time entries list (next to the existing play button)
19. Dispatch `fetchFavorites()` in the Dashboard `useEffect`

### Step 9: Testing

20. Write API endpoint tests
21. Write Redux slice tests
22. Write component render tests

---

## Files to Create / Modify

### New Files

| File | Description |
|------|-------------|
| `packages/api/src/routes/favorites.ts` | Express router with GET, POST, PUT, DELETE endpoints for favorites CRUD and reordering |
| `packages/api/prisma/migrations/YYYYMMDD_add_favorites/migration.sql` | Auto-generated by `prisma migrate dev` |
| `packages/ui/src/store/slices/favoritesSlice.ts` | Redux Toolkit slice with state, thunks, and socket reducers |
| `packages/ui/src/components/FavoritesBar.tsx` | Horizontal bar of favorite cards for Dashboard |
| `packages/ui/src/components/FavoriteCard.tsx` | Individual favorite card with play/remove actions |
| `packages/ui/src/components/FavoriteButton.tsx` | Star toggle button for entries |
| `packages/ui/src/components/AddFavoriteModal.tsx` | Modal for manually creating a favorite |
| `packages/ui/src/components/__tests__/FavoritesBar.test.tsx` | Tests for FavoritesBar rendering and interactions |
| `packages/ui/src/components/__tests__/FavoriteButton.test.tsx` | Tests for star toggle behavior |
| `packages/api/src/__tests__/favorites.test.ts` | API endpoint tests |

### Modified Files

| File | Changes |
|------|---------|
| `packages/api/prisma/schema.prisma` | Add `Favorite` model; add `favorites Favorite[]` to `User`, `Project`, `Task` models |
| `packages/api/src/server.ts` | Import and register `favoriteRoutes` at `/favorites` |
| `packages/shared/src/types/index.ts` | Add `Favorite`, `CreateFavoriteRequest`, `UpdateFavoriteRequest`, `ReorderFavoritesRequest` types |
| `packages/ui/src/services/api.ts` | Add `favorites` section to `APIClient` class; export `favoritesAPI` |
| `packages/ui/src/services/socket.ts` | Add favorite event types to `SocketEventHandlers`; add socket listeners in `setupEventListeners` |
| `packages/ui/src/store/index.ts` | Import and register `favoritesSlice` reducer |
| `packages/ui/src/pages/Dashboard.tsx` | Import `FavoritesBar`; render between earnings and recent entries; add `FavoriteButton` to entry rows; dispatch `fetchFavorites` on mount |
| `packages/ui/src/hooks/useSocket.ts` | Wire favorite socket events to Redux dispatch calls |

---

## Database Migration

The migration will be auto-generated by Prisma. The expected SQL is:

```sql
-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favorites_userId_idx" ON "favorites"("userId");

-- CreateIndex
CREATE INDEX "favorites_userId_display_order_idx" ON "favorites"("userId", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_projectId_taskId_description_key"
    ON "favorites"("userId", "projectId", "taskId", "description");

-- AddForeignKey
ALTER TABLE "favorites"
    ADD CONSTRAINT "favorites_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites"
    ADD CONSTRAINT "favorites_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites"
    ADD CONSTRAINT "favorites_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
```

**Commands to run:**

```bash
# 1. Generate migration (local dev)
cd packages/api
npx prisma migrate dev --name add_favorites

# 2. Apply in Docker
npm run migrate

# 3. Regenerate Prisma client in Docker
docker exec timetrack-api npm run db:generate
docker restart timetrack-api

# 4. Verify table was created
docker exec timetrack-postgres psql -U timetrack_user -d timetrack_db -c "\d favorites"
```

---

## Edge Cases and Considerations

### 1. Favorited project is deleted or deactivated

**Deleted:** The `onDelete: Cascade` foreign key constraint automatically removes any favorites pointing to the deleted project. The client receives a `project-deleted` socket event and should also dispatch `fetchFavorites()` to refresh the favorites list. Alternatively, the client can optimistically filter out favorites whose `projectId` matches the deleted project.

**Deactivated (isActive = false):** The favorite remains in the database. The `FavoriteCard` should check whether the associated project is still active before allowing a timer start. If the project is inactive:
- Show the card with reduced opacity and a visual indicator (e.g., strikethrough project name)
- Disable the play button with tooltip: "Project is archived"
- Show a small warning icon

### 2. Favorited task is completed or deleted

**Deleted:** Same as project deletion -- `onDelete: Cascade` removes the favorite automatically.

**Completed (isCompleted = true):** The favorite remains. The `FavoriteCard` should still allow starting a timer for a completed task (the user may want to log more time). However, the card should show a subtle indicator (e.g., checkmark icon next to task name) so the user knows the task is marked complete.

### 3. Duplicate favorites

The `@@unique([userId, projectId, taskId, description])` constraint prevents exact duplicates at the database level. The API route should catch Prisma's unique constraint violation (`P2002`) and return a `409 Conflict` with a human-readable message: "This project/task/description combination is already a favorite."

**Normalization:** Before checking for duplicates, normalize the description:
- `null`, `undefined`, and `""` (empty string) should all be treated as `null` before inserting
- Trim whitespace from descriptions

**PostgreSQL null uniqueness caveat:** In PostgreSQL, `NULL` values are considered distinct in unique indexes. This means two rows with `(userId, projectId, NULL, NULL)` would NOT violate the unique constraint. To handle this, the API should perform an explicit check before inserting:
```typescript
const existing = await prisma.favorite.findFirst({
  where: {
    userId: req.user!.id,
    projectId,
    taskId: taskId || null,
    description: normalizedDescription || null,
  },
});
if (existing) {
  throw createError("This combination is already a favorite", 409);
}
```

### 4. Maximum favorites limit (5)

**Server-side enforcement:** The `POST /favorites` endpoint must check `count` before inserting:
```typescript
const count = await prisma.favorite.count({
  where: { userId: req.user!.id },
});
if (count >= 5) {
  throw createError("Maximum of 5 favorites allowed. Remove one to add a new favorite.", 400);
}
```

**Client-side enforcement:** The `FavoritesBar` hides the `[+ Add]` button when 5 favorites exist. The `FavoriteButton` disables the star action for non-favorited entries when the user already has 5 favorites.

The limit of 5 is chosen to ensure the favorites bar fits on a single row on desktop without scrolling and remains visually clean. The constant should be defined in a shared config so it can be adjusted later:
```typescript
// packages/shared/src/constants.ts (or inline in the route)
export const MAX_FAVORITES = 5;
```

### 5. Cross-device sync via Socket.IO

All CRUD operations on favorites emit socket events to the user's room (`user-{userId}`). The client listens for these events and updates the Redux store accordingly. This ensures:
- Adding a favorite on desktop immediately appears on mobile
- Removing a favorite from one device removes it from all devices
- Reordering is reflected everywhere

### 6. Favorite ordering persistence

`displayOrder` is stored as an integer in the database. When a new favorite is added, it gets `max(displayOrder) + 1`. When favorites are reordered via the `PUT /favorites/reorder` endpoint, all `displayOrder` values are reassigned atomically in a Prisma transaction. The client always sorts by `displayOrder` ascending when rendering.

### 7. Starting a timer from a favorite when a timer is already running

The play button on each `FavoriteCard` should be disabled when `isRunning` is true (from the `useTimer` hook). The UI should show a tooltip: "Stop the current timer first." This is consistent with the existing behavior where the API rejects `POST /time-entries/start` if a timer is already running.

### 8. Race condition on favorite creation

Two rapid clicks on the star button could dispatch `createFavorite` twice. Mitigations:
- Disable the button during the pending thunk (`loading` state)
- The `@@unique` constraint prevents the duplicate from being inserted
- The API returns `409`, which the thunk handles gracefully

### 9. Large description text

Descriptions are capped at 200 characters both in the Zod validation schema and in the `AddFavoriteModal` input field (`maxLength={200}`). The `FavoriteCard` truncates display to ~25 characters with an ellipsis.

---

## Testing Plan

### API Endpoint Tests (`packages/api/src/__tests__/favorites.test.ts`)

| Test | Description |
|------|-------------|
| `GET /favorites` returns empty array for new user | Verify baseline state |
| `GET /favorites` returns favorites ordered by displayOrder | Create 3 favorites, verify order |
| `POST /favorites` creates a favorite with project only | Minimal valid payload |
| `POST /favorites` creates a favorite with project + task + description | Full payload |
| `POST /favorites` rejects when project does not exist | 404 error |
| `POST /favorites` rejects when project belongs to another user | 404 error |
| `POST /favorites` rejects when task does not exist | 404 error |
| `POST /favorites` rejects duplicate project+task+description | 409 error |
| `POST /favorites` rejects when limit (5) is reached | 400 error |
| `POST /favorites` auto-assigns displayOrder | Verify incrementing order |
| `DELETE /favorites/:id` removes a favorite | Verify deletion and response |
| `DELETE /favorites/:id` returns 404 for nonexistent favorite | Error handling |
| `DELETE /favorites/:id` returns 404 for another user's favorite | Auth isolation |
| `PUT /favorites/:id` updates description | Verify change persists |
| `PUT /favorites/:id` updates displayOrder | Verify change persists |
| `PUT /favorites/reorder` reorders all favorites | Verify new order |
| `PUT /favorites/reorder` rejects mismatched IDs | 400 error |
| Cascading delete: favorite removed when project deleted | Relational integrity |
| Cascading delete: favorite removed when task deleted | Relational integrity |

### Redux Slice Tests

| Test | Description |
|------|-------------|
| Initial state is correct | Empty favorites, loading false, error null |
| `fetchFavorites.fulfilled` populates favorites | State update |
| `createFavorite.fulfilled` adds to array and sorts | Ordering |
| `deleteFavorite.fulfilled` removes from array | Filtering |
| `favoriteCreatedFromSocket` adds without duplicating | Idempotency |
| `favoriteDeletedFromSocket` removes correctly | State update |
| `favoritesReorderedFromSocket` replaces array | Full replacement |

### Component Tests

| Test | Component | Description |
|------|-----------|-------------|
| Renders empty state when no favorites | `FavoritesBar` | Shows prompt text and add button |
| Renders favorite cards | `FavoritesBar` | Correct number of cards with project names |
| Hides add button at 5 favorites | `FavoritesBar` | Max limit enforcement |
| Calls onStart when play clicked | `FavoriteCard` | Timer start integration |
| Calls onRemove when X clicked | `FavoriteCard` | Removal integration |
| Shows disabled state when timer running | `FavoriteCard` | Visual and interaction feedback |
| Shows outline star for non-favorited entry | `FavoriteButton` | Correct icon variant |
| Shows filled star for favorited entry | `FavoriteButton` | Correct icon variant |
| Dispatches createFavorite on click (not favorited) | `FavoriteButton` | Redux integration |
| Dispatches deleteFavorite on click (favorited) | `FavoriteButton` | Redux integration |
| Disables star when at 5 favorites (not favorited) | `FavoriteButton` | Limit enforcement |

### Manual Testing Checklist

- [ ] Create a favorite from the [+ Add] button and verify it appears in the bar
- [ ] Star a recent time entry and verify the favorite appears in the bar
- [ ] Unstar a recent time entry and verify the favorite is removed from the bar
- [ ] Click play on a favorite card and verify the timer starts with the correct project/task/description
- [ ] Verify the play button is disabled on all favorite cards when a timer is running
- [ ] Remove a favorite via the X button and verify it disappears
- [ ] Create 5 favorites and verify the [+ Add] button disappears
- [ ] Create 5 favorites and verify the star button is disabled for non-favorited entries
- [ ] Delete a favorited project and verify the favorite is automatically removed
- [ ] Delete a favorited task and verify the favorite is automatically removed
- [ ] Deactivate a favorited project and verify the card shows a disabled/archived state
- [ ] Open the app on two devices/tabs and verify favorites sync in real-time
- [ ] Test on mobile viewport: verify favorites scroll horizontally
- [ ] Test the empty state appearance for a user with no favorites
- [ ] Attempt to create a duplicate favorite and verify the error message
- [ ] Verify that the star toggle correctly identifies matching favorites (same project+task+description)

---

## Future Enhancements

These are out of scope for the initial implementation but worth considering for follow-up iterations:

1. **Drag-to-reorder favorites** -- Add `@dnd-kit/core` or `react-beautiful-dnd` for drag-and-drop reordering within the FavoritesBar. The `PUT /favorites/reorder` endpoint is already designed to support this.

2. **Favorite usage analytics** -- Track how often each favorite is used to start a timer. Add a `usageCount` column and `lastUsedAt` timestamp to the `Favorite` model. Surface this in a tooltip or sort favorites by most-used.

3. **Auto-suggest favorites based on frequency** -- Analyze the user's time entry history to identify the top 5 most-used project/task/description combos that are not already favorited. Show a subtle "Suggested favorites" section below the FavoritesBar.

4. **Favorite folders/groups** -- Allow users to group favorites by category (e.g., "Client Work", "Internal", "Personal"). This would require a `FavoriteGroup` model and a more complex UI.

5. **Keyboard shortcuts to start favorite N (1-5)** -- Bind `Ctrl+1` through `Ctrl+5` (or `Cmd+1`-`Cmd+5` on macOS) to start the timer for the Nth favorite. Register shortcuts globally using a keyboard event listener on the document.

6. **Native app support** -- Extend the favorites feature to the macOS SwiftUI app (`packages/mac-app/`) and iOS app (`packages/ios-app/`). The API and Socket.IO infrastructure are already cross-platform. The native apps would need new SwiftUI views and CoreData/UserDefaults caching for offline access.

7. **Favorite templates with time estimates** -- Allow favorites to include an estimated duration. When starting from a favorite, optionally show a countdown or progress indicator against the estimate.

8. **Bulk favorite management** -- A settings page where users can view all favorites in a table, edit descriptions, reorder with drag-and-drop, and bulk delete.

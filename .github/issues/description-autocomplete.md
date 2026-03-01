# Feature: Description Autocomplete from Recent Time Entries

## Summary

The description input field in the timer form (`Timer.tsx`) and edit modal (`EditTimeEntryModal.tsx`) is a plain text input with no autocomplete capability. Users who track time throughout the day typically reuse the same 5-10 descriptions repeatedly (e.g., "Code review", "Sprint planning", "Bug fix - auth module", "Client sync call"). Every single time, they retype these descriptions from scratch.

This feature adds a dropdown autocomplete to the description field that suggests descriptions from the user's history, ranked by frequency and recency. Typing even 2-3 characters should surface the right suggestion, cutting the typical 20-40 keystrokes per entry down to 3-5 keystrokes plus a selection. For a user who starts 10-15 timers per day, this eliminates hundreds of unnecessary keystrokes and enforces consistent naming (no more "code review" vs "Code Review" vs "CR" drift).

---

## Motivation / User Stories

**US-1: Quick entry from history.**
As a developer who tracks 10+ time entries per day, I want to see suggestions from my recent entries as I type in the description field, so I can select a previous description instead of retyping it from memory.

**US-2: Context-aware filtering.**
As a user who works on multiple projects, I want suggestions to be filtered by my currently selected project (when one is selected), so I see the most relevant descriptions first rather than descriptions from unrelated projects.

**US-3: Keyboard-driven workflow.**
As a power user, I want to navigate the suggestion dropdown entirely with the keyboard (arrow keys to move, Enter/Tab to select, Escape to dismiss), so I never have to reach for the mouse during timer entry.

**US-4: Consistent naming.**
As a team lead reviewing time reports, I want my team to reuse exact description strings rather than creating slight variations, so that time reports group cleanly by description without manual normalization.

**US-5: Edit modal autocomplete.**
As a user editing a past time entry, I want the same autocomplete in the edit modal, so I can correct a description to match an existing one without remembering the exact wording.

---

## Detailed Design

### Phase 1: Client-Side Only (MVP)

The simplest approach requires zero backend changes. Extract unique descriptions from the time entries already present in the Redux store and filter them locally as the user types.

**How it works:**
1. Read `state.timeEntries.entries` from the Redux store.
2. Extract unique non-empty `description` values.
3. As the user types, filter descriptions that contain the typed substring (case-insensitive).
4. Display matching suggestions in a dropdown below the input.

**Implementation sketch (hook):**

```typescript
// packages/ui/src/hooks/useAutocompleteSuggestions.ts (Phase 1)
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";

export function useAutocompleteSuggestions(query: string, projectId?: string) {
  const entries = useSelector((state: RootState) => state.timeEntries.entries);

  const suggestions = useMemo(() => {
    if (!query || query.length < 2) return [];

    const lowerQuery = query.toLowerCase();
    const descriptionMap = new Map<string, { count: number; lastUsed: string; project?: { id: string; name: string; color?: string }; task?: { id: string; name: string } }>();

    for (const entry of entries) {
      if (!entry.description) continue;

      // If projectId filter is active, prioritize matching project entries
      const key = entry.description.toLowerCase();
      const existing = descriptionMap.get(key);

      if (!existing) {
        descriptionMap.set(key, {
          count: 1,
          lastUsed: entry.startTime,
          project: entry.project,
          task: entry.task,
        });
      } else {
        existing.count++;
        if (entry.startTime > existing.lastUsed) {
          existing.lastUsed = entry.startTime;
          existing.project = entry.project;
          existing.task = entry.task;
        }
      }
    }

    return Array.from(descriptionMap.entries())
      .filter(([desc]) => desc.includes(lowerQuery))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([_, data]) => ({
        description: data.project ? entries.find(e => e.description?.toLowerCase() === _ )?.description || _ : _,
        frequency: data.count,
        lastUsed: data.lastUsed,
        project: data.project,
        task: data.task,
      }));
  }, [query, entries, projectId]);

  return { suggestions, loading: false };
}
```

**Limitation: This approach is fundamentally insufficient.**

The Redux store contains at most the current page of entries:
- **Dashboard** (`Timer.tsx`): fetches `{ limit: 10 }` — only 10 recent entries in `state.timeEntries.entries`.
- **Time Entries page**: fetches with pagination and date/project filters — data is scoped to the current view.
- Navigating between pages replaces `state.timeEntries.entries` entirely (the slice's `fetchTimeEntries.fulfilled` reducer sets `state.entries = response.entries`).

This means suggestions would be limited to at most 10 descriptions on the dashboard, and would change unpredictably as the user navigates. A user with 500 unique descriptions over 6 months would only ever see suggestions from their last 10 entries.

**Verdict:** Phase 1 is acceptable as a quick first iteration to ship the UI component and keyboard interaction, but Phase 2 is necessary for a useful product.

---

### Phase 2: Server-Side Suggestions Endpoint (Recommended)

Add a dedicated API endpoint that queries the full `time_entries` table for unique descriptions matching the user's input.

#### Endpoint Design

```
GET /time-entries/suggestions?q=<query>&projectId=<optional>&limit=10
```

| Parameter   | Type   | Required | Default | Description                                      |
|-------------|--------|----------|---------|--------------------------------------------------|
| `q`         | string | Yes      | —       | Search query (minimum 1 character)               |
| `projectId` | string | No       | —       | Filter/prioritize suggestions from this project  |
| `limit`     | number | No       | 10      | Max suggestions to return (capped at 20)         |

**Response shape:**

```json
{
  "suggestions": [
    {
      "description": "Code review - PR #142",
      "frequency": 12,
      "lastUsed": "2026-02-28T16:30:00.000Z",
      "project": { "id": "clx...", "name": "TimeTrack", "color": "#3B82F6" },
      "task": { "id": "clx...", "name": "Reviews" }
    },
    {
      "description": "Code cleanup and refactoring",
      "frequency": 5,
      "lastUsed": "2026-02-27T10:00:00.000Z",
      "project": { "id": "clx...", "name": "TimeTrack", "color": "#3B82F6" },
      "task": null
    }
  ]
}
```

#### Express Route Handler

Add this route **before** the `/:id` routes in `packages/api/src/routes/timeEntries.ts` (to avoid `suggestions` being captured as an `:id` parameter):

```typescript
// packages/api/src/routes/timeEntries.ts

const suggestionsQuerySchema = z.object({
  q: z.string().min(1).max(200),
  projectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

/**
 * @swagger
 * /time-entries/suggestions:
 *   get:
 *     summary: Get autocomplete suggestions for time entry descriptions
 *     tags: [Time Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query for description matching
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Optional project ID to prioritize suggestions from
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 20
 *         description: Maximum number of suggestions
 *     responses:
 *       200:
 *         description: Suggestions retrieved successfully
 */
router.get(
  "/suggestions",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { q, projectId, limit } = suggestionsQuerySchema.parse(req.query);

    const userId = req.user!.id;

    // Use raw query for GROUP BY with aggregation — Prisma doesn't support
    // DISTINCT + COUNT + MAX in a single findMany call.
    const suggestions = await prisma.$queryRaw`
      SELECT
        te.description,
        COUNT(*)::int AS frequency,
        MAX(te."startTime") AS "lastUsed",
        -- Get the project/task from the most recent entry with this description
        (
          SELECT jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'color', p.color
          )
          FROM time_entries te2
          LEFT JOIN projects p ON p.id = te2."projectId"
          WHERE te2."userId" = ${userId}
            AND te2.description = te.description
            AND te2."projectId" IS NOT NULL
          ORDER BY te2."startTime" DESC
          LIMIT 1
        ) AS project,
        (
          SELECT jsonb_build_object(
            'id', t.id,
            'name', t.name
          )
          FROM time_entries te3
          LEFT JOIN tasks t ON t.id = te3."taskId"
          WHERE te3."userId" = ${userId}
            AND te3.description = te.description
            AND te3."taskId" IS NOT NULL
          ORDER BY te3."startTime" DESC
          LIMIT 1
        ) AS task,
        -- Score: prioritize matching project, then frequency, then recency
        CASE WHEN ${projectId ?? null}::text IS NOT NULL
             AND te."projectId" = ${projectId ?? null}
             THEN 1 ELSE 0
        END AS "projectMatch"
      FROM time_entries te
      WHERE te."userId" = ${userId}
        AND te.description IS NOT NULL
        AND te.description != ''
        AND te.description ILIKE ${'%' + q + '%'}
      GROUP BY te.description, te."projectId"
      ORDER BY
        MAX(CASE WHEN ${projectId ?? null}::text IS NOT NULL
                  AND te."projectId" = ${projectId ?? null}
                  THEN 1 ELSE 0 END) DESC,
        COUNT(*) DESC,
        MAX(te."startTime") DESC
      LIMIT ${limit}
    `;

    // De-duplicate descriptions that appeared in multiple projects
    const seen = new Set<string>();
    const deduplicated = [];
    for (const row of suggestions as any[]) {
      const lower = row.description.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      deduplicated.push({
        description: row.description,
        frequency: row.frequency,
        lastUsed: row.lastUsed,
        project: row.project || null,
        task: row.task || null,
      });
    }

    res.json({ suggestions: deduplicated });
  })
);
```

**Alternative: Simpler Prisma-only approach** (if you want to avoid raw SQL):

```typescript
router.get(
  "/suggestions",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { q, projectId, limit } = suggestionsQuerySchema.parse(req.query);

    const userId = req.user!.id;

    // Fetch recent entries matching the query
    const matchingEntries = await prisma.timeEntry.findMany({
      where: {
        userId,
        description: {
          not: null,
          contains: q,
          mode: "insensitive",
        },
      },
      select: {
        description: true,
        startTime: true,
        project: { select: { id: true, name: true, color: true } },
        task: { select: { id: true, name: true } },
        projectId: true,
      },
      orderBy: { startTime: "desc" },
      take: 200, // Fetch enough to get good frequency data
    });

    // Aggregate client-side
    const descMap = new Map<string, {
      description: string;
      frequency: number;
      lastUsed: Date;
      project: { id: string; name: string; color: string } | null;
      task: { id: string; name: string } | null;
      projectMatch: boolean;
    }>();

    for (const entry of matchingEntries) {
      if (!entry.description) continue;
      const key = entry.description.toLowerCase();
      const existing = descMap.get(key);
      const isProjectMatch = projectId ? entry.projectId === projectId : false;

      if (!existing) {
        descMap.set(key, {
          description: entry.description,
          frequency: 1,
          lastUsed: entry.startTime,
          project: entry.project || null,
          task: entry.task || null,
          projectMatch: isProjectMatch,
        });
      } else {
        existing.frequency++;
        if (isProjectMatch) existing.projectMatch = true;
        if (entry.startTime > existing.lastUsed) {
          existing.lastUsed = entry.startTime;
          existing.project = entry.project || existing.project;
          existing.task = entry.task || existing.task;
        }
      }
    }

    const suggestions = Array.from(descMap.values())
      .sort((a, b) => {
        // Project match first, then frequency, then recency
        if (a.projectMatch !== b.projectMatch) return a.projectMatch ? -1 : 1;
        if (a.frequency !== b.frequency) return b.frequency - a.frequency;
        return b.lastUsed.getTime() - a.lastUsed.getTime();
      })
      .slice(0, limit);

    res.json({ suggestions });
  })
);
```

#### Database Index

The `time_entries` table should have an index to support efficient `ILIKE` queries on `description`. Add via a Prisma migration:

```prisma
// In schema.prisma, add to the TimeEntry model:
@@index([userId, description])
```

For full-text search performance on very large tables (100k+ entries), consider a PostgreSQL `pg_trgm` GIN index in a raw migration:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_time_entries_description_trgm
  ON time_entries USING gin (description gin_trgm_ops);
```

---

### Autocomplete Component Architecture

#### `AutocompleteInput` Component

A reusable, accessible autocomplete input that can replace any plain text input or textarea.

```
packages/ui/src/components/AutocompleteInput.tsx
```

**Internal state:**
- `isOpen: boolean` — whether the dropdown is visible
- `highlightedIndex: number` — currently highlighted suggestion (-1 = none)
- `localQuery: string` — debounced query value sent to the hook

**Behavioral contract:**
1. Dropdown opens when: user types 2+ characters AND there are suggestions.
2. Dropdown closes when: user clicks outside, presses Escape, selects a suggestion, or clears input.
3. `Enter` key:
   - If dropdown is open AND a suggestion is highlighted: select that suggestion, close dropdown, do NOT start the timer.
   - If dropdown is closed OR no suggestion is highlighted: propagate the Enter event normally (existing behavior: start timer).
4. `Tab` key: if a suggestion is highlighted, accept it and close. Otherwise, normal tab behavior.
5. Mouse click on suggestion: select it, close dropdown, refocus input.

---

### Hook: `useAutocompleteSuggestions`

```
packages/ui/src/hooks/useAutocompleteSuggestions.ts
```

```typescript
import { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import api from "../services/api";

export interface Suggestion {
  description: string;
  frequency: number;
  lastUsed: string;
  project: { id: string; name: string; color?: string } | null;
  task: { id: string; name: string } | null;
}

interface UseAutocompleteSuggestionsOptions {
  query: string;
  projectId?: string;
  enabled?: boolean;          // default true
  debounceMs?: number;        // default 200
  minQueryLength?: number;    // default 2
}

interface UseAutocompleteSuggestionsReturn {
  suggestions: Suggestion[];
  loading: boolean;
  error: string | null;
}

export function useAutocompleteSuggestions(
  options: UseAutocompleteSuggestionsOptions
): UseAutocompleteSuggestionsReturn {
  const {
    query,
    projectId,
    enabled = true,
    debounceMs = 200,
    minQueryLength = 2,
  } = options;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Phase 1 fallback: client-side filtering from Redux store ---
  const entries = useSelector((state: RootState) => state.timeEntries.entries);

  useEffect(() => {
    if (!enabled || query.length < minQueryLength) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        // Phase 2: Call API endpoint
        const params = new URLSearchParams({ q: query, limit: "10" });
        if (projectId) params.append("projectId", projectId);

        const response = await api.timeEntries.getSuggestions({
          q: query,
          projectId,
          limit: 10,
        });

        if (!controller.signal.aborted) {
          setSuggestions(response.suggestions);
        }
      } catch (err: any) {
        if (err.name === "CanceledError" || err.name === "AbortError") return;

        // Phase 1 fallback: filter from Redux store entries
        const lowerQuery = query.toLowerCase();
        const descMap = new Map<string, Suggestion>();

        for (const entry of entries) {
          if (!entry.description) continue;
          const key = entry.description.toLowerCase();
          if (!key.includes(lowerQuery)) continue;

          const existing = descMap.get(key);
          if (!existing) {
            descMap.set(key, {
              description: entry.description,
              frequency: 1,
              lastUsed: entry.startTime,
              project: entry.project || null,
              task: entry.task || null,
            });
          } else {
            existing.frequency++;
            if (entry.startTime > existing.lastUsed) {
              existing.lastUsed = entry.startTime;
            }
          }
        }

        if (!controller.signal.aborted) {
          setSuggestions(
            Array.from(descMap.values())
              .sort((a, b) => b.frequency - a.frequency)
              .slice(0, 10)
          );
          // Don't surface the error to the user — fallback is transparent
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [query, projectId, enabled, debounceMs, minQueryLength, entries]);

  return { suggestions, loading, error };
}
```

---

### Suggestion Item Display

Each suggestion row in the dropdown displays:

```
┌──────────────────────────────────────────────────────────┐
│  ● TimeTrack  ·  Reviews                                │
│  Code review - PR #142                          12x  2h │
└──────────────────────────────────────────────────────────┘
     ^             ^                               ^    ^
     |             |                               |    |
  Project color  Task name                    Frequency Recency
  + name         (if any)                     (used N   (last
                                               times)   used)
```

- **Description text**: the matching portion is wrapped in `<mark>` or `<strong>` for visual highlighting.
- **Project**: color dot + name, displayed above or inline.
- **Task**: shown after project with a `·` separator.
- **Frequency**: "12x" badge (subtle, right-aligned).
- **Recency**: relative time like "2h", "3d", "1w" (subtle, right-aligned).

---

## UI Mockups (ASCII Art)

### 1. Timer Form with Autocomplete Dropdown Open

```
┌─────────────────────────────────────────────────────┐
│                    00:04:32                          │
│                                                     │
│  Project *                                          │
│  ┌───────────────────────────────────────────────┐  │
│  │ TimeTrack                                   ▾ │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Task (Optional)                                    │
│  ┌───────────────────────────────────────────────┐  │
│  │ No task                                     ▾ │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Description (Optional)                             │
│  ┌───────────────────────────────────────────────┐  │
│  │ code rev|                                     │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ ● TimeTrack · Reviews                        │  │
│  │   Code review - PR #142              12x  2h │  │
│  ├───────────────────────────────────────────────┤  │
│  │ ● TimeTrack · Reviews                        │  │
│  │   Code review - authentication flow   8x  1d │  │
│  ├───────────────────────────────────────────────┤  │
│  │ ● Landing Page                               │  │
│  │   Code review - landing redesign      3x  5d │  │
│  ├───────────────────────────────────────────────┤  │
│  │ ● TimeTrack · Bug Fixes                      │  │
│  │   Code review feedback fixes          2x  1w │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ ▶  Start Timer                                │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 2. Single Suggestion Item (Detailed)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ●  TimeTrack  ·  Reviews          (project + task) │
│  <Code rev>iew - PR #142              12x      2h   │
│  ^^^^^^^^^^^                          ^^^      ^^   │
│  Bold/highlighted                  Frequency  Last  │
│  matching portion                   badge    used   │
│                                                     │
└─────────────────────────────────────────────────────┘

Inner layout breakdown:

  ┌─ Color dot (w-2 h-2 rounded-full, project color)
  │    ┌─ Project name (text-xs text-gray-500 font-medium)
  │    │           ┌─ Separator dot (text-gray-300)
  │    │           │    ┌─ Task name (text-xs text-gray-400)
  │    │           │    │
  ●  TimeTrack  ·  Reviews
  Code review - PR #142                12x      2h ago
  │                                     │        │
  └─ Description (text-sm text-gray-900)│        │
     Matched substring in <mark> tag    │        │
     with bg-yellow-100 rounded         │        │
                                        │        │
                        text-xs ────────┘        │
                        text-gray-400            │
                        bg-gray-100              │
                        rounded px-1.5           │
                                                 │
                                   text-xs ──────┘
                                   text-gray-400
```

### 3. Keyboard Navigation State (Item Highlighted)

```
  Description (Optional)
  ┌───────────────────────────────────────────────┐
  │ code rev|                                     │
  └───────────────────────────────────────────────┘
  ┌───────────────────────────────────────────────┐
  │   ● TimeTrack · Reviews                      │
  │     Code review - PR #142            12x  2h │
  ├───────────────────────────────────────────────┤
  │ ▸ ● TimeTrack · Reviews            ◀─ highlighted
  │     Code review - auth flow    ███   8x  1d │ bg-primary-50
  │     ^^^^^^^^^^^^^^^^^^^^^^^^^^      border-l-2
  │     (entire row has blue-50 bg)     border-primary-500
  ├───────────────────────────────────────────────┤
  │   ● Landing Page                              │
  │     Code review - landing redesign   3x  5d │
  ├───────────────────────────────────────────────┤
  │   ● TimeTrack · Bug Fixes                    │
  │     Code review feedback fixes       2x  1w │
  └───────────────────────────────────────────────┘

  Keyboard hints (shown at bottom of dropdown on first open):
  ┌───────────────────────────────────────────────┐
  │  ↑↓ navigate  ⏎ select  ⎋ dismiss   ⇥ accept│
  └───────────────────────────────────────────────┘
```

### 4. Empty State ("No matching entries")

```
  Description (Optional)
  ┌───────────────────────────────────────────────┐
  │ xyzzy_nonexistent|                            │
  └───────────────────────────────────────────────┘
  ┌───────────────────────────────────────────────┐
  │                                               │
  │       No matching descriptions found          │
  │       Start typing to search your history     │
  │                                               │
  └───────────────────────────────────────────────┘
```

### 5. Loading State

```
  Description (Optional)
  ┌───────────────────────────────────────────────┐
  │ code rev|                                     │
  └───────────────────────────────────────────────┘
  ┌───────────────────────────────────────────────┐
  │                                               │
  │           ◌  Searching descriptions...        │
  │              (spinner + text)                  │
  │                                               │
  └───────────────────────────────────────────────┘
```

### 6. Autocomplete in EditTimeEntryModal

```
┌─────────────────────────────────────────────────────────┐
│  Edit Time Entry                                    ✕   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Description                                            │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Sprint plan|                                      │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ● TimeTrack · Planning                           │  │
│  │   Sprint planning - week 9              15x  12h │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ ● TimeTrack · Planning                           │  │
│  │   Sprint planning - retro                6x   2d │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────┐  ┌───────────────────────┐    │
│  │ Project             │  │ Task                  │    │
│  │ TimeTrack         ▾ │  │ Planning            ▾ │    │
│  └─────────────────────┘  └───────────────────────┘    │
│                                                         │
│  ...remaining fields...                                 │
│                                                         │
│                              ┌────────┐ ┌────────────┐  │
│                              │ Cancel │ │ Save Changes│  │
│                              └────────┘ └────────────┘  │
└─────────────────────────────────────────────────────────┘

Note: In the edit modal, the description field is currently a <textarea>
with rows={2}. The AutocompleteInput can be used with a single-line
<input> variant or adapted to work with textarea. Recommendation:
convert to single-line <input type="text"> with AutocompleteInput for
consistency, since multi-line descriptions are rare.
```

### 7. Mobile Responsive Dropdown

```
┌──────────────────────────┐
│       00:04:32           │
│                          │
│ Project *                │
│ ┌──────────────────────┐ │
│ │ TimeTrack          ▾ │ │
│ └──────────────────────┘ │
│                          │
│ Description (Optional)   │
│ ┌──────────────────────┐ │
│ │ code rev|            │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ ● TimeTrack          │ │
│ │ Code review -    12x │ │
│ │ PR #142          2h  │ │
│ ├──────────────────────┤ │
│ │ ● TimeTrack          │ │
│ │ Code review -    8x  │ │
│ │ auth flow        1d  │ │
│ ├──────────────────────┤ │
│ │ ● Landing Page       │ │
│ │ Code review -    3x  │ │
│ │ landing redes..  5d  │ │
│ └──────────────────────┘ │
│                          │
│ ┌──────────────────────┐ │
│ │ ▶  Start Timer       │ │
│ └──────────────────────┘ │
└──────────────────────────┘

Mobile adjustments:
- Dropdown is full-width (w-full)
- Suggestion items have larger tap targets (min-h-[48px], py-3)
- Description text wraps instead of truncating
- Frequency and recency stack vertically
- Touch: tap to select (no hover state needed)
```

---

## Implementation Plan

### Step 1: Create `Suggestion` type in shared types

**File:** `packages/shared/src/types/index.ts`

Add the `DescriptionSuggestion` interface so it can be shared between API and UI.

### Step 2: Create `AutocompleteInput.tsx` component

**File:** `packages/ui/src/components/AutocompleteInput.tsx`

Build the reusable autocomplete input with:
- Controlled value/onChange interface (mirrors `<input>`)
- Dropdown rendering with `position: absolute` and `z-50`
- Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape, Tab)
- Click-outside detection via `useRef` + `useEffect` with `mousedown` listener
- Match highlighting in suggestion text
- Loading and empty states
- ARIA combobox attributes

### Step 3: Create `useAutocompleteSuggestions.ts` hook

**File:** `packages/ui/src/hooks/useAutocompleteSuggestions.ts`

Implement the hook with:
- Debounced query (200ms default)
- AbortController for request cancellation
- Phase 1 Redux fallback when API is unavailable
- Export from `packages/ui/src/hooks/index.ts`

### Step 4: Add API endpoint (Phase 2)

**File:** `packages/api/src/routes/timeEntries.ts`

Add `GET /time-entries/suggestions` route with:
- Zod validation schema for query parameters
- Prisma query with frequency + recency sorting
- Project prioritization when `projectId` is provided
- Route placed BEFORE `/:id` routes to avoid parameter capture conflict

### Step 5: Add API client method

**File:** `packages/ui/src/services/api.ts`

Add `getSuggestions` method to the `timeEntries` namespace in `APIClient`:

```typescript
getSuggestions: async (params: {
  q: string;
  projectId?: string;
  limit?: number;
}) => {
  const queryParams = new URLSearchParams({ q: params.q });
  if (params.projectId) queryParams.append("projectId", params.projectId);
  if (params.limit) queryParams.append("limit", params.limit.toString());

  return this.request<{
    suggestions: Array<{
      description: string;
      frequency: number;
      lastUsed: string;
      project: { id: string; name: string; color: string } | null;
      task: { id: string; name: string } | null;
    }>;
  }>("GET", `/time-entries/suggestions?${queryParams.toString()}`);
},
```

### Step 6: Integrate into `Timer.tsx`

**File:** `packages/ui/src/components/Timer.tsx`

1. Replace the plain `<input type="text">` for description with `<AutocompleteInput>`.
2. Pass `selectedProjectId` as `projectId` prop for context-aware filtering.
3. Update `handleKeyDown` — the AutocompleteInput handles Enter internally when a suggestion is highlighted, so the parent only receives Enter when no suggestion is active.

```tsx
// Before:
<input
  type="text"
  id="description"
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  onKeyDown={handleKeyDown}
  placeholder="What are you working on?"
  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

// After:
<AutocompleteInput
  id="description"
  value={description}
  onChange={setDescription}
  onKeyDown={handleKeyDown}
  placeholder="What are you working on?"
  projectId={selectedProjectId || undefined}
  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
/>
```

### Step 7: Integrate into `EditTimeEntryModal.tsx`

**File:** `packages/ui/src/components/EditTimeEntryModal.tsx`

1. Replace the `<textarea>` for description with `<AutocompleteInput>`.
2. Pass the current `projectId` state for context-aware filtering.
3. The modal does not have an Enter-to-submit behavior on the description field, so no conflict handling is needed.

### Step 8: Add database index (Phase 2)

**File:** `packages/api/prisma/schema.prisma`

Add a composite index on `[userId, description]` to the `TimeEntry` model for efficient `ILIKE` queries.

### Step 9: Write tests

- `packages/ui/src/components/__tests__/AutocompleteInput.test.tsx`
- `packages/ui/src/hooks/__tests__/useAutocompleteSuggestions.test.ts`
- `packages/api/src/routes/__tests__/timeEntriesSuggestions.test.ts`

---

## Files to Create / Modify

### New Files

| File | Description |
|------|-------------|
| `packages/ui/src/components/AutocompleteInput.tsx` | Reusable autocomplete input component with dropdown, keyboard navigation, ARIA attributes |
| `packages/ui/src/hooks/useAutocompleteSuggestions.ts` | Hook that fetches/filters description suggestions with debouncing and abort control |
| `packages/ui/src/components/__tests__/AutocompleteInput.test.tsx` | Component tests: rendering, keyboard nav, selection, open/close, accessibility |
| `packages/ui/src/hooks/__tests__/useAutocompleteSuggestions.test.ts` | Hook tests: debouncing, filtering, API calls, fallback behavior |
| `packages/api/src/routes/__tests__/timeEntriesSuggestions.test.ts` | API endpoint tests: query matching, frequency ordering, auth, validation |

### Modified Files

| File | Changes |
|------|---------|
| `packages/ui/src/components/Timer.tsx` | Replace plain `<input>` with `<AutocompleteInput>` for description field; pass `projectId` prop |
| `packages/ui/src/components/EditTimeEntryModal.tsx` | Replace `<textarea>` with `<AutocompleteInput>` for description field; pass `projectId` prop |
| `packages/ui/src/hooks/index.ts` | Add export for `useAutocompleteSuggestions` |
| `packages/ui/src/services/api.ts` | Add `getSuggestions` method to `timeEntries` namespace in `APIClient` |
| `packages/api/src/routes/timeEntries.ts` | Add `GET /time-entries/suggestions` route handler (before `/:id` routes) |
| `packages/api/prisma/schema.prisma` | Add `@@index([userId, description])` to `TimeEntry` model |
| `packages/shared/src/types/index.ts` | Add `DescriptionSuggestion` interface |

---

## Component API Reference

```typescript
// packages/ui/src/components/AutocompleteInput.tsx

import { Suggestion } from "../hooks/useAutocompleteSuggestions";

interface AutocompleteInputProps {
  /** Current input value (controlled) */
  value: string;

  /** Called when value changes — receives the new string value (not an event) */
  onChange: (value: string) => void;

  /** Called when a suggestion is selected from the dropdown */
  onSelect?: (suggestion: Suggestion) => void;

  /**
   * Forwarded keyDown handler. The component intercepts ArrowUp, ArrowDown,
   * Enter (when suggestion highlighted), Escape, and Tab internally.
   * All other keys and unhandled Enter events are forwarded to this handler.
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;

  /** Input placeholder text */
  placeholder?: string;

  /** Additional CSS classes applied to the input element */
  className?: string;

  /** HTML id attribute for the input element (for <label htmlFor>) */
  id?: string;

  /** Project ID for context-aware suggestion filtering */
  projectId?: string;

  /** Whether the autocomplete is enabled (default: true) */
  enabled?: boolean;

  /** Debounce delay in ms before triggering suggestion fetch (default: 200) */
  debounceMs?: number;

  /** Minimum characters before suggestions appear (default: 2) */
  minQueryLength?: number;

  /** Maximum number of suggestions to display (default: 8) */
  maxSuggestions?: number;

  /** Whether the input is disabled */
  disabled?: boolean;

  /** Ref forwarded to the underlying <input> element */
  ref?: React.Ref<HTMLInputElement>;
}
```

**Usage example:**

```tsx
import AutocompleteInput from "../components/AutocompleteInput";

<AutocompleteInput
  id="description"
  value={description}
  onChange={setDescription}
  onSelect={(suggestion) => {
    // Optionally auto-select the project/task from the suggestion
    if (suggestion.project && !selectedProjectId) {
      setSelectedProjectId(suggestion.project.id);
    }
  }}
  onKeyDown={handleKeyDown}
  placeholder="What are you working on?"
  projectId={selectedProjectId || undefined}
  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
/>
```

---

## Edge Cases and Considerations

### Enter Key Conflict

**Problem:** Currently, pressing Enter in the description input starts the timer (`handleKeyDown` in `Timer.tsx` calls `handleStartTimer`). With autocomplete, Enter should select a highlighted suggestion instead.

**Solution:** The `AutocompleteInput` component intercepts Enter when `highlightedIndex >= 0` and the dropdown is open. It calls `e.preventDefault()` and `e.stopPropagation()`, selects the suggestion, and closes the dropdown. The `onKeyDown` prop handler is NOT called in this case. When no suggestion is highlighted (or dropdown is closed), the Enter event passes through to `onKeyDown` normally, preserving the existing start-timer behavior.

### Focus/Blur Timing with Dropdown Clicks

**Problem:** Clicking a suggestion triggers `blur` on the input before the `click` fires on the suggestion item, causing the dropdown to close before the click registers.

**Solution:** Use `onMouseDown` (not `onClick`) on suggestion items with `e.preventDefault()` to prevent the input from losing focus. Alternatively, add a 150ms delay on the blur handler before closing the dropdown, and cancel it if a suggestion `mousedown` fires within that window.

```typescript
const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

const handleBlur = () => {
  blurTimeoutRef.current = setTimeout(() => setIsOpen(false), 150);
};

const handleSuggestionMouseDown = (e: React.MouseEvent, suggestion: Suggestion) => {
  e.preventDefault(); // Prevent input blur
  if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
  selectSuggestion(suggestion);
};
```

### Debounce Timing

- **200ms** is the sweet spot: fast enough to feel instant for normal typing, slow enough to avoid firing on every keystroke during fast typing.
- For Phase 2 (API calls), 200ms also reduces server load. A user typing "code review" at ~80 WPM triggers roughly 2-3 API calls instead of 11.

### Very Long Descriptions

- Truncate descriptions in the dropdown at 80 characters with ellipsis (`...`).
- Use `text-ellipsis overflow-hidden whitespace-nowrap` in Tailwind.
- Full description visible via `title` attribute on hover.

### Special Characters in Search Query

- **Client-side:** No risk — JavaScript string methods handle all characters.
- **Server-side:** Prisma's parameterized queries prevent SQL injection. The `ILIKE` operator with `%` wildcards prepended/appended is safe because Prisma escapes the parameter value. For the raw query variant, use `prisma.$queryRaw` with tagged template literals (which auto-parameterize).
- Escape `%` and `_` in user input for LIKE/ILIKE queries: replace `%` with `\%` and `_` with `\_` before passing to the query.

### Empty Description Entries

- Filter out entries with `null` or empty string descriptions in both the API query (`WHERE description IS NOT NULL AND description != ''`) and the client-side fallback.

### Duplicate Descriptions Across Projects

- Same description used in different projects should appear once in the dropdown, with the most recent project/task context shown.
- The API de-duplicates by grouping on `description` (case-insensitive).

### Performance with Large History

- Without index: `ILIKE '%query%'` on 100k rows with a sequential scan takes 50-200ms, which is acceptable for autocomplete behind a 200ms debounce.
- With `pg_trgm` GIN index: same query takes <5ms.
- The `@@index([userId, description])` B-tree index helps when the query is a prefix match (`ILIKE 'query%'`), but not for infix matches (`ILIKE '%query%'`). The trigram index covers both cases.
- The `LIMIT 10` clause ensures the query returns quickly regardless.

### Accessibility

Detailed in the Accessibility section below.

### Dropdown Z-Index and Overflow

- The dropdown uses `z-50` (Tailwind) to appear above other form elements.
- In the `EditTimeEntryModal`, the modal has `z-50` and the dropdown should use `z-[60]` or be positioned within the modal's stacking context.
- The modal has `overflow-y-auto` and `max-h-[90vh]` — the dropdown must not be clipped. Use `position: fixed` with calculated coordinates if the dropdown would overflow the modal's scroll container, or use a portal (`createPortal`) to render the dropdown at the document root.

---

## Accessibility

The component implements the [WAI-ARIA Combobox pattern](https://www.w3.org/WAI/ARIA/apd/patterns/combobox/) (list autocomplete with manual selection).

### ARIA Attributes

```tsx
{/* Input element */}
<input
  role="combobox"
  aria-expanded={isOpen}
  aria-controls="description-suggestions-listbox"
  aria-activedescendant={
    highlightedIndex >= 0
      ? `suggestion-${highlightedIndex}`
      : undefined
  }
  aria-autocomplete="list"
  aria-haspopup="listbox"
  autoComplete="off"  // Disable browser autocomplete
  {...otherProps}
/>

{/* Dropdown listbox */}
<ul
  id="description-suggestions-listbox"
  role="listbox"
  aria-label="Description suggestions"
>
  {suggestions.map((suggestion, index) => (
    <li
      key={suggestion.description}
      id={`suggestion-${index}`}
      role="option"
      aria-selected={index === highlightedIndex}
    >
      {/* suggestion content */}
    </li>
  ))}
</ul>

{/* Live region for screen reader announcements */}
<div
  aria-live="polite"
  aria-atomic="true"
  className="sr-only"
>
  {isOpen && suggestions.length > 0
    ? `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''} available. Use up and down arrows to navigate.`
    : isOpen && suggestions.length === 0
    ? "No suggestions found."
    : ""}
</div>
```

### Keyboard Interaction (ARIA Combobox Spec)

| Key | Behavior |
|-----|----------|
| `ArrowDown` | Open dropdown (if closed). Move highlight to next suggestion. Wrap to first from last. |
| `ArrowUp` | Move highlight to previous suggestion. Wrap to last from first. |
| `Enter` | If suggestion highlighted: select it, close dropdown. If nothing highlighted: pass through to parent handler. |
| `Escape` | Close dropdown. Clear highlight. Keep current input value. |
| `Tab` | If suggestion highlighted: accept it, close dropdown, move focus to next element. If nothing highlighted: normal tab. |
| `Home` | Move cursor to start of input (do not change highlight). |
| `End` | Move cursor to end of input (do not change highlight). |

### Screen Reader Behavior

1. When suggestions appear, the live region announces the count.
2. As the user arrows through suggestions, `aria-activedescendant` updates, causing the screen reader to announce the focused option.
3. Each `<li role="option">` should have descriptive text content (not just visual elements) so the screen reader reads the full suggestion.
4. Selection is announced via the live region: "Selected: Code review - PR #142".

### Focus Management

- Focus always remains on the `<input>` element — the dropdown is navigated via `aria-activedescendant`, not actual focus movement.
- Clicking a suggestion returns focus to the input (via `e.preventDefault()` on mousedown).

---

## Testing Plan

### Unit Tests: `useAutocompleteSuggestions` Hook

**File:** `packages/ui/src/hooks/__tests__/useAutocompleteSuggestions.test.ts`

| Test Case | Description |
|-----------|-------------|
| Returns empty array when query is too short | Query length < `minQueryLength` returns `[]` |
| Debounces API calls | Typing rapidly should only trigger one API call after the debounce period |
| Cancels in-flight requests | New query should abort the previous request |
| Filters by substring (case-insensitive) | "code" matches "Code Review" and "Encode data" |
| Falls back to Redux store on API failure | When the API endpoint returns an error, filter from `state.timeEntries.entries` |
| Returns suggestions sorted by frequency | "Sprint planning" (used 15x) appears before "Sprint retro" (used 3x) |
| Prioritizes project-matching suggestions | When `projectId` is provided, matching project suggestions appear first |
| Handles empty store gracefully | No entries in Redux store and API failure returns empty array |
| Cleans up abort controller on unmount | No memory leaks or state updates after unmount |
| Respects `enabled` flag | When `enabled=false`, returns empty array without API calls |

### Component Tests: `AutocompleteInput`

**File:** `packages/ui/src/components/__tests__/AutocompleteInput.test.tsx`

| Test Case | Description |
|-----------|-------------|
| Renders input with placeholder | Basic render test |
| Shows dropdown when typing 2+ chars | Type "co" and verify dropdown appears |
| Hides dropdown when input is cleared | Clear input and verify dropdown disappears |
| Highlights matching text in suggestions | "code" query should bold "Code" in "Code review" |
| ArrowDown navigates suggestions | Press down arrow, verify highlighted index advances |
| ArrowUp navigates suggestions | Press up arrow, verify highlighted index retreats |
| ArrowDown wraps from last to first | At last suggestion, ArrowDown goes to index 0 |
| ArrowUp wraps from first to last | At first suggestion, ArrowUp goes to last index |
| Enter selects highlighted suggestion | Highlight a suggestion, press Enter, verify `onChange` called with suggestion description |
| Enter passes through when nothing highlighted | No highlight, press Enter, verify `onKeyDown` prop receives the event |
| Escape closes dropdown | Press Escape, verify dropdown disappears |
| Tab accepts highlighted suggestion | Highlight a suggestion, press Tab, verify selection |
| Click on suggestion selects it | Click a suggestion, verify `onChange` called |
| Click outside closes dropdown | Click elsewhere on the page, verify dropdown closes |
| Shows loading state | Verify spinner appears while suggestions are loading |
| Shows empty state | Type a query with no matches, verify "No matching descriptions" message |
| Respects `disabled` prop | Verify no dropdown opens when input is disabled |
| ARIA attributes present | Verify `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant` |
| Screen reader announcement | Verify live region text updates when suggestions appear |
| Long description truncation | 100+ char description truncates with ellipsis in dropdown |
| `onSelect` callback fires | Verify `onSelect` is called with full `Suggestion` object on selection |

### API Endpoint Tests: `GET /time-entries/suggestions`

**File:** `packages/api/src/routes/__tests__/timeEntriesSuggestions.test.ts`

| Test Case | Description |
|-----------|-------------|
| Returns suggestions matching query | `?q=code` returns entries with "code" in description |
| Case-insensitive matching | `?q=CODE` matches "code review" |
| Substring matching | `?q=view` matches "Code review" |
| Returns frequency count | Entries used 5 times show `frequency: 5` |
| Orders by frequency descending | Most-used descriptions first |
| Prioritizes matching project | `?projectId=X` puts project X's descriptions first |
| Respects limit parameter | `?limit=3` returns at most 3 suggestions |
| Caps limit at 20 | `?limit=100` returns at most 20 |
| Excludes null/empty descriptions | Entries with no description are not returned |
| De-duplicates descriptions | Same description in different projects appears once |
| Requires authentication | Returns 401 without JWT |
| Returns only user's own entries | User A cannot see User B's descriptions |
| Validates `q` parameter | Missing `q` returns 400 |
| Returns 200 with empty array for no matches | `?q=xyzzy` returns `{ suggestions: [] }` |
| Includes project and task info | Response includes project name/color and task name |

### Manual Testing Checklist

- [ ] Type a description that matches history — see dropdown with correct suggestions
- [ ] Select project first, then type — verify project-matching suggestions appear first
- [ ] Use ArrowDown/ArrowUp to navigate, Enter to select
- [ ] Press Escape to dismiss dropdown, then Enter to start timer (no conflict)
- [ ] Click a suggestion — verify it populates the input and closes dropdown
- [ ] Click outside the dropdown — verify it closes
- [ ] Type a query with no matches — verify "No matching descriptions" empty state
- [ ] Clear the input — verify dropdown closes
- [ ] Test in `EditTimeEntryModal` — same autocomplete behavior
- [ ] Test on mobile viewport (375px width) — dropdown is full-width and touch-friendly
- [ ] Test with screen reader (VoiceOver / NVDA) — announcements work correctly
- [ ] Test with slow network (Chrome DevTools throttle) — loading state appears
- [ ] Test with API offline — fallback to Redux store suggestions works
- [ ] Start timer with Enter when suggestion dropdown is open but nothing highlighted — timer starts (not suggestion selected)
- [ ] Start timer with Enter when suggestion is highlighted — suggestion selected, timer does NOT start
- [ ] Test with 0 time entries (new user) — no errors, empty state gracefully handled

### Performance Test

- Seed 10,000+ time entries with 200+ unique descriptions for a single user.
- Verify autocomplete query (`GET /time-entries/suggestions?q=co`) responds in <100ms.
- Verify typing in the input does not cause visible jank or frame drops in the browser.
- Profile React renders: `AutocompleteInput` should not cause parent (`Timer`) to re-render when internal state changes (dropdown open/close, highlight index).

---

## Future Enhancements

### Smart Suggestions Based on Time/Day Patterns

Analyze the user's history to suggest descriptions contextually:
- "Stand-up meeting" suggested at 9:00 AM on weekdays
- "Weekly report" suggested on Fridays
- "Sprint planning" suggested on Monday mornings

Implementation: add `dayOfWeek` and `hourOfDay` to the suggestions query and weight by temporal proximity.

### "Frequently Used" Section (Pre-Query)

Show the top 5 most-used descriptions immediately when the input receives focus (before any typing). This lets the user pick a common description with a single click or keypress.

```
  Description (Optional)
  ┌───────────────────────────────────────────────┐
  │ | (cursor, no text yet)                       │
  └───────────────────────────────────────────────┘
  ┌───────────────────────────────────────────────┐
  │  Recently used                                │
  ├───────────────────────────────────────────────┤
  │  Code review - PR #142               12x  2h │
  │  Sprint planning - week 9            15x 12h │
  │  Bug fix - auth module                8x  1d │
  │  Client sync call                     6x  3d │
  │  Documentation updates                4x  5d │
  └───────────────────────────────────────────────┘
```

### Inline Token Syntax (Toggl-style)

Allow typing special characters to inline-select project and task:
- `@projectname` to set project
- `#taskname` to set task
- Description is everything else

Example: `Code review @TimeTrack #Reviews` would set project to "TimeTrack", task to "Reviews", and description to "Code review".

### AI-Powered Description Suggestions

Use a language model to suggest descriptions based on:
- The selected project and task
- Time of day and day of week
- Recent activity patterns
- Calendar integration (suggest meeting names from calendar events)

### Most Recent on Focus (No Typing Required)

Combine with the "Frequently Used" enhancement: on input focus, show a mixed list of:
1. Top 3 most-used descriptions (frequency-based)
2. Top 3 most-recent descriptions (recency-based)
3. De-duplicated and limited to 5-6 total

This is the single highest-impact UX improvement after the base autocomplete, since many users re-start the same timer they ran earlier today.

### Electron / macOS / iOS Native Clients

The native clients (`packages/mac-app/`, `packages/ios-app/`) have their own description input fields. Once the API endpoint exists (Phase 2), each native client can implement autocomplete using platform-native patterns:
- **macOS**: `NSComboBox` or custom `NSTextField` with `NSPopover`
- **iOS**: `UISearchController` or custom `UITextField` with `UITableView` dropdown
- **Electron**: Shares the React component directly (same `AutocompleteInput.tsx`)

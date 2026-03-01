# Feature: Keyboard Shortcuts for Common Actions

## Summary

TimeTrack currently has almost no keyboard support -- the only shortcut is `Enter` to submit the timer start form in `Timer.tsx`. Every other action (starting/stopping timers, navigating between pages, dismissing modals) requires the mouse. This forces power users and developers to constantly switch between keyboard and mouse during what should be a seamless workflow.

This feature adds a comprehensive keyboard shortcut system with vim-style two-key navigation chords, a global timer toggle, and a discoverable help modal. The goal is to make every common action reachable without touching the mouse.

---

## Motivation / User Stories

- **As a developer**, I want to start and stop the timer without reaching for the mouse so I can stay in my keyboard-driven flow when switching between coding and time tracking.
- **As a power user**, I want to navigate between Dashboard, Projects, Time Entries, Reports, and Settings with keyboard chords so I can move through the app as fast as I think.
- **As a new user**, I want to discover available shortcuts easily through a help modal so I don't have to memorize anything upfront or read documentation.
- **As an Electron user**, I want keyboard shortcuts that complement (not conflict with) the existing system tray and menu bar controls.
- **As a user editing time entries**, I want `Escape` to reliably close any open modal so I can dismiss dialogs without hunting for the close button.

---

## Detailed Design

### Shortcut Map

| Shortcut | Action | Context | Notes |
|---|---|---|---|
| `Space` | Toggle timer (start if stopped, stop if running) | Global, when no input focused | If timer is stopped and no project is selected, navigates to `/dashboard` and focuses the project selector. If timer is running, stops it immediately. |
| `N` | Open new manual time entry | Global, when no input focused | Navigates to `/time-entries` and triggers the "Add Entry" flow. Reserved for future inline modal. |
| `G` then `D` | Navigate to Dashboard | Global, when no input focused | Vim-style two-key chord. `G` starts a 500ms chord window. |
| `G` then `P` | Navigate to Projects | Global, when no input focused | |
| `G` then `T` | Navigate to Time Entries | Global, when no input focused | |
| `G` then `R` | Navigate to Reports | Global, when no input focused | |
| `G` then `S` | Navigate to Settings | Global, when no input focused | |
| `?` (`Shift` + `/`) | Show / hide keyboard shortcuts help modal | Global, always | Works even when an input is focused (since `?` is not a common text character for this app). Toggles the modal -- pressing `?` while the modal is open closes it. |
| `Escape` | Close topmost modal / dropdown | Global, always | Closes `KeyboardShortcutsModal`, `EditTimeEntryModal`, Headless UI menus, and any future modals. If no modal is open, this is a no-op. |
| `Ctrl+K` / `Cmd+K` | Reserved for future search / command palette | Global | Does nothing yet. Calls `e.preventDefault()` to reserve the binding and prevent browser default (e.g., Chrome's address bar focus). |

### Architecture

#### 1. `useKeyboardShortcuts` Hook

A new custom hook at `packages/ui/src/hooks/useKeyboardShortcuts.ts` that owns all global shortcut logic.

**Responsibilities:**
- Attaches a single `keydown` listener on `document` when mounted.
- Detaches the listener on unmount (cleanup in `useEffect` return).
- Maintains a `chordPending` ref that tracks whether `G` was pressed within the last 500ms.
- Delegates timer actions to the existing `useTimer` hook (passed in or consumed internally).
- Delegates navigation to `react-router-dom`'s `useNavigate`.
- Exposes state for the help modal (`isHelpModalOpen`, `setIsHelpModalOpen`).

**Input-focus guard:**

```typescript
function isEditableElementFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  // Also check contentEditable
  if ((el as HTMLElement).isContentEditable) {
    return true;
  }
  return false;
}
```

Most shortcuts are suppressed when `isEditableElementFocused()` returns `true`. The exceptions are:
- `Escape` -- always fires (closes modals regardless of focus).
- `?` -- always fires (toggles help modal).
- `Ctrl/Cmd+K` -- always fires (reserved shortcut must preventDefault).

**Two-key chord system:**

```typescript
const chordKeyRef = useRef<string | null>(null);
const chordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

function handleKeyDown(e: KeyboardEvent) {
  const key = e.key;

  // --- Always-active shortcuts ---
  if (key === "Escape") {
    handleEscape();
    return;
  }
  if (key === "?" || (key === "/" && e.shiftKey)) {
    e.preventDefault();
    toggleHelpModal();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && key.toLowerCase() === "k") {
    e.preventDefault(); // Reserve for future search
    return;
  }

  // --- Shortcuts suppressed when typing in form fields ---
  if (isEditableElementFocused()) return;

  // Handle second key of a chord
  if (chordKeyRef.current === "g") {
    clearChordTimeout();
    chordKeyRef.current = null;
    handleGoChord(key.toLowerCase());
    return;
  }

  // Handle first key of a chord
  if (key.toLowerCase() === "g") {
    chordKeyRef.current = "g";
    chordTimeoutRef.current = setTimeout(() => {
      chordKeyRef.current = null;
    }, 500);
    return;
  }

  // Single-key shortcuts
  if (key === " ") {
    e.preventDefault(); // Prevent page scroll
    handleTimerToggle();
    return;
  }
  if (key.toLowerCase() === "n") {
    handleNewEntry();
    return;
  }
}
```

**Timer toggle logic (`handleTimerToggle`):**

```typescript
async function handleTimerToggle() {
  if (isRunning) {
    await stopTimer();
  } else {
    // If no project is selected and we're not on dashboard, go there
    navigate("/dashboard");
    // The Timer component on the dashboard will handle the rest.
    // We do NOT auto-start without a project -- that would violate
    // the "project required" business rule.
  }
}
```

When the timer is running, `Space` stops it from any page. When the timer is stopped, `Space` navigates to `/dashboard` so the user can select a project and start. This avoids the problem of needing a project ID that the hook doesn't own.

**Navigation chord handler (`handleGoChord`):**

```typescript
const GO_TARGETS: Record<string, string> = {
  d: "/dashboard",
  p: "/projects",
  t: "/time-entries",
  r: "/reports",
  s: "/settings",
};

function handleGoChord(secondKey: string) {
  const path = GO_TARGETS[secondKey];
  if (path) {
    navigate(path);
  }
  // If the second key doesn't match, silently ignore.
}
```

**Full hook signature:**

```typescript
interface UseKeyboardShortcutsReturn {
  isHelpModalOpen: boolean;
  setIsHelpModalOpen: (open: boolean) => void;
}

export function useKeyboardShortcuts(): UseKeyboardShortcutsReturn;
```

#### 2. Integration Point: `Layout.tsx`

The hook is consumed in `Layout.tsx` (inside `BrowserEffects` or as a sibling) so it mounts once for all authenticated pages and unmounts on logout.

```typescript
// In Layout.tsx
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";

const KeyboardShortcutsBehavior: React.FC = () => {
  const { isHelpModalOpen, setIsHelpModalOpen } = useKeyboardShortcuts();
  return (
    <KeyboardShortcutsModal
      isOpen={isHelpModalOpen}
      onClose={() => setIsHelpModalOpen(false)}
    />
  );
};

const Layout: React.FC = () => {
  return (
    <div className="flex h-screen bg-gray-50">
      <BrowserEffects />
      <KeyboardShortcutsBehavior />
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
```

### Help Modal Component

`KeyboardShortcutsModal.tsx` in `packages/ui/src/components/`.

**Props:**

```typescript
interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}
```

**Design requirements:**
- Follows the same modal pattern as `EditTimeEntryModal`: fixed overlay with `bg-black bg-opacity-50`, centered white card, `XMarkIcon` close button, `z-50`.
- Shortcuts grouped into three sections: **Timer**, **Navigation**, **General**.
- Each shortcut rendered as a row with `<kbd>` styled keys on the left and the action description on the right.
- `<kbd>` styling: `inline-flex items-center px-2 py-1 text-xs font-mono font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded shadow-sm`.
- Dismiss via `Escape`, clicking the X button, or clicking the backdrop.
- ARIA attributes: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title element.
- Focus trap: the modal should trap focus within itself while open (use a simple focus-trap or Headless UI `Dialog` component since it's already a dependency via `Header.tsx`).

**Shortcut data structure (for rendering):**

```typescript
interface ShortcutEntry {
  keys: string[];      // e.g., ["Space"] or ["G", "D"]
  action: string;      // e.g., "Toggle timer start/stop"
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Timer",
    shortcuts: [
      { keys: ["Space"], action: "Toggle timer start / stop" },
      { keys: ["N"], action: "New manual time entry" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["G", "D"], action: "Go to Dashboard" },
      { keys: ["G", "P"], action: "Go to Projects" },
      { keys: ["G", "T"], action: "Go to Time Entries" },
      { keys: ["G", "R"], action: "Go to Reports" },
      { keys: ["G", "S"], action: "Go to Settings" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: ["?"], action: "Show this help" },
      { keys: ["Esc"], action: "Close modal / dropdown" },
      { keys: ["Ctrl", "K"], action: "Search (coming soon)" },
    ],
  },
];
```

### Shortcut Indicator Badges

Small `<kbd>` badges placed inline next to relevant UI elements to teach shortcuts passively.

**Sidebar badges** -- each nav link gets a subtle badge after the label text:

```tsx
{/* Example inside Sidebar.tsx navigation map */}
<NavLink ...>
  <item.icon ... />
  {item.name}
  {item.shortcutHint && (
    <span className="ml-auto hidden lg:inline-flex items-center gap-0.5">
      {item.shortcutHint.map((k) => (
        <kbd
          key={k}
          className="px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-50 border border-gray-200 rounded"
        >
          {k}
        </kbd>
      ))}
    </span>
  )}
</NavLink>
```

Update the `navigation` array in `Sidebar.tsx`:

```typescript
const navigation = [
  { name: "Dashboard",    href: "/dashboard",     icon: HomeIcon,                shortcutHint: ["G", "D"] },
  { name: "Projects",     href: "/projects",      icon: FolderIcon,              shortcutHint: ["G", "P"] },
  { name: "Time Entries", href: "/time-entries",   icon: ClockIcon,               shortcutHint: ["G", "T"] },
  { name: "Reports",      href: "/reports",        icon: ChartBarIcon,            shortcutHint: ["G", "R"] },
  { name: "Settings",     href: "/settings",       icon: CogIcon,                 shortcutHint: ["G", "S"] },
  { name: "API Test",     href: "/api-test",       icon: WrenchScrewdriverIcon                             },
];
```

**Timer button badge** -- in `Timer.tsx`, the start/stop button shows the shortcut:

```tsx
<button ...>
  <PlayIcon className="h-4 w-4" />
  {loading ? "Starting..." : "Start Timer"}
  <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono text-primary-400 bg-primary-50 border border-primary-200 rounded hidden sm:inline">
    Space
  </kbd>
</button>
```

**Help hint in the bottom-left of the sidebar** -- below the user info section:

```tsx
<div className="px-4 py-2 text-center">
  <button
    onClick={onOpenHelp}
    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
  >
    Press <kbd className="px-1 py-0.5 text-[10px] font-mono bg-gray-100 border border-gray-200 rounded">?</kbd> for shortcuts
  </button>
</div>
```

---

## UI Mockups (ASCII Art)

### 1. Keyboard Shortcuts Help Modal

```
+----------------------------------------------------+
|  Keyboard Shortcuts                            [X]  |
+----------------------------------------------------+
|                                                     |
|  TIMER                                              |
|  +-------+                                          |
|  | Space |  Toggle timer start / stop               |
|  +-------+                                          |
|  +---+                                              |
|  | N |      New manual time entry                   |
|  +---+                                              |
|                                                     |
|  NAVIGATION                                         |
|  +---+ +---+                                        |
|  | G | | D |  Go to Dashboard                       |
|  +---+ +---+                                        |
|  +---+ +---+                                        |
|  | G | | P |  Go to Projects                        |
|  +---+ +---+                                        |
|  +---+ +---+                                        |
|  | G | | T |  Go to Time Entries                    |
|  +---+ +---+                                        |
|  +---+ +---+                                        |
|  | G | | R |  Go to Reports                         |
|  +---+ +---+                                        |
|  +---+ +---+                                        |
|  | G | | S |  Go to Settings                        |
|  +---+ +---+                                        |
|                                                     |
|  GENERAL                                            |
|  +---+                                              |
|  | ? |      Show this help                          |
|  +---+                                              |
|  +-----+                                            |
|  | Esc |    Close modal / dropdown                  |
|  +-----+                                            |
|  +------+ +---+                                     |
|  | Ctrl | | K |  Search (coming soon)               |
|  +------+ +---+                                     |
|                                                     |
+----------------------------------------------------+
```

### 2. Sidebar with Shortcut Badges

```
+--------------------------------------+
|          TimeTrack                    |
+--------------------------------------+
|                                      |
|  [icon] Dashboard          +---+---+ |
|                             |G | D | |
|                             +---+---+ |
|                                      |
|  [icon] Projects           +---+---+ |
|                             |G | P | |
|                             +---+---+ |
|                                      |
|  [icon] Time Entries       +---+---+ |
|                             |G | T | |
|                             +---+---+ |
|                                      |
|  [icon] Reports            +---+---+ |
|                             |G | R | |
|                             +---+---+ |
|                                      |
|  [icon] Settings           +---+---+ |
|                             |G | S | |
|                             +---+---+ |
|                                      |
|  [icon] API Test                     |
|                                      |
+--------------------------------------+
|  (avatar) Test User                  |
|  test@example.com                    |
+--------------------------------------+
|  Press [?] for shortcuts             |
+--------------------------------------+
```

### 3. Timer Component with Shortcut Badge

```
+------------------------------------------+
|                                          |
|              00:00:00                    |
|                                          |
|  Project *                               |
|  +------------------------------------+  |
|  | Select a project            [v]    |  |
|  +------------------------------------+  |
|                                          |
|  Description (Optional)                  |
|  +------------------------------------+  |
|  | What are you working on?           |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  | [>]  Start Timer         [Space]  |  |
|  +------------------------------------+  |
|                                          |
+------------------------------------------+

  (When timer is running:)

+------------------------------------------+
|                                          |
|              01:23:45                    |
|         Project Alpha - Task 1           |
|                                          |
|  +------------------------------------+  |
|  | [#]  Stop Timer          [Space]  |  |
|  +------------------------------------+  |
|                                          |
+------------------------------------------+
```

---

## Implementation Plan

### Step 1: Create the `useKeyboardShortcuts` Hook

**File:** `packages/ui/src/hooks/useKeyboardShortcuts.ts`

1. Define the `isEditableElementFocused()` helper function.
2. Define the `SHORTCUT_GROUPS` data constant (used by both the hook and the modal).
3. Implement the hook:
   - `useState` for `isHelpModalOpen`.
   - `useRef` for `chordKeyRef` and `chordTimeoutRef`.
   - Consume `useTimer()` to get `isRunning` and `stopTimer`.
   - Consume `useNavigate()` for page navigation.
   - Single `useEffect` that adds a `keydown` listener on `document` and returns a cleanup function.
   - Inside the listener, implement the full handler as described in the Architecture section.
4. Export the hook and the `SHORTCUT_GROUPS` constant.

### Step 2: Create the `KeyboardShortcutsModal` Component

**File:** `packages/ui/src/components/KeyboardShortcutsModal.tsx`

1. Import `SHORTCUT_GROUPS` from the hook file (or a shared constants file).
2. Build the modal using the same overlay/card pattern as `EditTimeEntryModal`:
   - `fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50`
   - White card: `bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto`
3. Render shortcut groups with `<kbd>` styled keys.
4. Add backdrop click handler (`onClick` on the overlay, with `e.stopPropagation()` on the card).
5. Add ARIA attributes: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="shortcuts-modal-title"`.
6. Early-return `null` when `isOpen` is `false`.

### Step 3: Wire the Hook into `Layout.tsx`

**File:** `packages/ui/src/components/Layout.tsx`

1. Import `useKeyboardShortcuts` and `KeyboardShortcutsModal`.
2. Create a `KeyboardShortcutsBehavior` component (or inline the logic in `Layout`).
3. Render the `KeyboardShortcutsModal` with state from the hook.
4. Place it alongside `BrowserEffects` inside the Layout wrapper.

### Step 4: Add Shortcut Badges to Sidebar

**File:** `packages/ui/src/components/Sidebar.tsx`

1. Add `shortcutHint?: string[]` to navigation item objects.
2. Populate hints: `["G","D"]`, `["G","P"]`, `["G","T"]`, `["G","R"]`, `["G","S"]`.
3. Render `<kbd>` badges after the nav item name, aligned right with `ml-auto`, hidden below `lg` breakpoint.
4. Add the "Press ? for shortcuts" hint below the user info section.

### Step 5: Add Shortcut Badge to Timer Controls

**File:** `packages/ui/src/components/Timer.tsx`

1. Add a `<kbd>Space</kbd>` badge inside the Start Timer and Stop Timer buttons.
2. Use `hidden sm:inline` so it doesn't crowd the button on mobile.
3. Style the badge to match the button variant (primary tones for start, red tones for stop/danger).

### Step 6: Export the Hook from the Barrel File

**File:** `packages/ui/src/hooks/index.ts`

1. Add `export { useKeyboardShortcuts } from "./useKeyboardShortcuts";`.

### Step 7: Write Tests

**File:** `packages/ui/src/hooks/__tests__/useKeyboardShortcuts.test.ts`
**File:** `packages/ui/src/components/__tests__/KeyboardShortcutsModal.test.tsx`

See the Testing Plan section below for details.

---

## Files to Create / Modify

### New Files

| File | Description |
|---|---|
| `packages/ui/src/hooks/useKeyboardShortcuts.ts` | Core hook: event listener, chord logic, input guard, timer toggle, navigation, help modal state. Also exports `SHORTCUT_GROUPS` constant. |
| `packages/ui/src/components/KeyboardShortcutsModal.tsx` | Modal component rendering grouped shortcut reference. |
| `packages/ui/src/hooks/__tests__/useKeyboardShortcuts.test.ts` | Unit tests for the hook. |
| `packages/ui/src/components/__tests__/KeyboardShortcutsModal.test.tsx` | Integration tests for the modal component. |

### Modified Files

| File | Changes |
|---|---|
| `packages/ui/src/components/Layout.tsx` | Import and mount `useKeyboardShortcuts` hook and `KeyboardShortcutsModal`. |
| `packages/ui/src/components/Sidebar.tsx` | Add `shortcutHint` to nav items, render `<kbd>` badges, add "Press ? for shortcuts" link. |
| `packages/ui/src/components/Timer.tsx` | Add `<kbd>Space</kbd>` badge to start/stop buttons. |
| `packages/ui/src/hooks/index.ts` | Add barrel export for `useKeyboardShortcuts`. |

---

## Edge Cases and Considerations

### Input Field Focus Detection

- The guard checks `<input>`, `<textarea>`, `<select>`, and `contentEditable` elements.
- The `<select>` elements in `Timer.tsx` and `EditTimeEntryModal.tsx` must not trigger navigation when the user types a letter to jump to an option (e.g., pressing `G` in a select to jump to a project starting with "G"). The `isEditableElementFocused()` guard handles this.
- Headless UI `<Menu.Button>` in `Header.tsx` does not count as editable -- shortcuts should work when the user menu is closed.

### Escape Key Handling

- Multiple things may want to respond to `Escape`: the shortcuts modal, `EditTimeEntryModal`, Headless UI menus, and browser-native behaviors (e.g., exiting fullscreen).
- The hook should only set `isHelpModalOpen = false` when the shortcuts modal is currently open. It should NOT call `e.preventDefault()` or `e.stopPropagation()` for `Escape` so that other modal handlers (which listen on their own elements or via React event handlers) can also respond.
- `EditTimeEntryModal` currently has no `Escape` handler. As an enhancement in this feature, add an `onKeyDown` listener on its overlay `div` that calls `onClose` when `Escape` is pressed.

### Electron vs. Browser Differences

- The hook checks `window.electronAPI` existence but does NOT change behavior. Electron already intercepts some global shortcuts (e.g., `Cmd+Q`); our shortcuts use simple letter keys and `Space`, which do not conflict.
- The `Ctrl+K` / `Cmd+K` reservation must use `e.metaKey` on macOS and `e.ctrlKey` on Windows/Linux. Use `(e.metaKey || e.ctrlKey)` to cover both platforms.
- In Electron mode (`isElectron()` returns `true`), the app renders `ElectronApp` instead of `Layout`, so the hook is not mounted. This is correct -- Electron has its own IPC-based controls. No changes needed.

### macOS vs. Windows/Linux Modifier Keys

- The only modifier-based shortcut is `Ctrl/Cmd+K`. Use the standard cross-platform check: `e.metaKey || e.ctrlKey`.
- All other shortcuts are modifier-free, so no platform divergence.
- The help modal should display "Ctrl" on Windows/Linux and the Command symbol on macOS. Detect platform:

```typescript
const isMac = navigator.platform.toUpperCase().includes("MAC");
const modifierLabel = isMac ? "\u2318" : "Ctrl";
```

### Accessibility

- The help modal must have `role="dialog"` and `aria-modal="true"`.
- The modal title must have an `id` referenced by `aria-labelledby` on the dialog container.
- `<kbd>` elements should not have special ARIA roles; they are semantically correct as-is.
- The help trigger in the sidebar should be a `<button>` element (not a `<div>` or `<span>`), which it already is in the proposed design.
- Focus should move into the modal when it opens (to the close button) and return to the previously focused element when it closes. Using Headless UI's `<Dialog>` component (already a project dependency) handles this automatically.

### Conflict with Browser Shortcuts

- `Space` scrolls the page by default when no input is focused. The handler calls `e.preventDefault()` to suppress this.
- `?` (i.e., `Shift+/`) does not conflict with any standard browser shortcut.
- `G` alone does nothing in browsers. The 500ms chord timeout ensures a stale `G` press is discarded.
- `N` does not conflict with standard browser shortcuts (only `Ctrl+N` opens a new window, and we use bare `N`).
- `Ctrl/Cmd+K` conflicts with Chrome's address bar focus and Firefox's search bar. `e.preventDefault()` suppresses the browser behavior. This is intentional and standard practice for web apps (Notion, Linear, Slack, etc.).

### Mobile / Touch Devices

- Keyboard shortcuts are irrelevant on mobile/touch devices.
- The hook should still mount (it is harmless -- no `keydown` events fire on touch), but shortcut badges should be hidden on small screens using responsive classes (`hidden sm:inline` or `hidden lg:inline-flex`).
- The "Press ? for shortcuts" hint in the sidebar should also be hidden below `lg` breakpoint since the sidebar itself collapses on mobile.

### Rapid Key Presses and Race Conditions

- If the user presses `G` then immediately presses another `G` (within 500ms), the first `G` chord is cancelled and a new chord window starts.
- If the user presses `Space` to stop the timer while a stop request is already in flight (from a button click), the `useTimer` hook's `stopTimer` function checks `currentEntry` and returns early if null. No double-stop occurs.
- The chord timeout is cleared in the effect cleanup to prevent memory leaks on unmount.

---

## Testing Plan

### Unit Tests for `useKeyboardShortcuts`

**File:** `packages/ui/src/hooks/__tests__/useKeyboardShortcuts.test.ts`

Use `@testing-library/react`'s `renderHook` with the `renderWithProviders` wrapper (provides Redux store and `BrowserRouter`).

| Test | Description |
|---|---|
| `should toggle help modal on ? press` | Fire `keydown` with `key: "?"`, assert `isHelpModalOpen` becomes `true`. Fire again, assert `false`. |
| `should not fire shortcuts when input is focused` | Render an `<input>`, focus it, fire `keydown` with `key: " "` (Space). Assert timer `stopTimer` was NOT called. |
| `should allow ? even when input is focused` | Focus an input, fire `?`. Assert modal opens. |
| `should navigate to dashboard on G then D` | Fire `keydown` `key: "g"`, then within 500ms fire `key: "d"`. Assert `navigate` was called with `/dashboard`. |
| `should navigate to projects on G then P` | Same pattern, assert `/projects`. |
| `should navigate to time-entries on G then T` | Same pattern, assert `/time-entries`. |
| `should navigate to reports on G then R` | Same pattern, assert `/reports`. |
| `should navigate to settings on G then S` | Same pattern, assert `/settings`. |
| `should ignore chord if second key is after 500ms` | Fire `key: "g"`, wait 600ms, fire `key: "d"`. Assert navigate was NOT called. |
| `should ignore unknown second chord key` | Fire `key: "g"`, then `key: "x"`. Assert no navigation. |
| `should stop timer on Space when running` | Set up store with `isRunning: true` and a `currentEntry`. Fire Space. Assert `stopTimer` action dispatched. |
| `should navigate to dashboard on Space when not running` | Set up store with `isRunning: false`. Fire Space. Assert `navigate("/dashboard")`. |
| `should preventDefault on Space` | Fire Space on document. Assert `event.defaultPrevented` is `true`. |
| `should preventDefault on Ctrl+K` | Fire `keydown` with `ctrlKey: true, key: "k"`. Assert `event.defaultPrevented`. |
| `should close help modal on Escape` | Open help modal, fire Escape. Assert modal closes. |
| `should not stopPropagation on Escape` | Fire Escape. Assert `event.stopPropagation` was NOT called (so other modals can respond). |
| `should clean up listener on unmount` | Unmount the hook, fire keys. Assert no handlers fire. |

### Integration Tests for `KeyboardShortcutsModal`

**File:** `packages/ui/src/components/__tests__/KeyboardShortcutsModal.test.tsx`

| Test | Description |
|---|---|
| `should not render when isOpen is false` | Render with `isOpen={false}`. Assert modal not in DOM. |
| `should render all shortcut groups when open` | Render with `isOpen={true}`. Assert "Timer", "Navigation", "General" headings exist. |
| `should render all shortcut keys` | Assert `Space`, `G`, `D`, `P`, `T`, `R`, `S`, `?`, `Esc`, `Ctrl`, `K` are all present as `<kbd>` elements. |
| `should call onClose when X button clicked` | Click the close button. Assert `onClose` was called. |
| `should call onClose when backdrop clicked` | Click the backdrop overlay. Assert `onClose` was called. |
| `should not close when card body is clicked` | Click inside the modal card. Assert `onClose` was NOT called. |
| `should have correct ARIA attributes` | Assert `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` are present. |
| `should show correct modifier key for platform` | Mock `navigator.platform` as `MacIntel`. Assert Command symbol is shown. Mock as `Win32`. Assert `Ctrl` is shown. |

### Manual Testing Checklist

- [ ] Press `?` on every page -- modal opens and closes consistently
- [ ] Press `Space` on Dashboard with no project selected -- project selector is focused/highlighted
- [ ] Press `Space` on Dashboard with timer running -- timer stops
- [ ] Press `Space` on Reports page with timer running -- timer stops (cross-page)
- [ ] Press `G` then `D` from any page -- navigates to Dashboard
- [ ] Press `G` then `P` from any page -- navigates to Projects
- [ ] Press `G` then `T` from any page -- navigates to Time Entries
- [ ] Press `G` then `R` from any page -- navigates to Reports
- [ ] Press `G` then `S` from any page -- navigates to Settings
- [ ] Press `G`, wait 2 seconds, then press `D` -- no navigation (chord expired)
- [ ] Type in the description field on Timer -- no shortcuts fire
- [ ] Type `G` in the project `<select>` -- jumps to project starting with G, no navigation
- [ ] Press `Escape` while `EditTimeEntryModal` is open -- modal closes
- [ ] Press `Escape` while shortcuts modal is open -- modal closes
- [ ] Press `Escape` while user menu dropdown is open -- dropdown closes
- [ ] Press `N` -- navigates to Time Entries page
- [ ] Press `Ctrl+K` (or `Cmd+K` on Mac) -- nothing visible happens, browser default suppressed
- [ ] Sidebar shows `G D`, `G P`, etc. badges next to nav items
- [ ] Timer start/stop button shows `Space` badge
- [ ] Badges are hidden on small screen widths (responsive)
- [ ] Test in Chrome, Firefox, Safari
- [ ] Test in Electron build -- verify no conflicts with native menus
- [ ] Verify no console errors or warnings from the hook

---

## Future Enhancements

1. **Customizable shortcuts** -- Add a "Keyboard Shortcuts" section to the Settings page (`/settings`) where users can rebind keys. Store preferences in the API (`User.preferences` JSON field) and sync via the existing settings endpoint.

2. **Command palette (`Ctrl/Cmd+K`)** -- Once the search shortcut is reserved, build a full command palette (similar to VS Code / Linear) that allows fuzzy-searching for projects, recent time entries, actions, and pages. This would subsume most of the individual shortcuts into a single unified interface.

3. **Additional shortcuts as features are added:**
   - `E` to edit the most recent time entry
   - `D` to duplicate the most recent time entry
   - `Ctrl/Cmd+Z` to undo the last timer stop (re-start with the same project/task)
   - Arrow keys to navigate within data tables on Time Entries and Reports pages
   - `F` to toggle filters panel on Time Entries page

4. **Shortcut cheat sheet in onboarding** -- Show a one-time tooltip or banner after first login that highlights the `?` shortcut. Dismiss permanently after the user acknowledges it. Track the dismissed state via `localStorage` or user preferences.

5. **Visual chord feedback** -- When the user presses `G`, show a small floating indicator (e.g., bottom-right toast or inline overlay) that says "G..." to signal the app is waiting for the second key. Dismiss after 500ms timeout or second key press.

6. **Vim-style extended navigation** -- Add more chords: `G` then `A` for API Test, `G` then `H` for help/docs. Possibly `G` then `G` to go to the top of the current page's list.

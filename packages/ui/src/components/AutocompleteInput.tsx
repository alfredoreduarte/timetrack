import React, { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { useAutocompleteSuggestions, Suggestion } from "../hooks/useAutocompleteSuggestions";

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: Suggestion) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  projectId?: string;
  enabled?: boolean;
  debounceMs?: number;
  minQueryLength?: number;
  maxSuggestions?: number;
  disabled?: boolean;
}

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return `${diffWeeks}w`;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <mark className="bg-yellow-100 rounded px-0.5">{match}</mark>
      {after}
    </>
  );
}

const AutocompleteInput = forwardRef<HTMLInputElement, AutocompleteInputProps>(
  (
    {
      value,
      onChange,
      onSelect,
      onKeyDown,
      placeholder,
      className,
      id,
      projectId,
      enabled = true,
      debounceMs = 200,
      minQueryLength = 2,
      maxSuggestions = 8,
      disabled = false,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [announcement, setAnnouncement] = useState("");

    const containerRef = useRef<HTMLDivElement>(null);
    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const internalInputRef = useRef<HTMLInputElement | null>(null);

    const { suggestions, loading } = useAutocompleteSuggestions({
      query: value,
      projectId,
      enabled: enabled && !disabled,
      debounceMs,
      minQueryLength,
    });

    const displayedSuggestions = suggestions.slice(0, maxSuggestions);

    // Open dropdown when there are suggestions and query is long enough
    useEffect(() => {
      if (value.length >= minQueryLength && (displayedSuggestions.length > 0 || loading)) {
        setIsOpen(true);
      } else if (value.length < minQueryLength) {
        setIsOpen(false);
      }
    }, [value, displayedSuggestions.length, loading, minQueryLength]);

    // Reset highlight when suggestions change
    useEffect(() => {
      setHighlightedIndex(-1);
    }, [suggestions]);

    // Announce suggestions to screen readers
    useEffect(() => {
      if (isOpen && displayedSuggestions.length > 0) {
        setAnnouncement(
          `${displayedSuggestions.length} suggestion${displayedSuggestions.length !== 1 ? "s" : ""} available. Use up and down arrows to navigate.`
        );
      } else if (isOpen && !loading && value.length >= minQueryLength) {
        setAnnouncement("No suggestions found.");
      } else {
        setAnnouncement("");
      }
    }, [isOpen, displayedSuggestions.length, loading, value, minQueryLength]);

    // Click outside detection
    useEffect(() => {
      const handleMouseDown = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
      };
      document.addEventListener("mousedown", handleMouseDown);
      return () => document.removeEventListener("mousedown", handleMouseDown);
    }, []);

    const selectSuggestion = useCallback(
      (suggestion: Suggestion) => {
        onChange(suggestion.description);
        onSelect?.(suggestion);
        setIsOpen(false);
        setHighlightedIndex(-1);
        setAnnouncement(`Selected: ${suggestion.description}`);
      },
      [onChange, onSelect]
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || displayedSuggestions.length === 0) {
        // If dropdown is closed or empty, also handle ArrowDown to open
        if (e.key === "ArrowDown" && value.length >= minQueryLength && displayedSuggestions.length > 0) {
          e.preventDefault();
          setIsOpen(true);
          setHighlightedIndex(0);
          return;
        }
        onKeyDown?.(e);
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < displayedSuggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : displayedSuggestions.length - 1
          );
          break;
        case "Enter":
          if (highlightedIndex >= 0) {
            e.preventDefault();
            e.stopPropagation();
            selectSuggestion(displayedSuggestions[highlightedIndex]);
          } else {
            // No highlight — pass through to parent (e.g., start timer)
            onKeyDown?.(e);
          }
          break;
        case "Tab":
          if (highlightedIndex >= 0) {
            selectSuggestion(displayedSuggestions[highlightedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
        default:
          onKeyDown?.(e);
          break;
      }
    };

    const handleBlur = () => {
      blurTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }, 150);
    };

    const handleSuggestionMouseDown = (
      e: React.MouseEvent,
      suggestion: Suggestion
    ) => {
      e.preventDefault(); // Prevent input blur
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      selectSuggestion(suggestion);
    };

    const listboxId = id ? `${id}-suggestions-listbox` : "suggestions-listbox";

    return (
      <div ref={containerRef} className="relative">
        <input
          ref={(node) => {
            internalInputRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
          }}
          type="text"
          id={id}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => {
            if (value.length >= minQueryLength && displayedSuggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          className={className}
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedIndex >= 0
              ? `suggestion-${highlightedIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-haspopup="listbox"
          autoComplete="off"
        />

        {isOpen && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Description suggestions"
            className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-y-auto"
          >
            {loading && displayedSuggestions.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-500 text-center">
                <span className="inline-block animate-spin mr-2">&#9696;</span>
                Searching descriptions...
              </li>
            )}

            {!loading && displayedSuggestions.length === 0 && value.length >= minQueryLength && (
              <li className="px-4 py-3 text-sm text-gray-500 text-center">
                No matching descriptions found
              </li>
            )}

            {displayedSuggestions.map((suggestion, index) => (
              <li
                key={suggestion.description}
                id={`suggestion-${index}`}
                role="option"
                aria-selected={index === highlightedIndex}
                onMouseDown={(e) => handleSuggestionMouseDown(e, suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`px-3 py-2 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                  index === highlightedIndex
                    ? "bg-blue-50 border-l-2 border-l-blue-500"
                    : "hover:bg-gray-50"
                }`}
              >
                {/* Project + Task row */}
                {(suggestion.project || suggestion.task) && (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {suggestion.project && (
                      <>
                        {suggestion.project.color && (
                          <span
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: suggestion.project.color }}
                          />
                        )}
                        <span className="text-xs text-gray-500 font-medium truncate">
                          {suggestion.project.name}
                        </span>
                      </>
                    )}
                    {suggestion.task && (
                      <>
                        <span className="text-xs text-gray-300">&middot;</span>
                        <span className="text-xs text-gray-400 truncate">
                          {suggestion.task.name}
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Description + metadata row */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-sm text-gray-900 truncate"
                    title={suggestion.description}
                  >
                    {highlightMatch(suggestion.description, value)}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                      {suggestion.frequency}x
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatRelativeTime(suggestion.lastUsed)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Screen reader live region */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {announcement}
        </div>
      </div>
    );
  }
);

AutocompleteInput.displayName = "AutocompleteInput";

export default AutocompleteInput;

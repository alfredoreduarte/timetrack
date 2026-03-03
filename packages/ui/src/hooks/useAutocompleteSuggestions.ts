import { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import api from "../services/api";

export interface Suggestion {
  description: string;
  frequency: number;
  lastUsed: string;
  project: { id: string; name: string; color?: string | null } | null;
  task: { id: string; name: string } | null;
}

interface UseAutocompleteSuggestionsOptions {
  query: string;
  projectId?: string;
  enabled?: boolean;
  debounceMs?: number;
  minQueryLength?: number;
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

  // Phase 1 fallback: client-side filtering from Redux store
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

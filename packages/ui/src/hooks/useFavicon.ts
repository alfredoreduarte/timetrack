import { useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";

/**
 * Swaps the favicon between default and active variants based on timer state.
 * Active variant shows a green dot indicator when a timer is running.
 */
export function useFavicon(): void {
  const isRunning = useSelector((state: RootState) => state.timer.isRunning);

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    link.href = isRunning ? "/favicon-active.svg" : "/favicon.svg";
  }, [isRunning]);
}

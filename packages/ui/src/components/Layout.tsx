import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import { useBeforeUnload } from "../hooks/useBeforeUnload";
import { useFavicon } from "../hooks/useFavicon";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useIdleMonitor } from "../hooks/useIdleMonitor";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

// Browser-only UX enhancements (tab title, favicon, close warning, idle detection).
// Rendered inside Layout so hooks only mount when authenticated.
const BrowserEffects: React.FC = () => {
  useBeforeUnload();
  useFavicon();
  useDocumentTitle();
  useIdleMonitor();
  return null;
};

// Global keyboard shortcut handler + help modal.
// Mounted inside Layout so shortcuts only fire when authenticated.
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on any route change.
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSidebarOpen]);

  return (
    <div className="flex h-screen bg-gray-50">
      <BrowserEffects />
      <KeyboardShortcutsBehavior />
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onOpenMenu={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

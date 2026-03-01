import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import {
  HomeIcon,
  FolderIcon,
  ClockIcon,
  ChartBarIcon,
  CogIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface NavItem {
  name: string;
  href: string;
  icon: React.ForwardRefExoticComponent<React.SVGProps<SVGSVGElement> & { title?: string; titleId?: string }>;
  shortcutHint?: string[];
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: HomeIcon, shortcutHint: ["D"] },
  { name: "Projects", href: "/projects", icon: FolderIcon, shortcutHint: ["P"] },
  { name: "Time Entries", href: "/time-entries", icon: ClockIcon, shortcutHint: ["T"] },
  { name: "Reports", href: "/reports", icon: ChartBarIcon, shortcutHint: ["R"] },
  { name: "Settings", href: "/settings", icon: CogIcon, shortcutHint: ["S"] },
  { name: "API Test", href: "/api-test", icon: WrenchScrewdriverIcon },
];

const KBD_CLASS = "px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-100 border border-gray-200 rounded";

const isStaging = ((import.meta as any).env.VITE_API_URL || "").includes(
  "staging"
);

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.auth);

  return (
    <>
      {/* Backdrop (mobile only) */}
      <div
        className={`fixed inset-0 z-30 bg-gray-600 transition-opacity duration-200 md:hidden ${
          open ? "bg-opacity-50" : "bg-opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar — static on desktop, slides in on mobile */}
      <div
        className={`fixed inset-y-0 left-0 z-40 flex flex-col w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-out md:relative md:translate-x-0 md:flex-shrink-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo + close button on mobile */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary-600">TimeTrack</h1>
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Close navigation menu"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Staging indicator */}
        {isStaging && (
          <div className="bg-yellow-400 text-yellow-900 text-center text-xs font-bold py-1 tracking-widest uppercase">
            Staging
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={onClose}
                className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? "bg-primary-100 text-primary-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 ${
                    isActive
                      ? "text-primary-500"
                      : "text-gray-400 group-hover:text-gray-500"
                  }`}
                />
                {item.name}
                {item.shortcutHint && (
                  <span className="ml-auto hidden lg:inline-flex items-center gap-0.5">
                    {item.shortcutHint.map((k) => (
                      <kbd key={k} className={KBD_CLASS}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User info */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
            </div>
            <div className="ml-3 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name || "User"}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email || "user@example.com"}
              </p>
            </div>
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="px-4 py-2 border-t border-gray-200 text-center hidden lg:block">
          <span className="text-xs text-gray-400">
            Press{" "}
            <kbd className={KBD_CLASS}>
              ?
            </kbd>{" "}
            for shortcuts
          </span>
        </div>
      </div>
    </>
  );
};

export default Sidebar;

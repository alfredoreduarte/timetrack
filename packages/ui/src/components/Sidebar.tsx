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
} from "@heroicons/react/24/outline";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: HomeIcon, shortcutHint: ["D"] },
  { name: "Projects", href: "/projects", icon: FolderIcon, shortcutHint: ["P"] },
  { name: "Time Entries", href: "/time-entries", icon: ClockIcon, shortcutHint: ["T"] },
  { name: "Reports", href: "/reports", icon: ChartBarIcon, shortcutHint: ["R"] },
  { name: "Settings", href: "/settings", icon: CogIcon, shortcutHint: ["S"] },
  { name: "API Test", href: "/api-test", icon: WrenchScrewdriverIcon, shortcutHint: undefined },
];

const isStaging = ((import.meta as any).env.VITE_API_URL || "").includes(
  "staging"
);

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.auth);

  return (
    <div className="flex flex-col w-64 bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 px-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-primary-600">TimeTrack</h1>
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
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-900">
              {user?.name || "User"}
            </p>
            <p className="text-xs text-gray-500">
              {user?.email || "user@example.com"}
            </p>
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="px-4 py-2 border-t border-gray-200 text-center hidden lg:block">
        <span className="text-xs text-gray-400">
          Press{" "}
          <kbd className="px-1 py-0.5 text-[10px] font-mono bg-gray-100 border border-gray-200 rounded">
            ?
          </kbd>{" "}
          for shortcuts
        </span>
      </div>
    </div>
  );
};

export default Sidebar;

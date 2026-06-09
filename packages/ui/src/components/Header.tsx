import React, { Fragment } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Menu, Transition } from "@headlessui/react";
import {
  ChevronDownIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
} from "@heroicons/react/24/outline";
import { AppDispatch, RootState } from "../store";
import { logout } from "../store/slices/authSlice";
import TimerWidget from "./TimerWidget";
import toast from "react-hot-toast";

interface HeaderProps {
  onOpenMenu?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenMenu }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);

  const handleLogout = () => {
    dispatch(logout());
    toast.success("Logged out successfully");
  };

  const handleMinimizeToTray = () => {
    if (window.electronAPI) {
      window.electronAPI.minimizeToTray();
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          {/* Hamburger — phones only */}
          <button
            type="button"
            onClick={onOpenMenu}
            className="md:hidden -ml-1 p-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
            aria-label="Open navigation menu"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <h2 className="text-base md:text-lg font-semibold text-gray-900 truncate">
            Welcome back!
          </h2>
        </div>

        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          {/* Timer Widget */}
          <TimerWidget />

          {/* Minimize to tray button (Electron only) */}
          {window.electronAPI && (
            <button
              onClick={handleMinimizeToTray}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Minimize to tray"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 12H4"
                />
              </svg>
            </button>
          )}

          {/* User menu */}
          <Menu as="div" className="relative">
            <Menu.Button className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-md px-2 py-1">
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <span className="hidden sm:inline truncate max-w-[8rem]">
                {user?.name || "User"}
              </span>
              <ChevronDownIcon className="w-4 h-4 hidden sm:inline" />
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                <div className="py-1">
                  <Menu.Item>
                    {() => (
                      <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
                        <p className="font-medium">{user?.name || "User"}</p>
                        <p className="text-gray-500">
                          {user?.email || "user@example.com"}
                        </p>
                      </div>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={handleLogout}
                        className={`${
                          active ? "bg-gray-100" : ""
                        } flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100`}
                      >
                        <ArrowRightOnRectangleIcon className="w-4 h-4 mr-2" />
                        Sign out
                      </button>
                    )}
                  </Menu.Item>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </header>
  );
};

export default Header;

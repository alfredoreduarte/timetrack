import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import Sidebar from "./Sidebar";
import Header from "./Header";

// Temporary debug component - remove in production
const DebugAuthState: React.FC = () => {
  const { user, token, isAuthenticated, hasCheckedAuth } = useSelector(
    (state: RootState) => state.auth
  );
  const [isVisible, setIsVisible] = useState(false);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed top-2 right-2 bg-gray-800 text-white text-xs px-2 py-1 rounded z-50 hover:bg-gray-700"
        title="Toggle Auth Debug"
      >
        🐛
      </button>

      {/* Debug panel */}
      {isVisible && (
        <div className="fixed top-10 right-2 bg-black text-white text-xs p-3 z-50 max-w-xs rounded shadow-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold">Auth Debug:</span>
            <button
              onClick={() => setIsVisible(false)}
              className="text-gray-400 hover:text-white ml-2"
            >
              ✕
            </button>
          </div>
          <div>Token: {token ? "✓" : "✗"}</div>
          <div>User: {user ? user.name : "null"}</div>
          <div>Email: {user ? user.email : "null"}</div>
          <div>Authenticated: {isAuthenticated ? "✓" : "✗"}</div>
          <div>Checked: {hasCheckedAuth ? "✓" : "✗"}</div>
          <div>LS User: {localStorage.getItem("user") ? "✓" : "✗"}</div>
          <div>LS Token: {localStorage.getItem("token") ? "✓" : "✗"}</div>
        </div>
      )}
    </>
  );
};

const Layout: React.FC = () => {
  return (
    <div className="flex h-screen bg-gray-50">
      <DebugAuthState />
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

export default Layout;

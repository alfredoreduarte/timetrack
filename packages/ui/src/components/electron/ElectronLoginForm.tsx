import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store";
import { loginUser, clearError } from "../../store/slices/authSlice";

interface ElectronLoginFormProps {
  onShowRegister: () => void;
}

const ElectronLoginForm: React.FC<ElectronLoginFormProps> = ({
  onShowRegister,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error } = useSelector((state: RootState) => state.auth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      return;
    }

    try {
      await dispatch(loginUser({ email, password })).unwrap();
    } catch (error) {
      // Error is handled by Redux state
    }
  };

  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 p-6 drag-region">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome to TimeTrack
          </h2>
          <p className="mt-2 text-sm text-gray-600">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="no-drag w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="no-drag w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-100 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="no-drag w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={onShowRegister}
            className="no-drag text-sm text-blue-600 hover:text-blue-800"
          >
            Don't have an account? Sign up
          </button>
        </div>
      </div>
    </div>
  );
};

export default ElectronLoginForm;

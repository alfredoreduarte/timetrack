import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { authAPI } from "../services/api";
import { logout } from "../store/slices/authSlice";

/** Permanently deletes the account, after the password is confirmed. */
const DeleteAccount: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authAPI.deleteAccount(password);
      dispatch(logout());
      toast.success("Your account and all of its data were deleted.");
      navigate("/login", { replace: true });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string; message?: string } } }).response?.data?.error ||
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "Couldn't delete the account. Try again.";
      setError(message);
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <h4 className="text-sm font-medium text-red-700">Delete account</h4>
      <p className="mt-1 text-sm text-gray-600">
        Removes your projects, time entries, timers, notes, API keys and share links, and cancels any
        subscription. This can't be undone; download any timesheets you need first.
      </p>
      {!open ? (
        <button type="button" className="mt-3 btn-secondary text-red-700" onClick={() => setOpen(true)}>
          Delete my account…
        </button>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <label htmlFor="delete-account-password" className="block text-sm font-medium text-gray-700">
            Your password, to confirm
          </label>
          <input
            id="delete-account-password"
            type="password"
            autoComplete="current-password"
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy || !password}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete everything"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setOpen(false);
                setPassword("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default DeleteAccount;

import React, { useState, useEffect } from "react";
import { authAPI } from "../services/api";

interface CaptchaProps {
  onCaptchaChange: (captchaId: string, captchaValue: string) => void;
  error?: string;
}

const Captcha: React.FC<CaptchaProps> = ({ onCaptchaChange, error }) => {
  const [captchaId, setCaptchaId] = useState<string>("");
  const [captchaSvg, setCaptchaSvg] = useState<string>("");
  const [captchaValue, setCaptchaValue] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const loadCaptcha = async () => {
    setLoading(true);
    try {
      const response = await authAPI.getCaptcha();
      setCaptchaId(response.captchaId);
      setCaptchaSvg(response.captchaSvg);
      setCaptchaValue("");
      onCaptchaChange(response.captchaId, "");
    } catch (error) {
      console.error("Failed to load captcha:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCaptcha();
  }, []);

  const handleCaptchaInputChange = (value: string) => {
    setCaptchaValue(value);
    onCaptchaChange(captchaId, value);
  };

  const handleRefresh = () => {
    loadCaptcha();
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Security Verification
      </label>
      <div className="flex items-center space-x-3">
        <div
          className={`flex items-center justify-center border rounded-md bg-gray-50 ${
            error ? "border-red-300" : "border-gray-300"
          }`}
          style={{ minWidth: "150px", minHeight: "60px" }}
        >
          {loading ? (
            <div className="text-gray-500 text-sm">Loading...</div>
          ) : (
            <div
              dangerouslySetInnerHTML={{ __html: captchaSvg }}
              className="captcha-svg"
            />
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700 disabled:opacity-50"
          title="Refresh captcha"
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
      <input
        type="text"
        value={captchaValue}
        onChange={(e) => handleCaptchaInputChange(e.target.value)}
        className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${
          error ? "border-red-300" : "border-gray-300"
        } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm`}
        placeholder="Enter the characters you see above"
        autoComplete="off"
        required
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-gray-500">
        Enter the characters shown in the image above. Click the refresh button
        to get a new image.
      </p>
    </div>
  );
};

export default Captcha;

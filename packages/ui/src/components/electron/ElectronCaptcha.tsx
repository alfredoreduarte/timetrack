import React, { useState, useEffect } from "react";
import { authAPI } from "../../services/api";

interface ElectronCaptchaProps {
  onCaptchaChange: (captchaId: string, captchaValue: string) => void;
  error?: string | null;
}

const ElectronCaptcha: React.FC<ElectronCaptchaProps> = ({
  onCaptchaChange,
  error,
}) => {
  const [captchaId, setCaptchaId] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [captchaValue, setCaptchaValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadCaptcha = async () => {
    setIsLoading(true);
    try {
      const response = await authAPI.getCaptcha();
      setCaptchaId(response.captchaId);
      setCaptchaSvg(response.captchaSvg);
      setCaptchaValue("");
      onCaptchaChange(response.captchaId, "");
    } catch (error) {
      console.error("Failed to load captcha:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCaptcha();
  }, []);

  const handleCaptchaValueChange = (value: string) => {
    setCaptchaValue(value);
    onCaptchaChange(captchaId, value);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Security Verification
      </label>

      <div className="space-y-3">
        {/* Captcha Image */}
        <div className="flex items-center space-x-2">
          <div
            className={`border rounded-md p-2 bg-gray-50 ${
              error ? "border-red-300" : "border-gray-300"
            }`}
          >
            {isLoading ? (
              <div className="w-32 h-12 flex items-center justify-center text-gray-500 text-sm">
                Loading...
              </div>
            ) : (
              <div
                className="w-32 h-12"
                dangerouslySetInnerHTML={{ __html: captchaSvg }}
              />
            )}
          </div>
          <button
            type="button"
            onClick={loadCaptcha}
            disabled={isLoading}
            className="no-drag px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 disabled:opacity-50"
          >
            🔄
          </button>
        </div>

        {/* Captcha Input */}
        <input
          type="text"
          placeholder="Enter the characters shown above"
          value={captchaValue}
          onChange={(e) => handleCaptchaValueChange(e.target.value)}
          className={`no-drag w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            error ? "border-red-300" : "border-gray-300"
          }`}
        />
      </div>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default ElectronCaptcha;

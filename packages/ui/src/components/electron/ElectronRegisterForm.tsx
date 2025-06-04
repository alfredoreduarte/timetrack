import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store";
import { registerUser, clearError } from "../../store/slices/authSlice";
import ElectronCaptcha from "./ElectronCaptcha";

interface ElectronRegisterFormProps {
  onShowLogin: () => void;
}

const ElectronRegisterForm: React.FC<ElectronRegisterFormProps> = ({
  onShowLogin,
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaValue, setCaptchaValue] = useState("");
  const [validationErrors, setValidationErrors] = useState<{
    [key: string]: string;
  }>({});

  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error } = useSelector((state: RootState) => state.auth);

  const validateForm = () => {
    const errors: { [key: string]: string } = {};

    // Name validation
    if (!name.trim()) {
      errors.name = "Name is required";
    } else if (name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters long";
    }

    // Email validation
    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Please enter a valid email address";
    }

    // Password validation
    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters long";
    }

    // Confirm password validation
    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    // Captcha validation
    if (!captchaId) {
      errors.captcha = "Captcha is required";
    } else if (!captchaValue.trim()) {
      errors.captcha = "Please enter the captcha characters";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCaptchaChange = (id: string, value: string) => {
    setCaptchaId(id);
    setCaptchaValue(value);
    if (validationErrors.captcha) {
      setValidationErrors((prev) => ({ ...prev, captcha: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setValidationErrors({});

    if (!validateForm()) {
      return;
    }

    try {
      await dispatch(
        registerUser({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          captchaId,
          captchaValue: captchaValue.trim(),
        })
      ).unwrap();
    } catch (error) {
      // Error is handled by Redux state
    }
  };

  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  const getFieldError = (fieldName: string) => {
    return validationErrors[fieldName] || null;
  };

  const hasFieldError = (fieldName: string) => {
    return !!validationErrors[fieldName];
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 p-6 overflow-y-auto drag-region">
      <div className="w-full max-w-sm space-y-6 my-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Create Account</h2>
          <p className="mt-2 text-sm text-gray-600">Join TimeTrack today</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Full Name
            </label>
            <input
              id="name"
              type="text"
              required
              className={`no-drag w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                hasFieldError("name") ? "border-red-300" : "border-gray-300"
              }`}
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (validationErrors.name) {
                  setValidationErrors((prev) => ({ ...prev, name: "" }));
                }
              }}
            />
            {getFieldError("name") && (
              <p className="mt-1 text-sm text-red-600">
                {getFieldError("name")}
              </p>
            )}
          </div>

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
              className={`no-drag w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                hasFieldError("email") ? "border-red-300" : "border-gray-300"
              }`}
              placeholder="Enter your email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (validationErrors.email) {
                  setValidationErrors((prev) => ({ ...prev, email: "" }));
                }
              }}
            />
            {getFieldError("email") && (
              <p className="mt-1 text-sm text-red-600">
                {getFieldError("email")}
              </p>
            )}
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
              className={`no-drag w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                hasFieldError("password") ? "border-red-300" : "border-gray-300"
              }`}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (validationErrors.password) {
                  setValidationErrors((prev) => ({ ...prev, password: "" }));
                }
              }}
            />
            {getFieldError("password") && (
              <p className="mt-1 text-sm text-red-600">
                {getFieldError("password")}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              className={`no-drag w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                hasFieldError("confirmPassword")
                  ? "border-red-300"
                  : "border-gray-300"
              }`}
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (validationErrors.confirmPassword) {
                  setValidationErrors((prev) => ({
                    ...prev,
                    confirmPassword: "",
                  }));
                }
              }}
            />
            {getFieldError("confirmPassword") && (
              <p className="mt-1 text-sm text-red-600">
                {getFieldError("confirmPassword")}
              </p>
            )}
          </div>

          <ElectronCaptcha
            onCaptchaChange={handleCaptchaChange}
            error={getFieldError("captcha")}
          />

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
            {isLoading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={onShowLogin}
            className="no-drag text-sm text-blue-600 hover:text-blue-800"
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  );
};

export default ElectronRegisterForm;

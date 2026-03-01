import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useSearchParams } from "react-router-dom";
import { RootState, AppDispatch } from "../store";
import { getCurrentUser } from "../store/slices/authSlice";
import { billingAPI } from "../services/api";
import { toast } from "react-hot-toast";
import {
  CheckCircleIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

const BillingPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  const isSubscribed =
    user?.isSubscriptionExempt ||
    (user?.subscriptionStatus &&
      ACTIVE_STATUSES.includes(user.subscriptionStatus));

  // Handle Stripe redirect query params
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Subscription activated! Welcome to TimeTrack.");
      dispatch(getCurrentUser());
      setSearchParams({}, { replace: true });
    } else if (searchParams.get("canceled") === "true") {
      toast("Checkout canceled. You can subscribe whenever you're ready.", {
        icon: "ℹ️",
      });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, dispatch, setSearchParams]);

  const handleSubscribe = async () => {
    setIsLoading(true);
    try {
      const { url } = await billingAPI.createCheckoutSession();
      if (url) {
        window.location.href = url;
      }
    } catch (error: any) {
      const message =
        error.response?.data?.error || "Failed to start checkout";
      toast.error(message);
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsLoading(true);
    try {
      const { url } = await billingAPI.createPortalSession();
      if (url) {
        window.location.href = url;
      }
    } catch (error: any) {
      const message =
        error.response?.data?.error || "Failed to open billing portal";
      toast.error(message);
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusBadge = () => {
    if (user?.isSubscriptionExempt) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          Lifetime Access
        </span>
      );
    }

    switch (user?.subscriptionStatus) {
      case "active":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Active
          </span>
        );
      case "trialing":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Trial
          </span>
        );
      case "past_due":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Past Due
          </span>
        );
      case "canceled":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Canceled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            No Subscription
          </span>
        );
    }
  };

  // Subscribed view
  if (isSubscribed) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing</h1>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <CheckCircleIcon className="h-8 w-8 text-green-500" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  TimeTrack Pro
                </h2>
                <p className="text-sm text-gray-500">Monthly subscription</p>
              </div>
            </div>
            {getStatusBadge()}
          </div>

          {!user?.isSubscriptionExempt && (
            <>
              {user?.subscriptionStatus === "past_due" && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="flex items-center">
                    <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 mr-2" />
                    <p className="text-sm text-yellow-700">
                      Your last payment failed. Please update your payment
                      method to avoid losing access.
                    </p>
                  </div>
                </div>
              )}

              {user?.subscriptionCancelAtPeriodEnd && (
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                  <p className="text-sm text-orange-700">
                    Your subscription will cancel on{" "}
                    <strong>
                      {formatDate(user.subscriptionCurrentPeriodEnd)}
                    </strong>
                    . You'll retain access until then.
                  </p>
                </div>
              )}

              {user?.subscriptionCurrentPeriodEnd &&
                !user.subscriptionCancelAtPeriodEnd && (
                  <p className="text-sm text-gray-500 mb-4">
                    Next billing date:{" "}
                    {formatDate(user.subscriptionCurrentPeriodEnd)}
                  </p>
                )}

              <button
                onClick={handleManageSubscription}
                disabled={isLoading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <CreditCardIcon className="h-4 w-4 mr-2" />
                {isLoading ? "Loading..." : "Manage Subscription"}
              </button>
            </>
          )}

          {user?.isSubscriptionExempt && (
            <p className="text-sm text-gray-500">
              You have lifetime access to all TimeTrack features.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Not subscribed view
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Subscribe to TimeTrack
      </h1>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            TimeTrack Pro
          </h2>
          <p className="text-gray-500 mb-4">
            Everything you need to track time and manage projects
          </p>
        </div>

        <ul className="space-y-3 mb-8">
          {[
            "Unlimited projects and tasks",
            "Detailed time tracking with hourly rates",
            "Comprehensive reports and analytics",
            "Desktop app with menu bar timer",
            "Real-time sync across all devices",
          ].map((feature) => (
            <li key={feature} className="flex items-center text-sm text-gray-600">
              <CheckCircleIcon className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        <button
          onClick={handleSubscribe}
          disabled={isLoading}
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? "Redirecting to checkout..." : "Subscribe Now"}
        </button>

        <p className="mt-3 text-center text-xs text-gray-400">
          Secure checkout powered by Stripe
        </p>
      </div>
    </div>
  );
};

export default BillingPage;

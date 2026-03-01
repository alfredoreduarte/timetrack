import React from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

const SubscriptionBanner: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);

  if (!user || user.isSubscriptionExempt) return null;

  if (user.subscriptionStatus === "past_due") {
    return (
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
        <div className="flex items-center justify-center text-sm text-yellow-800">
          <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
          <span>
            Payment failed.{" "}
            <Link to="/billing" className="font-medium underline">
              Update your payment method
            </Link>
          </span>
        </div>
      </div>
    );
  }

  if (user.subscriptionCancelAtPeriodEnd && user.subscriptionCurrentPeriodEnd) {
    const cancelDate = new Date(
      user.subscriptionCurrentPeriodEnd
    ).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    return (
      <div className="bg-orange-50 border-b border-orange-200 px-4 py-2">
        <div className="flex items-center justify-center text-sm text-orange-800">
          <span>
            Your subscription cancels on {cancelDate}.{" "}
            <Link to="/billing" className="font-medium underline">
              Manage subscription
            </Link>
          </span>
        </div>
      </div>
    );
  }

  return null;
};

export default SubscriptionBanner;

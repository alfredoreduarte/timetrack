import React from "react";

const LoadingSpinner: React.FC = () => {
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      data-testid="loading-spinner"
    >
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>
  );
};

export default LoadingSpinner;

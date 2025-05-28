import React from "react";
import Timer from "../components/Timer";

const TimeEntries: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time Entries</h1>
          <p className="text-gray-600">
            View and manage your time tracking records
          </p>
        </div>
        <button className="btn-primary">Add Entry</button>
      </div>

      {/* Quick Timer Section */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Timer</h3>
        <Timer />
      </div>

      <div className="card p-6">
        <div className="text-gray-500 text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No time entries yet
          </h3>
          <p className="text-gray-600 mb-4">
            Start tracking time to see your entries here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TimeEntries;

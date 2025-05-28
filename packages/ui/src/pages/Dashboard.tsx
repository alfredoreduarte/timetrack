import React from "react";
import Timer from "../components/Timer";

const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome to your time tracking dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Current Timer
          </h3>
          <Timer />
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Today's Total
          </h3>
          <div className="text-2xl font-bold text-gray-900">0h 0m</div>
          <p className="text-sm text-gray-600 mt-2">Across all projects</p>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">This Week</h3>
          <div className="text-2xl font-bold text-gray-900">0h 0m</div>
          <p className="text-sm text-gray-600 mt-2">Total time tracked</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Recent Projects
          </h3>
          <div className="text-gray-500 text-center py-8">
            No projects yet. Create your first project to get started.
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Recent Time Entries
          </h3>
          <div className="text-gray-500 text-center py-8">
            No time entries yet. Start tracking time to see your entries here.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

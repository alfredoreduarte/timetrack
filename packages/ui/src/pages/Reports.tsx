import React from "react";

const Reports: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600">Analyze your time tracking data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Time Summary
          </h3>
          <div className="text-gray-500 text-center py-8">
            No data available yet. Start tracking time to see reports.
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Project Breakdown
          </h3>
          <div className="text-gray-500 text-center py-8">
            No projects tracked yet.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;

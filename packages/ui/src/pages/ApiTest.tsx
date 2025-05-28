import React, { useState } from "react";
import { projectsAPI, authAPI, healthAPI } from "../services/api";
import toast from "react-hot-toast";

const ApiTest: React.FC = () => {
  const [testResults, setTestResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const addResult = (
    test: string,
    success: boolean,
    data: any,
    error?: any
  ) => {
    const result = {
      test,
      success,
      data,
      error: error?.message || error,
      timestamp: new Date().toISOString(),
    };
    setTestResults((prev) => [result, ...prev]);
  };

  const testHealth = async () => {
    setLoading(true);
    try {
      const response = await healthAPI.check();
      addResult("Health Check", true, response);
      toast.success("Health check passed");
    } catch (error: any) {
      addResult("Health Check", false, null, error);
      toast.error("Health check failed");
    }
    setLoading(false);
  };

  const testAuth = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        addResult("Auth Check", false, null, "No token found");
        toast.error("No token found - please login first");
        setLoading(false);
        return;
      }

      const response = await authAPI.getCurrentUser();
      addResult("Auth Check", true, response);
      toast.success("Auth check passed");
    } catch (error: any) {
      addResult("Auth Check", false, null, error);
      toast.error("Auth check failed");
    }
    setLoading(false);
  };

  const testFetchProjects = async () => {
    setLoading(true);
    try {
      const response = await projectsAPI.getProjects();
      addResult("Fetch Projects", true, response);
      toast.success(`Fetched ${response.length} projects`);
    } catch (error: any) {
      addResult("Fetch Projects", false, null, error);
      toast.error("Failed to fetch projects");
    }
    setLoading(false);
  };

  const testCreateProject = async () => {
    setLoading(true);
    try {
      const projectData = {
        name: `Test Project ${Date.now()}`,
        description: "This is a test project created from the API test page",
        color: "#3B82F6",
        hourlyRate: 50,
      };

      const response = await projectsAPI.createProject(projectData);
      addResult("Create Project", true, response);
      toast.success("Project created successfully");
    } catch (error: any) {
      addResult("Create Project", false, null, error);
      toast.error("Failed to create project");
      console.error("Create project error:", error);
    }
    setLoading(false);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const getToken = () => {
    return localStorage.getItem("token");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API Test Page</h1>
        <p className="text-gray-600">Test API endpoints and debug issues</p>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Current Status</h2>
        <div className="space-y-2 text-sm">
          <div>
            <strong>API Base URL:</strong> http://localhost:3000/api
          </div>
          <div>
            <strong>Token:</strong>{" "}
            {getToken() ? (
              <span className="text-green-600">
                Present ({getToken()?.substring(0, 20)}...)
              </span>
            ) : (
              <span className="text-red-600">Not found</span>
            )}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">API Tests</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={testHealth}
            disabled={loading}
            className="btn-primary disabled:opacity-50"
          >
            Test Health
          </button>
          <button
            onClick={testAuth}
            disabled={loading}
            className="btn-primary disabled:opacity-50"
          >
            Test Auth
          </button>
          <button
            onClick={testFetchProjects}
            disabled={loading}
            className="btn-primary disabled:opacity-50"
          >
            Fetch Projects
          </button>
          <button
            onClick={testCreateProject}
            disabled={loading}
            className="btn-primary disabled:opacity-50"
          >
            Create Test Project
          </button>
          <button
            onClick={clearResults}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Clear Results
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Test Results</h2>
        {testResults.length === 0 ? (
          <p className="text-gray-500">No tests run yet</p>
        ) : (
          <div className="space-y-4">
            {testResults.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-md border ${
                  result.success
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">
                    {result.test}{" "}
                    <span
                      className={
                        result.success ? "text-green-600" : "text-red-600"
                      }
                    >
                      {result.success ? "✓" : "✗"}
                    </span>
                  </h3>
                  <span className="text-xs text-gray-500">
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {result.data && (
                  <div className="mb-2">
                    <strong>Response:</strong>
                    <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                )}
                {result.error && (
                  <div>
                    <strong className="text-red-600">Error:</strong>
                    <pre className="mt-1 text-xs bg-red-100 p-2 rounded overflow-x-auto text-red-800">
                      {typeof result.error === "string"
                        ? result.error
                        : JSON.stringify(result.error, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiTest;

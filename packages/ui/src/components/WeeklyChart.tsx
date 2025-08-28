import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { DailyData } from "../store/slices/reportsSlice";
import { formatReportsDuration } from "../utils/dateTime";

interface WeeklyChartProps {
  data: DailyData[];
  weekStartDate: string;
  weekEndDate: string;
  loading: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
}

type ChartMode = "hours" | "earnings";

const WeeklyChart: React.FC<WeeklyChartProps> = ({
  data,
  weekStartDate,
  weekEndDate,
  loading,
  onPreviousWeek,
  onNextWeek,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>("hours");

  // Format data for the chart
  const chartData = data.map((day) => ({
    name: new Date(day.date + 'T12:00:00').toLocaleDateString("en-US", {
      weekday: "short",
      month: "numeric",
      day: "numeric",
    }),
    fullDate: day.date,
    hours: Math.round((day.totalDuration / 3600) * 100) / 100, // Convert seconds to hours with 2 decimal places
    earnings: Math.round(day.totalEarnings * 100) / 100, // Round to 2 decimal places
    entryCount: day.entryCount,
    // Keep the original duration in seconds for formatting
    totalDuration: day.totalDuration,
  }));

  // Format week range for display
  const formatWeekRange = () => {
    // Extract just the date part and add time to avoid timezone issues
    const startDateStr = weekStartDate.split('T')[0] + 'T12:00:00';
    const endDateStr = weekEndDate.split('T')[0] + 'T12:00:00';
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    return `${startDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} - ${endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  };

  // Custom tooltip formatter
  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          <p className="text-blue-600">
            Hours: {formatReportsDuration(data.totalDuration)}
          </p>
          <p className="text-green-600">Earnings: ${data.earnings}</p>
          <p className="text-gray-600">Entries: {data.entryCount}</p>
        </div>
      );
    }
    return null;
  };

  // Y-axis formatter
  const formatYAxis = (value: number) => {
    if (chartMode === "hours") {
      return `${value}h`;
    }
    return `$${value}`;
  };

  // Calculate totals for the summary
  const totalDuration = chartData.reduce(
    (sum, day) => sum + day.totalDuration,
    0
  );
  const totalEarnings = chartData.reduce((sum, day) => sum + day.earnings, 0);
  const totalEntries = chartData.reduce((sum, day) => sum + day.entryCount, 0);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header with navigation and mode toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onPreviousWeek}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>

          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">
              Weekly {chartMode === "hours" ? "Hours" : "Earnings"}
            </h3>
            <p className="text-sm text-gray-600">{formatWeekRange()}</p>
          </div>

          <button
            onClick={onNextWeek}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setChartMode("hours")}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              chartMode === "hours"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Hours
          </button>
          <button
            onClick={() => setChartMode("earnings")}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              chartMode === "earnings"
                ? "bg-white text-green-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Earnings
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-80">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxis}
              />
              <Tooltip content={customTooltip} />
              <Bar
                dataKey={chartMode}
                fill={chartMode === "hours" ? "#3B82F6" : "#10B981"}
                radius={[4, 4, 0, 0]}
                maxBarSize={60}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Summary */}
      {!loading && (
        <div className="mt-6 grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {formatReportsDuration(totalDuration)}
            </p>
            <p className="text-sm text-gray-600">Total Hours</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              ${Math.round(totalEarnings * 100) / 100}
            </p>
            <p className="text-sm text-gray-600">Total Earnings</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-600">{totalEntries}</p>
            <p className="text-sm text-gray-600">Total Entries</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyChart;

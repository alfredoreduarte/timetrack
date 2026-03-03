import React from "react";
import { PlayIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { Favorite } from "../store/slices/favoritesSlice";

interface FavoriteCardProps {
  favorite: Favorite;
  onStart: (favorite: Favorite) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const FavoriteCard: React.FC<FavoriteCardProps> = ({
  favorite,
  onStart,
  onRemove,
  disabled = false,
}) => {
  return (
    <div
      className={`card p-3 border-l-4 flex flex-col cursor-pointer hover:shadow-md transition-shadow relative group min-w-[160px] max-w-[200px] ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
      style={{ borderLeftColor: favorite.project?.color || "#6B7280" }}
      onClick={() => {
        if (!disabled) onStart(favorite);
      }}
      title={disabled ? "Stop the current timer first" : "Start timer"}
    >
      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(favorite.id);
        }}
        className="absolute top-1 right-1 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 max-sm:opacity-100 transition-opacity focus:outline-none"
        title="Remove favorite"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>

      {/* Project name */}
      <p className="font-medium text-gray-900 truncate pr-5 text-sm">
        {favorite.project?.name || "Unknown Project"}
      </p>

      {/* Task name */}
      {favorite.task && (
        <p className="text-sm text-gray-500 truncate">
          {favorite.task.name}
        </p>
      )}

      {/* Description */}
      {favorite.description && (
        <p className="text-xs text-gray-400 truncate mt-0.5">
          {favorite.description.length > 25
            ? `${favorite.description.substring(0, 25)}...`
            : favorite.description}
        </p>
      )}

      {/* Play button */}
      <div className="flex justify-end mt-auto pt-1">
        <PlayIcon
          className={`h-5 w-5 ${
            disabled ? "text-gray-400" : "text-green-500"
          }`}
        />
      </div>
    </div>
  );
};

export default FavoriteCard;

import React, { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { StarIcon as StarOutline } from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import { AppDispatch, RootState } from "../store";
import {
  createFavorite,
  deleteFavorite,
  Favorite,
} from "../store/slices/favoritesSlice";

interface FavoriteButtonProps {
  projectId: string;
  taskId?: string | null;
  description?: string | null;
}

const MAX_FAVORITES = 5;

const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  projectId,
  taskId,
  description,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { favorites } = useSelector((state: RootState) => state.favorites);
  const [pending, setPending] = useState(false);

  // Normalize for comparison
  const normalizedTaskId = taskId || undefined;
  const normalizedDescription = description?.trim() || undefined;

  // Find matching favorite
  const matchingFavorite = favorites.find((f: Favorite) => {
    const fTaskId = f.taskId || undefined;
    const fDescription = f.description?.trim() || undefined;
    return (
      f.projectId === projectId &&
      fTaskId === normalizedTaskId &&
      fDescription === normalizedDescription
    );
  });

  const isFavorited = !!matchingFavorite;
  const atLimit = favorites.length >= MAX_FAVORITES;

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (pending) return;

      setPending(true);
      try {
        if (isFavorited && matchingFavorite) {
          await dispatch(deleteFavorite(matchingFavorite.id)).unwrap();
        } else if (!atLimit) {
          await dispatch(
            createFavorite({
              projectId,
              taskId: normalizedTaskId,
              description: normalizedDescription,
            })
          ).unwrap();
        }
      } catch {
        // Error handled by Redux
      } finally {
        setPending(false);
      }
    },
    [
      dispatch,
      isFavorited,
      matchingFavorite,
      atLimit,
      projectId,
      normalizedTaskId,
      normalizedDescription,
      pending,
    ]
  );

  const isDisabled = pending || (!isFavorited && atLimit);

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`p-1 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 rounded transition-colors ${
        isDisabled && !isFavorited
          ? "opacity-50 cursor-not-allowed"
          : "hover:scale-110"
      }`}
      title={
        isFavorited
          ? "Remove from favorites"
          : atLimit
            ? "Maximum 5 favorites reached"
            : "Add to favorites"
      }
    >
      {isFavorited ? (
        <StarSolid className="h-5 w-5 text-yellow-400" />
      ) : (
        <StarOutline className="h-5 w-5 text-gray-400 hover:text-yellow-400" />
      )}
    </button>
  );
};

export default FavoriteButton;

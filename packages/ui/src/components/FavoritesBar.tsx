import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { PlusIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/outline";
import { AppDispatch, RootState } from "../store";
import {
  fetchFavorites,
  deleteFavorite,
  Favorite,
  MAX_FAVORITES,
} from "../store/slices/favoritesSlice";
import { useTimer } from "../hooks/useTimer";
import FavoriteCard from "./FavoriteCard";
import AddFavoriteModal from "./AddFavoriteModal";

const FavoritesBar: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { favorites, loading } = useSelector(
    (state: RootState) => state.favorites
  );
  const { isRunning, startTimer } = useTimer();
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    dispatch(fetchFavorites());
  }, [dispatch]);

  const handleStart = async (favorite: Favorite) => {
    if (isRunning) return;
    try {
      await startTimer({
        projectId: favorite.projectId,
        taskId: favorite.taskId || undefined,
        description: favorite.description || undefined,
      });
    } catch {
      // Error handled by useTimer
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await dispatch(deleteFavorite(id)).unwrap();
    } catch {
      // Error handled by Redux
    }
  };

  if (loading) {
    // Skeleton placeholders
    return (
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Favorites</h3>
        </div>
        <div className="p-6">
          <div className="flex gap-3 overflow-x-auto">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="min-w-[160px] max-w-[200px] h-24 bg-gray-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Favorites</h3>
        </div>
        <div className="p-6">
          {favorites.length === 0 ? (
            // Empty state
            <div className="text-center py-6">
              <StarIcon className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-3">
                Pin your most-used timers here for one-click start.
                <br />
                Star a recent entry below, or add one manually.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-primary inline-flex items-center gap-1 px-4 py-2 text-sm"
              >
                <PlusIcon className="h-4 w-4" />
                Add Favorite
              </button>
            </div>
          ) : (
            // Favorites grid
            <div className="flex gap-3 overflow-x-auto pb-1">
              {favorites.map((favorite: Favorite) => (
                <FavoriteCard
                  key={favorite.id}
                  favorite={favorite}
                  onStart={handleStart}
                  onRemove={handleRemove}
                  disabled={isRunning}
                />
              ))}
              {favorites.length < MAX_FAVORITES && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="min-w-[48px] flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors"
                  title="Add favorite"
                >
                  <PlusIcon className="h-6 w-6 text-gray-400" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <AddFavoriteModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />
    </>
  );
};

export default FavoritesBar;

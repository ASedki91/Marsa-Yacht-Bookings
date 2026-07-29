import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  addWishlistItem,
  getListWishlistIdsQueryKey,
  getListWishlistQueryKey,
  removeWishlistItem,
  useListWishlistIds,
} from "@workspace/api-client-react";

interface WishlistIdsData {
  yachtIds: string[];
}

export function useWishlist() {
  const queryClient = useQueryClient();
  const query = useListWishlistIds();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const ids = useMemo(
    () => new Set((query.data as WishlistIdsData | undefined)?.yachtIds ?? []),
    [query.data],
  );

  const toggle = useCallback(
    async (yachtId: string) => {
      if (pendingIds.has(yachtId)) return;

      const queryKey = getListWishlistIdsQueryKey();
      const previous =
        queryClient.getQueryData<WishlistIdsData>(queryKey) ??
        ({ yachtIds: [...ids] } satisfies WishlistIdsData);
      const wasSaved = previous.yachtIds.includes(yachtId);
      const nextIds = wasSaved
        ? previous.yachtIds.filter((id) => id !== yachtId)
        : [...previous.yachtIds, yachtId];

      setPendingIds((current) => new Set(current).add(yachtId));
      queryClient.setQueryData<WishlistIdsData>(queryKey, { yachtIds: nextIds });

      try {
        if (wasSaved) {
          await removeWishlistItem(yachtId);
        } else {
          await addWishlistItem(yachtId);
        }
      } catch (error) {
        queryClient.setQueryData(queryKey, previous);
        throw error;
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(yachtId);
          return next;
        });
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({ queryKey: getListWishlistQueryKey() });
      }
    },
    [ids, pendingIds, queryClient],
  );

  return {
    ids,
    isLoading: query.isLoading,
    isPending: (yachtId: string) => pendingIds.has(yachtId),
    toggle,
    refetch: query.refetch,
  };
}

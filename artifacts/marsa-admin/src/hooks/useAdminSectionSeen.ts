import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  adminMarkSectionSeen,
  getAdminGetUnseenCountsQueryKey,
} from "@workspace/api-client-react";

export function useAdminSectionSeen(
  sectionKey: string,
  initialQuerySucceeded: boolean,
) {
  const queryClient = useQueryClient();
  const lastMarked = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!initialQuerySucceeded || lastMarked.current === sectionKey) return;
    lastMarked.current = sectionKey;

    adminMarkSectionSeen(sectionKey)
      .then(() => {
        queryClient.setQueryData(
          getAdminGetUnseenCountsQueryKey(),
          (current: any) => ({
            ...(current ?? { counts: {} }),
            counts: {
              ...(current?.counts ?? {}),
              [sectionKey]: 0,
            },
          }),
        );
      })
      .catch(() => {
        lastMarked.current = undefined;
      });
  }, [initialQuerySucceeded, queryClient, sectionKey]);
}

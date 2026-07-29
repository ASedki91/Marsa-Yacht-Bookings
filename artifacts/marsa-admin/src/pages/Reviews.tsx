import { useState } from "react";
import {
  useAdminListReviews,
  useAdminModerateReview,
  getAdminListReviewsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAdminSectionSeen } from "@/hooks/useAdminSectionSeen";
import { Star, CheckCircle, EyeOff } from "lucide-react";

const statusBadge: Record<string, React.ReactNode> = {
  pending: (
    <Badge
      variant="outline"
      className="text-amber-400 border-amber-400/40 text-xs"
    >
      Pending Review
    </Badge>
  ),
  approved: (
    <Badge
      variant="outline"
      className="text-green-400 border-green-400/40 text-xs"
    >
      Approved
    </Badge>
  ),
  rejected: (
    <Badge variant="outline" className="text-red-400 border-red-400/40 text-xs">
      Rejected
    </Badge>
  ),
  hidden: (
    <Badge
      variant="outline"
      className="text-muted-foreground border-muted/40 text-xs"
    >
      Hidden
    </Badge>
  ),
};

export default function Reviews() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isSuccess } = useAdminListReviews({
    query: { queryKey: getAdminListReviewsQueryKey() },
  });
  useAdminSectionSeen("reviews", isSuccess);

  const moderate = useAdminModerateReview({
    mutation: {
      onSuccess: () => {
        toast({ title: "Review moderated" });
        qc.invalidateQueries({ queryKey: getAdminListReviewsQueryKey() });
      },
      onError: () =>
        toast({ title: "Failed to moderate review", variant: "destructive" }),
    },
  });

  const allReviews = (data as any)?.reviews ?? [];
  const reviews =
    statusFilter === "all"
      ? allReviews
      : allReviews.filter(
          (r: any) => (r.status ?? "approved") === statusFilter,
        );

  const pendingCount = allReviews.filter(
    (r: any) => (r.status ?? "approved") === "pending",
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          Reviews
          {pendingCount > 0 && statusFilter !== "pending" && (
            <Badge
              variant="outline"
              className="text-amber-400 border-amber-400/40 text-xs"
            >
              {pendingCount} pending
            </Badge>
          )}
        </h1>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-review-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {statusFilter === "pending" && reviews.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3">
          Reviews pending moderation — approve to make public, or hide to
          suppress without deleting.
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          No reviews found
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.map((r: any) => {
            const status = r.status ?? "approved";
            return (
              <Card key={r.id} data-testid={`card-review-${r.id}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex" aria-label={`${r.rating} stars`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${i < r.rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`}
                            />
                          ))}
                        </div>
                        {statusBadge[status]}
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">
                        {r.comment}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Booking:{" "}
                        <span className="font-mono">
                          {r.bookingId?.slice(0, 8)}
                        </span>
                        {r.reviewerId && (
                          <>
                            {" "}
                            · Reviewer:{" "}
                            <span className="font-mono">
                              {r.reviewerId.slice(0, 8)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 ml-4 shrink-0">
                      {status !== "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-400 border-green-400/40 hover:bg-green-400/10 h-7 text-xs"
                          data-testid={`button-approve-review-${r.id}`}
                          onClick={() =>
                            moderate.mutate({
                              id: r.id,
                              data: { status: "approved" },
                            })
                          }
                          disabled={moderate.isPending}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                      )}
                      {status !== "hidden" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-muted-foreground border-muted/40 hover:bg-muted/20 h-7 text-xs"
                          data-testid={`button-hide-review-${r.id}`}
                          onClick={() =>
                            moderate.mutate({
                              id: r.id,
                              data: { status: "hidden" },
                            })
                          }
                          disabled={moderate.isPending}
                        >
                          <EyeOff className="w-3 h-3 mr-1" />
                          Hide
                        </Button>
                      )}
                      {status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-400 border-red-400/40 hover:bg-red-400/10 h-7 text-xs"
                          data-testid={`button-reject-review-${r.id}`}
                          onClick={() =>
                            moderate.mutate({
                              id: r.id,
                              data: { status: "rejected" },
                            })
                          }
                          disabled={moderate.isPending}
                        >
                          Reject
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

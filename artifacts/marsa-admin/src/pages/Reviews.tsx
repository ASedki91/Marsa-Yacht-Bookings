import { useState } from "react";
import {
  useAdminListReviews, useAdminModerateReview,
  getAdminListReviewsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Star, CheckCircle, Trash2 } from "lucide-react";

export default function Reviews() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useAdminListReviews({
    query: { queryKey: getAdminListReviewsQueryKey() }
  });

  const moderate = useAdminModerateReview({
    mutation: {
      onSuccess: () => {
        toast({ title: "Review moderated" });
        qc.invalidateQueries({ queryKey: getAdminListReviewsQueryKey() });
      },
      onError: () => toast({ title: "Failed to moderate review", variant: "destructive" }),
    }
  });

  const reviews = (data as any)?.reviews ?? [];

  const statusBadge: Record<string, React.ReactNode> = {
    pending: <Badge variant="outline" className="text-amber-400 border-amber-400/40 text-xs">Pending</Badge>,
    approved: <Badge variant="outline" className="text-green-400 border-green-400/40 text-xs">Approved</Badge>,
    removed: <Badge variant="outline" className="text-muted-foreground border-muted/40 text-xs">Removed</Badge>,
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-6">Reviews</h1>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : reviews.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No reviews found</div>
      ) : (
        <div className="space-y-2">
          {reviews.map((r: any) => (
            <Card key={r.id} data-testid={`card-review-${r.id}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-3 h-3 ${i < r.rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
                        ))}
                      </div>
                      {statusBadge[r.status ?? "approved"]}
                      <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">{r.comment}</p>
                    <p className="text-xs text-muted-foreground mt-1">Booking: {r.bookingId?.slice(0, 8)}</p>
                  </div>
                  <div className="flex gap-2 ml-4 shrink-0">
                    {r.status !== "approved" && (
                      <Button size="sm" variant="outline" className="text-green-400 border-green-400/40 hover:bg-green-400/10"
                        data-testid={`button-approve-review-${r.id}`}
                        onClick={() => moderate.mutate({ id: r.id, data: { action: "approve" } })}
                        disabled={moderate.isPending}>
                        <CheckCircle className="w-3 h-3 mr-1" />Approve
                      </Button>
                    )}
                    {r.status !== "removed" && (
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                        data-testid={`button-remove-review-${r.id}`}
                        onClick={() => moderate.mutate({ id: r.id, data: { action: "remove" } })}
                        disabled={moderate.isPending}>
                        <Trash2 className="w-3 h-3 mr-1" />Remove
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

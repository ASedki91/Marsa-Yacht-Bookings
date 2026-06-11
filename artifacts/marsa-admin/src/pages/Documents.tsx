import { useState } from "react";
import {
  useAdminListDocuments, useAdminReviewDocument,
  getAdminListDocumentsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock, ExternalLink, MessageSquare } from "lucide-react";

type DocAction = "approved" | "rejected" | "pending";

const statusBadge: Record<string, React.ReactNode> = {
  pending: <Badge variant="outline" className="text-amber-400 border-amber-400/40"><Clock className="w-3 h-3 mr-1" />Pending</Badge>,
  approved: <Badge variant="outline" className="text-green-400 border-green-400/40"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>,
  rejected: <Badge variant="outline" className="text-destructive border-destructive/40"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>,
};

const docTypeLabels: Record<string, string> = {
  national_id: "National ID",
  yacht_ownership: "Yacht Ownership",
  yacht_license: "Yacht License",
  insurance: "Insurance",
};

export default function Documents() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [dialog, setDialog] = useState<{ id: string; action: DocAction } | null>(null);
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const params = statusFilter !== "all" ? { status: statusFilter as any } : {};
  const { data, isLoading } = useAdminListDocuments(params, {
    query: { queryKey: getAdminListDocumentsQueryKey(params) }
  });

  const review = useAdminReviewDocument({
    mutation: {
      onSuccess: () => {
        const msg = dialog?.action === "approved" ? "Document approved"
          : dialog?.action === "rejected" ? "Document rejected"
          : "More information requested";
        toast({ title: msg });
        qc.invalidateQueries({ queryKey: getAdminListDocumentsQueryKey() });
        setDialog(null);
        setReason("");
      },
      onError: () => toast({ title: "Failed to update document", variant: "destructive" }),
    }
  });

  const docs = (data as any)?.documents ?? [];

  const dialogTitle = dialog?.action === "approved" ? "Approve Document"
    : dialog?.action === "rejected" ? "Reject Document"
    : "Request More Information";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Documents</h1>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-doc-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : docs.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No documents found</div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc: any) => (
            <Card key={doc.id} data-testid={`card-doc-${doc.id}`}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm">{docTypeLabels[doc.documentType] ?? doc.documentType}</span>
                    {statusBadge[doc.status]}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">Host: {doc.hostId?.slice(0, 8)}</span>
                    {doc.fileUrl && (
                      <a href={doc.fileUrl} target="_blank" rel="noreferrer"
                        className="text-xs text-primary flex items-center gap-1 hover:underline">
                        <ExternalLink className="w-3 h-3" />View file
                      </a>
                    )}
                    {doc.reviewedAt && (
                      <span className="text-xs text-muted-foreground">
                        Reviewed {new Date(doc.reviewedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                {doc.status === "pending" && (
                  <div className="flex gap-2 ml-4 shrink-0">
                    <Button size="sm" variant="outline" className="text-green-400 border-green-400/40 hover:bg-green-400/10"
                      data-testid={`button-approve-doc-${doc.id}`}
                      onClick={() => setDialog({ id: doc.id, action: "approved" })}>Approve</Button>
                    <Button size="sm" variant="outline" className="text-blue-400 border-blue-400/40 hover:bg-blue-400/10"
                      data-testid={`button-info-doc-${doc.id}`}
                      onClick={() => setDialog({ id: doc.id, action: "pending" })}>
                      <MessageSquare className="w-3 h-3 mr-1" />Request Info
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                      data-testid={`button-reject-doc-${doc.id}`}
                      onClick={() => setDialog({ id: doc.id, action: "rejected" })}>Reject</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={() => { setDialog(null); setReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="doc-reason">
              {dialog?.action === "pending" ? "What information is needed? (required)" : "Reason (optional)"}
            </Label>
            <Textarea
              id="doc-reason"
              data-testid="textarea-doc-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder={
                dialog?.action === "pending"
                  ? "Describe what additional information or documents are needed..."
                  : "Reason..."
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setReason(""); }}>Cancel</Button>
            <Button
              data-testid="button-confirm-doc-action"
              variant={dialog?.action === "approved" ? "default" : dialog?.action === "pending" ? "outline" : "destructive"}
              disabled={review.isPending || (dialog?.action === "pending" && !reason.trim())}
              onClick={() => dialog && review.mutate({ id: dialog.id, data: { status: dialog.action, reason: reason || undefined } })}
            >
              {review.isPending ? "Processing..."
                : dialog?.action === "approved" ? "Approve"
                : dialog?.action === "pending" ? "Send Request"
                : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

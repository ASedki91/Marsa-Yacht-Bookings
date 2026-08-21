import { useState } from "react";
import {
  useAdminListDocuments,
  useAdminReviewDocument,
  getAdminListDocumentsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAdminSectionSeen } from "@/hooks/useAdminSectionSeen";
import {
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  FileText,
  Image,
} from "lucide-react";

const hostDocumentObjectPath = /^\/objects\/uploads\/[A-Za-z0-9_-]+$/;

function getSafeDocumentUrl(url: string): string | null {
  return hostDocumentObjectPath.test(url) ? `/api/storage${url}` : null;
}

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|$)/i.test(url);
}

function DocPreview({ url }: { url: string }) {
  if (!url) return null;
  const safeUrl = getSafeDocumentUrl(url);
  if (!safeUrl) {
    return (
      <div className="mt-2 flex items-center gap-2 p-2.5 rounded-md border border-border bg-muted/30 max-w-xs">
        <FileText className="w-6 h-6 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          Document link unavailable
        </p>
      </div>
    );
  }
  if (isImageUrl(url)) {
    return (
      <div className="mt-2 rounded-md overflow-hidden border border-border max-w-xs">
        <img
          src={safeUrl}
          alt="Document preview"
          className="w-full object-cover max-h-48"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2 p-2.5 rounded-md border border-border bg-muted/30 max-w-xs">
      <FileText className="w-6 h-6 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-foreground truncate">
          {url.split("/").pop() ?? "Document"}
        </p>
        <a
          href={safeUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
        >
          <ExternalLink className="w-3 h-3" />
          Open in new tab
        </a>
      </div>
    </div>
  );
}

type DocAction = "approved" | "rejected" | "request_info";

const statusBadge: Record<string, React.ReactNode> = {
  pending: (
    <Badge variant="outline" className="text-amber-400 border-amber-400/40">
      <Clock className="w-3 h-3 mr-1" />
      Pending
    </Badge>
  ),
  approved: (
    <Badge variant="outline" className="text-green-400 border-green-400/40">
      <CheckCircle className="w-3 h-3 mr-1" />
      Approved
    </Badge>
  ),
  rejected: (
    <Badge variant="outline" className="text-destructive border-destructive/40">
      <XCircle className="w-3 h-3 mr-1" />
      Rejected
    </Badge>
  ),
};

const docTypeLabels: Record<string, string> = {
  national_id: "National ID",
  yacht_ownership: "Yacht Ownership",
  yacht_license: "Yacht License",
  insurance: "Insurance",
};

export default function Documents() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [dialog, setDialog] = useState<{
    id: string;
    action: DocAction;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const params = statusFilter !== "all" ? { status: statusFilter as any } : {};
  const { data, isLoading, isSuccess } = useAdminListDocuments(params, {
    query: { queryKey: getAdminListDocumentsQueryKey(params) },
  });
  useAdminSectionSeen("documents", isSuccess);

  const onMutateSuccess = (msg: string) => {
    toast({ title: msg });
    qc.invalidateQueries({ queryKey: getAdminListDocumentsQueryKey() });
    setDialog(null);
    setReason("");
  };
  const onMutateError = () =>
    toast({ title: "Failed to update document", variant: "destructive" });

  const review = useAdminReviewDocument({
    mutation: {
      onSuccess: () =>
        onMutateSuccess(
          dialog?.action === "approved"
            ? "Document approved"
            : "Document rejected",
        ),
      onError: onMutateError,
    },
  });

  const requestInfo = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) =>
      customFetch<unknown>(`/api/admin/documents/${id}/request-info`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => onMutateSuccess("Information requested"),
    onError: onMutateError,
  });

  const docs = (data as any)?.documents ?? [];
  const anyPending = review.isPending || requestInfo.isPending;

  const dialogTitle =
    dialog?.action === "approved"
      ? "Approve Document"
      : dialog?.action === "rejected"
        ? "Reject Document"
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
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          No documents found
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc: any) => {
            const isExpanded = expandedId === doc.id;
            return (
              <Card key={doc.id} data-testid={`card-doc-${doc.id}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <button
                      className="min-w-0 text-left flex items-start gap-2 flex-1"
                      onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                      data-testid={`expand-doc-${doc.id}`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground text-sm">
                            {docTypeLabels[doc.documentType] ??
                              doc.documentType}
                          </span>
                          {statusBadge[doc.status]}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            Host: {doc.hostId?.slice(0, 8)}
                          </span>
                          {doc.fileUrl && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              {isImageUrl(doc.fileUrl) ? (
                                <Image className="w-3 h-3" />
                              ) : (
                                <FileText className="w-3 h-3" />
                              )}
                              {isImageUrl(doc.fileUrl) ? "Image" : "Document"}
                            </span>
                          )}
                          {doc.reviewedAt && (
                            <span className="text-xs text-muted-foreground">
                              Reviewed{" "}
                              {new Date(doc.reviewedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    {doc.status === "pending" && (
                      <div className="flex gap-2 ml-4 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-400 border-green-400/40 hover:bg-green-400/10"
                          data-testid={`button-approve-doc-${doc.id}`}
                          onClick={() =>
                            setDialog({ id: doc.id, action: "approved" })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-400 border-blue-400/40 hover:bg-blue-400/10"
                          data-testid={`button-info-doc-${doc.id}`}
                          onClick={() =>
                            setDialog({ id: doc.id, action: "request_info" })
                          }
                        >
                          <MessageSquare className="w-3 h-3 mr-1" />
                          Request Info
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/40 hover:bg-destructive/10"
                          data-testid={`button-reject-doc-${doc.id}`}
                          onClick={() =>
                            setDialog({ id: doc.id, action: "rejected" })
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                  {isExpanded && doc.fileUrl && (
                    <DocPreview url={doc.fileUrl} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!dialog}
        onOpenChange={() => {
          setDialog(null);
          setReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="doc-reason">
              {dialog?.action === "request_info"
                ? "What information is needed? (required)"
                : "Reason (optional)"}
            </Label>
            <Textarea
              id="doc-reason"
              data-testid="textarea-doc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={
                dialog?.action === "request_info"
                  ? "Describe what additional information or documents are needed..."
                  : "Reason..."
              }
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialog(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-doc-action"
              variant={
                dialog?.action === "approved"
                  ? "default"
                  : dialog?.action === "request_info"
                    ? "outline"
                    : "destructive"
              }
              disabled={
                anyPending ||
                (dialog?.action === "request_info" && !reason.trim())
              }
              onClick={() => {
                if (!dialog) return;
                if (dialog.action === "request_info") {
                  requestInfo.mutate({ id: dialog.id, message: reason });
                } else {
                  review.mutate({
                    id: dialog.id,
                    data: {
                      status: dialog.action as "approved" | "rejected",
                      reason: reason || undefined,
                    },
                  });
                }
              }}
            >
              {anyPending
                ? "Processing..."
                : dialog?.action === "approved"
                  ? "Approve"
                  : dialog?.action === "request_info"
                    ? "Send Request"
                    : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

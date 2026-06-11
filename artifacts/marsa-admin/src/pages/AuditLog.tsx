import { useState, useCallback } from "react";
import {
  useAdminListAuditLogs, getAdminListAuditLogsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollText, Download } from "lucide-react";

const entityColor: Record<string, string> = {
  host: "text-blue-400 border-blue-400/40",
  host_profile: "text-blue-400 border-blue-400/40",
  yacht: "text-green-400 border-green-400/40",
  booking: "text-purple-400 border-purple-400/40",
  user: "text-amber-400 border-amber-400/40",
  withdrawal_request: "text-orange-400 border-orange-400/40",
  review: "text-pink-400 border-pink-400/40",
  host_document: "text-cyan-400 border-cyan-400/40",
};

function exportCsv(logs: any[]) {
  const header = ["id", "action", "entityType", "entityId", "userId", "createdAt", "details"].join(",");
  const rows = logs.map(log =>
    [
      log.id,
      log.action,
      log.entityType,
      log.entityId ?? "",
      log.userId ?? "",
      log.createdAt,
      JSON.stringify(log.details ?? {}).replace(/,/g, ";"),
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLog() {
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const params: any = { page };
  if (actionFilter.trim()) params.action = actionFilter.trim();
  if (entityFilter.trim()) params.entityType = entityFilter.trim();
  if (userFilter.trim()) params.userId = userFilter.trim();
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;

  const { data, isLoading } = useAdminListAuditLogs(params, {
    query: { queryKey: getAdminListAuditLogsQueryKey(params) }
  });

  const logs: any[] = (data as any)?.logs ?? [];
  const total = (data as any)?.total ?? 0;

  const resetFilters = useCallback(() => {
    setActionFilter(""); setEntityFilter(""); setUserFilter(""); setDateFrom(""); setDateTo(""); setPage(1);
  }, []);

  const hasFilters = actionFilter || entityFilter || userFilter || dateFrom || dateTo;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ScrollText className="w-5 h-5" />
          Audit Log
          <span className="text-sm font-normal text-muted-foreground">({total})</span>
        </h1>
        <Button
          size="sm"
          variant="outline"
          data-testid="button-export-csv"
          onClick={() => exportCsv(logs)}
          disabled={logs.length === 0}
        >
          <Download className="w-3 h-3 mr-1" />Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
        <div>
          <Label className="text-xs text-muted-foreground">Action</Label>
          <Input
            data-testid="input-audit-action"
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            placeholder="e.g. approve"
            className="h-8 text-sm mt-0.5"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Entity Type</Label>
          <Input
            data-testid="input-audit-entity"
            value={entityFilter}
            onChange={e => { setEntityFilter(e.target.value); setPage(1); }}
            placeholder="e.g. host"
            className="h-8 text-sm mt-0.5"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Admin User ID</Label>
          <Input
            data-testid="input-audit-user"
            value={userFilter}
            onChange={e => { setUserFilter(e.target.value); setPage(1); }}
            placeholder="User ID..."
            className="h-8 text-sm mt-0.5"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">From Date</Label>
          <Input
            data-testid="input-audit-date-from"
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="h-8 text-sm mt-0.5"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">To Date</Label>
          <Input
            data-testid="input-audit-date-to"
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="h-8 text-sm mt-0.5"
          />
        </div>
      </div>
      {hasFilters && (
        <button onClick={resetFilters} data-testid="button-clear-filters"
          className="text-xs text-primary hover:underline mb-3 block">
          Clear all filters
        </button>
      )}

      {isLoading ? (
        <div className="space-y-1.5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : logs.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No audit log entries found</div>
      ) : (
        <>
          <div className="space-y-1.5">
            {logs.map((log: any) => (
              <Card key={log.id} data-testid={`card-audit-${log.id}`} className="border-muted/30">
                <CardContent className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="outline" className={`text-xs shrink-0 ${entityColor[log.entityType] ?? "text-muted-foreground border-muted/40"}`}>
                      {log.entityType?.replace(/_/g, " ")}
                    </Badge>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">{log.action}</span>
                      {log.entityId && (
                        <span className="text-xs text-muted-foreground ml-2 font-mono">{log.entityId.slice(0, 8)}</span>
                      )}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-sm">
                          {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className="text-xs text-muted-foreground font-mono">{log.userId?.slice(0, 8) ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {total > 100 && (
            <div className="flex justify-between items-center mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                data-testid="button-audit-prev"
                className="text-sm text-muted-foreground disabled:opacity-50 hover:text-foreground">
                &larr; Previous
              </button>
              <span className="text-sm text-muted-foreground">Page {page} · {total} total</span>
              <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 100}
                data-testid="button-audit-next"
                className="text-sm text-muted-foreground disabled:opacity-50 hover:text-foreground">
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

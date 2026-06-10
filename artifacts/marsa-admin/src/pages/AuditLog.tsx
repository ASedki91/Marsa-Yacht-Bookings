import { useState } from "react";
import {
  useAdminListAuditLogs, getAdminListAuditLogsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";

const entityColor: Record<string, string> = {
  host: "text-blue-400 border-blue-400/40",
  yacht: "text-green-400 border-green-400/40",
  booking: "text-purple-400 border-purple-400/40",
  user: "text-amber-400 border-amber-400/40",
  withdrawal: "text-orange-400 border-orange-400/40",
  review: "text-pink-400 border-pink-400/40",
};

export default function AuditLog() {
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [page, setPage] = useState(1);

  const params: any = { page };
  if (actionFilter) params.action = actionFilter;
  if (entityFilter) params.entity = entityFilter;

  const { data, isLoading } = useAdminListAuditLogs(params, {
    query: { queryKey: getAdminListAuditLogsQueryKey(params) }
  });

  const logs = (data as any)?.logs ?? [];
  const total = (data as any)?.total ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ScrollText className="w-5 h-5" />
          Audit Log
          <span className="text-sm font-normal text-muted-foreground">({total})</span>
        </h1>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          data-testid="input-audit-action"
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          placeholder="Filter by action..."
          className="max-w-[180px] h-8 text-sm"
        />
        <Input
          data-testid="input-audit-entity"
          value={entityFilter}
          onChange={e => { setEntityFilter(e.target.value); setPage(1); }}
          placeholder="Filter by entity..."
          className="max-w-[180px] h-8 text-sm"
        />
      </div>

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
                      {log.entityType}
                    </Badge>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">{log.action}</span>
                      {log.entityId && (
                        <span className="text-xs text-muted-foreground ml-2 font-mono">{log.entityId.slice(0, 8)}</span>
                      )}
                      {log.details && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{JSON.stringify(log.details)}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className="text-xs text-muted-foreground">{log.adminId?.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {total > 50 && (
            <div className="flex justify-between items-center mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                data-testid="button-audit-prev"
                className="text-sm text-muted-foreground disabled:opacity-50 hover:text-foreground">← Previous</button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 50}
                data-testid="button-audit-next"
                className="text-sm text-muted-foreground disabled:opacity-50 hover:text-foreground">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

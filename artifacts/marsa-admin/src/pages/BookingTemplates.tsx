import { useState } from "react";
import {
  useAdminListBookingTemplates, useAdminCreateBookingTemplate,
  useAdminUpdateBookingTemplate, useAdminDeleteBookingTemplate,
  getAdminListBookingTemplatesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";

type FormState = { name: string; description: string; durationHours: string };
const empty: FormState = { name: "", description: "", durationHours: "" };

export default function BookingTemplates() {
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useAdminListBookingTemplates({
    query: { queryKey: getAdminListBookingTemplatesQueryKey() }
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: getAdminListBookingTemplatesQueryKey() });
  const onErr = () => toast({ title: "Operation failed", variant: "destructive" });

  const create = useAdminCreateBookingTemplate({ mutation: { onSuccess: () => { toast({ title: "Template created" }); invalidate(); setDialog(null); setForm(empty); }, onError: onErr } });
  const update = useAdminUpdateBookingTemplate({ mutation: { onSuccess: () => { toast({ title: "Template updated" }); invalidate(); setDialog(null); }, onError: onErr } });
  const del = useAdminDeleteBookingTemplate({ mutation: { onSuccess: () => { toast({ title: "Template deleted" }); invalidate(); setDeleteId(null); }, onError: onErr } });

  const templates = (data as any)?.templates ?? [];

  const handleSave = () => {
    if (!form.name.trim()) return;
    const payload = { name: form.name, description: form.description, durationHours: parseFloat(form.durationHours) || 0 };
    if (dialog?.mode === "create") create.mutate({ data: payload });
    else if (dialog?.id) update.mutate({ id: dialog.id, data: payload });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Booking Templates</h1>
        <Button size="sm" data-testid="button-add-template" onClick={() => { setForm(empty); setDialog({ mode: "create" }); }}>
          <Plus className="w-4 h-4 mr-1" />Add Template
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : templates.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No templates yet</div>
      ) : (
        <div className="space-y-2">
          {templates.map((t: any) => (
            <Card key={t.id} data-testid={`card-template-${t.id}`}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />{t.durationHours}h{t.description && ` · ${t.description}`}
                  </p>
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <Button size="sm" variant="ghost" data-testid={`button-edit-template-${t.id}`}
                    onClick={() => { setForm({ name: t.name, description: t.description ?? "", durationHours: String(t.durationHours ?? "") }); setDialog({ mode: "edit", id: t.id }); }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    data-testid={`button-delete-template-${t.id}`}
                    onClick={() => setDeleteId(t.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === "create" ? "Add Template" : "Edit Template"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input data-testid="input-template-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Half Day" className="mt-1" /></div>
            <div><Label>Duration (hours)</Label><Input data-testid="input-template-hours" type="number" value={form.durationHours} onChange={e => setForm(f => ({ ...f, durationHours: e.target.value }))} placeholder="4" className="mt-1" /></div>
            <div><Label>Description</Label><Textarea data-testid="input-template-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button data-testid="button-save-template" disabled={!form.name.trim() || create.isPending || update.isPending} onClick={handleSave}>
              {create.isPending || update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Template</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">This will permanently delete the template.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" data-testid="button-confirm-delete-template" disabled={del.isPending} onClick={() => deleteId && del.mutate({ id: deleteId })}>
              {del.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

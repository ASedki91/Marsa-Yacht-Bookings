import { useState } from "react";
import {
  useAdminListAddOns, useAdminCreateAddOn, useAdminUpdateAddOn, useAdminDeleteAddOn,
  getAdminListAddOnsQueryKey
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
import { Plus, Pencil, Trash2 } from "lucide-react";

type FormState = { name: string; description: string; priceEgp: string };
const empty: FormState = { name: "", description: "", priceEgp: "" };

export default function AddOns() {
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useAdminListAddOns({
    query: { queryKey: getAdminListAddOnsQueryKey() }
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: getAdminListAddOnsQueryKey() });
  const onErr = () => toast({ title: "Operation failed", variant: "destructive" });

  const create = useAdminCreateAddOn({ mutation: { onSuccess: () => { toast({ title: "Add-on created" }); invalidate(); setDialog(null); setForm(empty); }, onError: onErr } });
  const update = useAdminUpdateAddOn({ mutation: { onSuccess: () => { toast({ title: "Add-on updated" }); invalidate(); setDialog(null); }, onError: onErr } });
  const del = useAdminDeleteAddOn({ mutation: { onSuccess: () => { toast({ title: "Add-on deleted" }); invalidate(); setDeleteId(null); }, onError: onErr } });

  const addOns = (data as any)?.addOns ?? [];

  const handleSave = () => {
    if (!form.name.trim()) return;
    const payload = { name: form.name, description: form.description, priceEgp: form.priceEgp };
    if (dialog?.mode === "create") create.mutate({ data: payload });
    else if (dialog?.id) update.mutate({ id: dialog.id, data: payload });
  };

  const formatEgp = (v: string | number) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return `EGP ${n.toLocaleString("en-EG", { maximumFractionDigits: 0 })}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Add-ons</h1>
        <Button size="sm" data-testid="button-add-addon" onClick={() => { setForm(empty); setDialog({ mode: "create" }); }}>
          <Plus className="w-4 h-4 mr-1" />Add Add-on
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : addOns.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No add-ons yet</div>
      ) : (
        <div className="space-y-2">
          {addOns.map((a: any) => (
            <Card key={a.id} data-testid={`card-addon-${a.id}`}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{formatEgp(a.priceEgp ?? 0)}{a.description && ` · ${a.description}`}</p>
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <Button size="sm" variant="ghost" data-testid={`button-edit-addon-${a.id}`}
                    onClick={() => { setForm({ name: a.name, description: a.description ?? "", priceEgp: String(a.priceEgp ?? "") }); setDialog({ mode: "edit", id: a.id }); }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    data-testid={`button-delete-addon-${a.id}`}
                    onClick={() => setDeleteId(a.id)}>
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
          <DialogHeader><DialogTitle>{dialog?.mode === "create" ? "Add Add-on" : "Edit Add-on"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input data-testid="input-addon-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Add-on name" className="mt-1" /></div>
            <div><Label>Price (EGP)</Label><Input data-testid="input-addon-price" type="number" value={form.priceEgp} onChange={e => setForm(f => ({ ...f, priceEgp: e.target.value }))} placeholder="0" className="mt-1" /></div>
            <div><Label>Description</Label><Textarea data-testid="input-addon-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button data-testid="button-save-addon" disabled={!form.name.trim() || create.isPending || update.isPending} onClick={handleSave}>
              {create.isPending || update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Add-on</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">This will permanently delete the add-on.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" data-testid="button-confirm-delete-addon" disabled={del.isPending} onClick={() => deleteId && del.mutate({ id: deleteId })}>
              {del.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

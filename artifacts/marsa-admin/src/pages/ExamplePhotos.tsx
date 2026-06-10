import { useState } from "react";
import {
  useAdminListExamplePhotos, useAdminCreateExamplePhoto,
  useAdminUpdateExamplePhoto, useAdminDeleteExamplePhoto,
  getAdminListExamplePhotosQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Image } from "lucide-react";

type FormState = { url: string; caption: string; category: string };
const empty: FormState = { url: "", caption: "", category: "" };

export default function ExamplePhotos() {
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useAdminListExamplePhotos({
    query: { queryKey: getAdminListExamplePhotosQueryKey() }
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: getAdminListExamplePhotosQueryKey() });
  const onErr = () => toast({ title: "Operation failed", variant: "destructive" });

  const create = useAdminCreateExamplePhoto({ mutation: { onSuccess: () => { toast({ title: "Photo added" }); invalidate(); setDialog(null); setForm(empty); }, onError: onErr } });
  const update = useAdminUpdateExamplePhoto({ mutation: { onSuccess: () => { toast({ title: "Photo updated" }); invalidate(); setDialog(null); }, onError: onErr } });
  const del = useAdminDeleteExamplePhoto({ mutation: { onSuccess: () => { toast({ title: "Photo deleted" }); invalidate(); setDeleteId(null); }, onError: onErr } });

  const photos = (data as any)?.photos ?? [];

  const handleSave = () => {
    if (!form.url.trim()) return;
    const payload = {
      url: form.url,
      caption: form.caption || undefined,
      category: form.category || undefined,
    };
    if (dialog?.mode === "create") create.mutate({ data: payload });
    else if (dialog?.id) update.mutate({ id: dialog.id, data: payload });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Example Photos</h1>
        <Button size="sm" data-testid="button-add-photo" onClick={() => { setForm(empty); setDialog({ mode: "create" }); }}>
          <Plus className="w-4 h-4 mr-1" />Add Photo
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No photos yet</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {photos.map((p: any) => (
            <Card key={p.id} data-testid={`card-photo-${p.id}`} className="overflow-hidden">
              <div className="relative aspect-video bg-muted">
                {p.url ? (
                  <img src={p.url} alt={p.caption ?? "Example photo"} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Image className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    data-testid={`button-edit-photo-${p.id}`}
                    className="w-7 h-7 rounded bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background"
                    onClick={() => { setForm({ url: p.url ?? "", caption: p.caption ?? "", category: p.category ?? "" }); setDialog({ mode: "edit", id: p.id }); }}>
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    data-testid={`button-delete-photo-${p.id}`}
                    className="w-7 h-7 rounded bg-background/80 backdrop-blur flex items-center justify-center text-destructive hover:bg-background"
                    onClick={() => setDeleteId(p.id)}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <CardContent className="py-2 px-3">
                <p className="text-xs text-foreground truncate">{p.caption || "No caption"}</p>
                {p.category && <p className="text-xs text-muted-foreground">Category: {p.category}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === "create" ? "Add Example Photo" : "Edit Photo"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Image URL</Label>
              <Input data-testid="input-photo-url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="mt-1" />
            </div>
            <div>
              <Label>Caption <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input data-testid="input-photo-caption" value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} placeholder="E.g. Sunset deck view" className="mt-1" />
            </div>
            <div>
              <Label>Category <span className="text-muted-foreground text-xs">(optional — e.g. deck, interior, exterior)</span></Label>
              <Input data-testid="input-photo-category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Leave blank for general" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button data-testid="button-save-photo" disabled={!form.url.trim() || create.isPending || update.isPending} onClick={handleSave}>
              {create.isPending || update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Photo</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">This will permanently delete the example photo.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" data-testid="button-confirm-delete-photo" disabled={del.isPending} onClick={() => deleteId && del.mutate({ id: deleteId })}>
              {del.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

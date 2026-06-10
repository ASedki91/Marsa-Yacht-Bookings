import { useState } from "react";
import {
  useAdminListCategories, useAdminCreateCategory, useAdminUpdateCategory, useAdminDeleteCategory,
  getAdminListCategoriesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

type FormState = { name: string; slug: string; iconUrl: string; sortOrder: string };
const empty: FormState = { name: "", slug: "", iconUrl: "", sortOrder: "" };

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export default function Categories() {
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useAdminListCategories({
    query: { queryKey: getAdminListCategoriesQueryKey() }
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: getAdminListCategoriesQueryKey() });
  const onErr = () => toast({ title: "Operation failed", variant: "destructive" });

  const create = useAdminCreateCategory({ mutation: { onSuccess: () => { toast({ title: "Category created" }); invalidate(); setDialog(null); setForm(empty); }, onError: onErr } });
  const update = useAdminUpdateCategory({ mutation: { onSuccess: () => { toast({ title: "Category updated" }); invalidate(); setDialog(null); }, onError: onErr } });
  const del = useAdminDeleteCategory({ mutation: { onSuccess: () => { toast({ title: "Category deleted" }); invalidate(); setDeleteId(null); }, onError: onErr } });

  const categories = (data as any)?.categories ?? [];

  const handleNameChange = (name: string) => {
    setForm(f => ({
      ...f,
      name,
      slug: dialog?.mode === "create" ? slugify(name) : f.slug,
    }));
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.slug.trim()) return;
    const payload = {
      name: form.name,
      slug: form.slug,
      iconUrl: form.iconUrl || undefined,
      sortOrder: form.sortOrder ? parseInt(form.sortOrder) : undefined,
    };
    if (dialog?.mode === "create") create.mutate({ data: payload });
    else if (dialog?.id) update.mutate({ id: dialog.id, data: payload });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Categories</h1>
        <Button size="sm" data-testid="button-add-category" onClick={() => { setForm(empty); setDialog({ mode: "create" }); }}>
          <Plus className="w-4 h-4 mr-1" />Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : categories.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No categories yet</div>
      ) : (
        <div className="space-y-2">
          {categories.map((c: any) => (
            <Card key={c.id} data-testid={`card-category-${c.id}`}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground text-sm">{c.name}</p>
                    <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{c.slug}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.sortOrder !== undefined && `Order: ${c.sortOrder}`}
                    {c.iconUrl && ` · Has icon`}
                  </p>
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <Button size="sm" variant="ghost" data-testid={`button-edit-category-${c.id}`}
                    onClick={() => {
                      setForm({ name: c.name, slug: c.slug ?? "", iconUrl: c.iconUrl ?? "", sortOrder: c.sortOrder !== undefined ? String(c.sortOrder) : "" });
                      setDialog({ mode: "edit", id: c.id });
                    }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    data-testid={`button-delete-category-${c.id}`}
                    onClick={() => setDeleteId(c.id)}>
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
          <DialogHeader><DialogTitle>{dialog?.mode === "create" ? "Add Category" : "Edit Category"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input data-testid="input-category-name" value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="Category name" className="mt-1" />
            </div>
            <div>
              <Label>Slug <span className="text-muted-foreground text-xs">(URL-safe identifier)</span></Label>
              <Input data-testid="input-category-slug" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="e.g. sailing-yachts" className="mt-1 font-mono text-sm" />
            </div>
            <div>
              <Label>Icon URL</Label>
              <Input data-testid="input-category-icon" value={form.iconUrl} onChange={e => setForm(f => ({ ...f, iconUrl: e.target.value }))} placeholder="https://..." className="mt-1" />
            </div>
            <div>
              <Label>Sort Order <span className="text-muted-foreground text-xs">(lower = first)</span></Label>
              <Input data-testid="input-category-sort" type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} placeholder="0" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              data-testid="button-save-category"
              disabled={!form.name.trim() || !form.slug.trim() || create.isPending || update.isPending}
              onClick={handleSave}
            >
              {create.isPending || update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Category</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">This will permanently delete the category. Any yachts linked to it will lose their category.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" data-testid="button-confirm-delete-category" disabled={del.isPending} onClick={() => deleteId && del.mutate({ id: deleteId })}>
              {del.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminListLocationsQueryKey,
  useAdminCreateLocation,
  useAdminDeactivateLocation,
  useAdminListLocations,
  useAdminUpdateLocation,
} from "@workspace/api-client-react";
import { CheckCircle2, MapPin, Pencil, Plus, Power, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface LocationForm {
  name: string;
  city: string;
  country: string;
  timeZone: string;
  sortOrder: string;
  isDefault: boolean;
}

const emptyForm: LocationForm = {
  name: "",
  city: "",
  country: "Egypt",
  timeZone: "Africa/Cairo",
  sortOrder: "0",
  isDefault: false,
};

export default function Locations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useAdminListLocations();
  const locations: any[] = (query.data as any)?.locations ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyForm);

  const activeCount = useMemo(
    () => locations.filter((location) => location.isActive).length,
    [locations],
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getAdminListLocationsQueryKey() });
  const mutationError = (error: any) =>
    toast({
      title: "Location could not be saved",
      description:
        error?.data?.error ?? error?.message ?? "Check the fields and try again.",
      variant: "destructive",
    });
  const onMutationSuccess = (title: string) => {
    toast({ title });
    refresh();
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const create = useAdminCreateLocation({
    mutation: {
      onSuccess: () => onMutationSuccess("Location added"),
      onError: mutationError,
    },
  });
  const update = useAdminUpdateLocation({
    mutation: {
      onSuccess: () => onMutationSuccess("Location updated"),
      onError: mutationError,
    },
  });
  const deactivate = useAdminDeactivateLocation({
    mutation: {
      onSuccess: () => {
        toast({ title: "Location deactivated" });
        refresh();
      },
      onError: mutationError,
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      sortOrder: String(locations.length),
      isDefault: locations.length === 0,
    });
    setDialogOpen(true);
  };

  const openEdit = (location: any) => {
    setEditingId(location.id);
    setForm({
      name: location.name,
      city: location.city,
      country: location.country,
      timeZone: location.timeZone,
      sortOrder: String(location.sortOrder ?? 0),
      isDefault: !!location.isDefault,
    });
    setDialogOpen(true);
  };

  const save = () => {
    const payload = {
      name: form.name.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
      timeZone: form.timeZone.trim(),
      sortOrder: Number(form.sortOrder || 0),
      isDefault: form.isDefault,
    };
    if (!payload.name || !payload.city || !payload.country || !payload.timeZone) {
      toast({
        title: "Complete every required field",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isInteger(payload.sortOrder) || payload.sortOrder < 0) {
      toast({
        title: "Sort order must be a non-negative whole number",
        variant: "destructive",
      });
      return;
    }

    if (editingId) {
      update.mutate({ id: editingId, data: payload });
    } else {
      create.mutate({ data: payload });
    }
  };

  const reactivate = (location: any) => {
    update.mutate({
      id: location.id,
      data: { isActive: true },
    });
  };

  const setDefault = (location: any) => {
    update.mutate({
      id: location.id,
      data: { isDefault: true, isActive: true },
    });
  };

  const isSaving = create.isPending || update.isPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Marketplace organization
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Locations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hosts select from active locations. “Other” remains available for a
            custom marina.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add location
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total locations</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {locations.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active for hosts</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Default selection</p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">
              {locations.find((location) => location.isDefault)?.name ?? "Not set"}
            </p>
          </CardContent>
        </Card>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : query.error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex items-center justify-between p-5">
            <p className="text-sm text-destructive">Locations could not be loaded.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : locations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <MapPin className="h-9 w-9 text-muted-foreground" />
            <p className="mt-3 font-semibold text-foreground">No locations yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add Gouna, Egypt as the first default location.
            </p>
            <Button className="mt-4" onClick={openCreate}>
              Add first location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {locations.map((location) => (
            <Card
              key={location.id}
              className={!location.isActive ? "opacity-65" : undefined}
            >
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{location.name}</p>
                      {location.isDefault && (
                        <Badge className="gap-1">
                          <Star className="h-3 w-3" />
                          Default
                        </Badge>
                      )}
                      <Badge variant={location.isActive ? "outline" : "secondary"}>
                        {location.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {location.city}, {location.country} · {location.timeZone}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      /{location.slug} · sort {location.sortOrder}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {!location.isDefault && location.isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDefault(location)}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Make default
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openEdit(location)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  {location.isActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={location.isDefault || deactivate.isPending}
                      onClick={() => deactivate.mutate({ id: location.id })}
                      className="text-destructive"
                    >
                      <Power className="mr-1.5 h-3.5 w-3.5" />
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reactivate(location)}
                    >
                      <Power className="mr-1.5 h-3.5 w-3.5" />
                      Reactivate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit location" : "Add location"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="location-name">Display name</Label>
              <Input
                id="location-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Gouna, Egypt"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-city">City / area</Label>
              <Input
                id="location-city"
                value={form.city}
                onChange={(event) =>
                  setForm((current) => ({ ...current, city: event.target.value }))
                }
                placeholder="El Gouna"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-country">Country</Label>
              <Input
                id="location-country"
                value={form.country}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    country: event.target.value,
                  }))
                }
                placeholder="Egypt"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-timezone">IANA time zone</Label>
              <Input
                id="location-timezone"
                value={form.timeZone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    timeZone: event.target.value,
                  }))
                }
                placeholder="Africa/Cairo"
              />
              <p className="text-[11px] text-muted-foreground">
                Used to calculate trip times and cancellation windows.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-sort">Sort order</Label>
              <Input
                id="location-sort"
                type="number"
                min={0}
                step={1}
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
              <div>
                <Label htmlFor="location-default">Default guest location</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  New searches and yacht forms start with this location.
                </p>
              </div>
              <Switch
                id="location-default"
                checked={form.isDefault}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, isDefault: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={isSaving} onClick={save}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

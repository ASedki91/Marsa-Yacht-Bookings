import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminListCancellationPoliciesQueryKey,
  type CancellationPolicy,
  type CancellationPolicyRule,
  useAdminActivateCancellationPolicy,
  useAdminCreateCancellationPolicy,
  useAdminListCancellationPolicies,
  useAdminReplaceCancellationPolicyRules,
  useAdminUpdateCancellationPolicy,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type RuleUnit = "minutes" | "hours" | "days";

interface EditableRule {
  key: string;
  amount: string;
  unit: RuleUnit;
  feePercentage: string;
}

let nextRuleKey = 0;

function createRuleKey() {
  nextRuleKey += 1;
  return `rule-${Date.now()}-${nextRuleKey}`;
}

function formatDuration(minutes: number) {
  if (minutes === 0) return "trip start";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function describeRules(rules: CancellationPolicyRule[]) {
  const sorted = [...rules].sort(
    (left, right) =>
      right.minimumMinutesBeforeTrip - left.minimumMinutesBeforeTrip,
  );
  return sorted.map((rule, index) => {
    const threshold = rule.minimumMinutesBeforeTrip;
    const upperThreshold = sorted[index - 1]?.minimumMinutesBeforeTrip;
    let range: string;
    if (sorted.length === 1 && threshold === 0) {
      range = "At any time before the trip";
    } else if (index === 0) {
      range = `${formatDuration(threshold)} or more before the trip`;
    } else if (threshold === 0) {
      range = `Less than ${formatDuration(upperThreshold)} before the trip`;
    } else {
      range = `${formatDuration(threshold)} to under ${formatDuration(
        upperThreshold,
      )} before the trip`;
    }
    return { ...rule, range };
  });
}

function toEditableRule(rule: CancellationPolicyRule): EditableRule {
  const minutes = rule.minimumMinutesBeforeTrip;
  if (minutes !== 0 && minutes % 1440 === 0) {
    return {
      key: rule.id || createRuleKey(),
      amount: String(minutes / 1440),
      unit: "days",
      feePercentage: String(Number(rule.feePercentage)),
    };
  }
  if (minutes % 60 === 0) {
    return {
      key: rule.id || createRuleKey(),
      amount: String(minutes / 60),
      unit: "hours",
      feePercentage: String(Number(rule.feePercentage)),
    };
  }
  return {
    key: rule.id || createRuleKey(),
    amount: String(minutes),
    unit: "minutes",
    feePercentage: String(Number(rule.feePercentage)),
  };
}

function ruleToMinutes(rule: EditableRule) {
  const amount = Number(rule.amount);
  const multiplier =
    rule.unit === "days" ? 1440 : rule.unit === "hours" ? 60 : 1;
  return amount * multiplier;
}

function statusBadge(status: CancellationPolicy["status"]) {
  if (status === "active") {
    return "border-green-500/40 text-green-600";
  }
  if (status === "draft") {
    return "border-blue-500/40 text-blue-600";
  }
  return "border-muted-foreground/30 text-muted-foreground";
}

function getErrorMessage(error: any) {
  return error?.data?.error ?? error?.message ?? "Please try again.";
}

function PolicyRules({ policy }: { policy: CancellationPolicy }) {
  const descriptions = describeRules(policy.rules);
  if (descriptions.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">No rules configured.</p>
    );
  }
  return (
    <div className="mt-3 overflow-hidden rounded-lg border">
      {descriptions.map((rule, index) => (
        <div
          key={rule.id}
          className="flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-b-0"
        >
          <p className="text-xs text-muted-foreground">{rule.range}</p>
          <Badge variant="secondary" className="shrink-0">
            {Number(rule.feePercentage)}% fee
          </Badge>
        </div>
      ))}
    </div>
  );
}

export default function CancellationPolicies() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const policiesQuery = useAdminListCancellationPolicies({
    query: { queryKey: getAdminListCancellationPoliciesQueryKey() },
  });
  const policies = policiesQuery.data?.policies ?? [];
  const activePolicy = policies.find((policy) => policy.status === "active");
  const [createOpen, setCreateOpen] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState("");
  const [clonePolicyId, setClonePolicyId] = useState<string | null>(null);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftRules, setDraftRules] = useState<EditableRule[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activatePolicyId, setActivatePolicyId] = useState<string | null>(null);

  const editingPolicy = useMemo(
    () => policies.find((policy) => policy.id === editingPolicyId),
    [editingPolicyId, policies],
  );
  const activationPolicy = policies.find(
    (policy) => policy.id === activatePolicyId,
  );
  const cloneSource = policies.find((policy) => policy.id === clonePolicyId);

  const createPolicy = useAdminCreateCancellationPolicy();
  const updatePolicy = useAdminUpdateCancellationPolicy();
  const replaceRules = useAdminReplaceCancellationPolicyRules();
  const activatePolicy = useAdminActivateCancellationPolicy();

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminListCancellationPoliciesQueryKey(),
    });

  const openEditor = (policy: CancellationPolicy) => {
    setEditingPolicyId(policy.id);
    setDraftName(policy.name);
    setDraftRules(policy.rules.map(toEditableRule));
    setHasUnsavedChanges(false);
  };

  const changeName = (value: string) => {
    setDraftName(value);
    setHasUnsavedChanges(true);
  };

  const updateRule = (
    key: string,
    field: "amount" | "unit" | "feePercentage",
    value: string,
  ) => {
    setDraftRules((current) =>
      current.map((rule) =>
        rule.key === key ? { ...rule, [field]: value } : rule,
      ),
    );
    setHasUnsavedChanges(true);
  };

  const addRule = () => {
    setDraftRules((current) => [
      ...current,
      {
        key: createRuleKey(),
        amount: "",
        unit: "hours",
        feePercentage: "",
      },
    ]);
    setHasUnsavedChanges(true);
  };

  const removeRule = (key: string) => {
    setDraftRules((current) => current.filter((rule) => rule.key !== key));
    setHasUnsavedChanges(true);
  };

  const normalizedRules = () => {
    if (draftRules.length === 0) {
      throw new Error("Add at least one cancellation rule.");
    }
    const rules = draftRules.map((rule) => {
      const threshold = ruleToMinutes(rule);
      const feePercentage = Number(rule.feePercentage);
      if (
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        !Number.isInteger(threshold)
      ) {
        throw new Error(
          "Every time threshold must resolve to a non-negative whole minute.",
        );
      }
      if (
        !Number.isFinite(feePercentage) ||
        feePercentage < 0 ||
        feePercentage > 100
      ) {
        throw new Error("Every fee must be between 0% and 100%.");
      }
      return {
        minimumMinutesBeforeTrip: threshold,
        feePercentage,
      };
    });
    const thresholds = new Set(
      rules.map((rule) => rule.minimumMinutesBeforeTrip),
    );
    if (thresholds.size !== rules.length) {
      throw new Error("Each time threshold must be unique.");
    }
    if (!thresholds.has(0)) {
      throw new Error(
        "Add a 0-hour rule to cover cancellations closest to trip start.",
      );
    }
    return rules.sort(
      (left, right) =>
        right.minimumMinutesBeforeTrip - left.minimumMinutesBeforeTrip,
    );
  };

  const saveDraft = async () => {
    if (!editingPolicy || editingPolicy.status !== "draft") return;
    if (!draftName.trim()) {
      toast({ title: "Add a policy name", variant: "destructive" });
      return;
    }
    try {
      const rules = normalizedRules();
      await updatePolicy.mutateAsync({
        id: editingPolicy.id,
        data: { name: draftName.trim() },
      });
      const saved = await replaceRules.mutateAsync({
        id: editingPolicy.id,
        data: { rules },
      });
      setDraftName(saved.name);
      setDraftRules(saved.rules.map(toEditableRule));
      setHasUnsavedChanges(false);
      await refresh();
      toast({ title: "Cancellation policy draft saved" });
    } catch (error) {
      toast({
        title: "Policy could not be saved",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const createDraft = async () => {
    if (!newPolicyName.trim()) {
      toast({ title: "Add a policy name", variant: "destructive" });
      return;
    }
    try {
      const policy = await createPolicy.mutateAsync({
        data: {
          name: newPolicyName.trim(),
          ...(clonePolicyId
            ? { clonePolicyId }
            : {}),
        },
      });
      setCreateOpen(false);
      setNewPolicyName("");
      setClonePolicyId(null);
      await refresh();
      openEditor(policy);
      toast({
        title: clonePolicyId ? "Policy cloned" : "Draft created",
        description: "Review its time spans and fees before activation.",
      });
    } catch (error) {
      toast({
        title: "Draft could not be created",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const activateDraft = async () => {
    if (!activationPolicy) return;
    try {
      await activatePolicy.mutateAsync({ id: activationPolicy.id });
      setActivatePolicyId(null);
      setEditingPolicyId(null);
      setHasUnsavedChanges(false);
      await refresh();
      toast({
        title: `Version ${activationPolicy.version} is now active`,
        description:
          "New bookings will snapshot this policy. Existing bookings keep their original terms.",
      });
    } catch (error) {
      toast({
        title: "Policy could not be activated",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const saving =
    updatePolicy.isPending ||
    replaceRules.isPending ||
    createPolicy.isPending ||
    activatePolicy.isPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Booking terms
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            Cancellation policy
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure dynamic fees according to the time remaining before a trip.
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            setClonePolicyId(activePolicy?.id ?? null);
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New policy draft
        </Button>
      </div>

      <div className="flex gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p>
          A booking stores the exact policy version and calculated amounts it
          accepted. Activating a new version never changes existing bookings.
        </p>
      </div>

      {policiesQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full" />
          ))}
        </div>
      ) : policiesQuery.error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex items-center justify-between p-5">
            <p className="text-sm text-destructive">
              Cancellation policies could not be loaded.
            </p>
            <Button variant="outline" onClick={() => policiesQuery.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : policies.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <Clock3 className="mx-auto h-9 w-9 text-muted-foreground" />
            <p className="mt-3 font-semibold text-foreground">
              No cancellation policy configured
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a draft with a zero-hour catch-all rule, then activate it.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setClonePolicyId(null);
                setCreateOpen(true);
              }}
            >
              Create first policy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-3">
            {policies.map((policy) => (
              <Card
                key={policy.id}
                className={
                  editingPolicyId === policy.id
                    ? "border-primary ring-1 ring-primary/20"
                    : undefined
                }
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">
                          {policy.name}
                        </p>
                        <Badge
                          variant="outline"
                          className={statusBadge(policy.status)}
                        >
                          {policy.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Version {policy.version} · {policy.rules.length} rule
                        {policy.rules.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    {policy.status === "active" && (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                    )}
                  </div>

                  <PolicyRules policy={policy} />

                  <div className="mt-3 flex flex-wrap gap-2">
                    {policy.status === "draft" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => openEditor(policy)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit draft
                        </Button>
                        <Button
                          size="sm"
                          disabled={
                            policy.id === editingPolicyId &&
                            hasUnsavedChanges
                          }
                          onClick={() => setActivatePolicyId(policy.id)}
                        >
                          Activate
                        </Button>
                      </>
                    )}
                    {policy.status !== "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                          setNewPolicyName(`${policy.name} — new version`);
                          setClonePolicyId(policy.id);
                          setCreateOpen(true);
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Use as starting point
                      </Button>
                    )}
                  </div>
                  {policy.id === editingPolicyId && hasUnsavedChanges && (
                    <p className="mt-2 text-xs text-amber-600">
                      Save changes before activating this draft.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            {editingPolicy?.status === "draft" ? (
              <Card className="xl:sticky xl:top-0">
                <CardContent className="space-y-5 p-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                      Draft version {editingPolicy.version}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-foreground">
                      Edit time spans and fees
                    </h2>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="policy-name">Policy name</Label>
                    <Input
                      id="policy-name"
                      value={draftName}
                      maxLength={120}
                      onChange={(event) => changeName(event.target.value)}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Cancellation rules</Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Rules are evaluated from the longest notice to the
                          shortest.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={addRule}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add span
                      </Button>
                    </div>

                    {draftRules.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Add at least one time span.
                      </div>
                    ) : (
                      draftRules.map((rule, index) => (
                        <div
                          key={rule.key}
                          className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_130px_44px]"
                        >
                          <div className="space-y-1.5">
                            <Label htmlFor={`threshold-${rule.key}`}>
                              Minimum notice before trip
                            </Label>
                            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                              <Input
                                id={`threshold-${rule.key}`}
                                type="number"
                                min={0}
                                step="any"
                                value={rule.amount}
                                onChange={(event) =>
                                  updateRule(
                                    rule.key,
                                    "amount",
                                    event.target.value,
                                  )
                                }
                                placeholder={index === draftRules.length - 1 ? "0" : "48"}
                              />
                              <Select
                                value={rule.unit}
                                onValueChange={(value: RuleUnit) =>
                                  updateRule(rule.key, "unit", value)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="minutes">Minutes</SelectItem>
                                  <SelectItem value="hours">Hours</SelectItem>
                                  <SelectItem value="days">Days</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`fee-${rule.key}`}>Fee %</Label>
                            <Input
                              id={`fee-${rule.key}`}
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={rule.feePercentage}
                              onChange={(event) =>
                                updateRule(
                                  rule.key,
                                  "feePercentage",
                                  event.target.value,
                                )
                              }
                              placeholder="20"
                            />
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="self-end text-destructive"
                            aria-label="Remove cancellation rule"
                            onClick={() => removeRule(rule.key)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Include one rule at 0 hours. It is the final catch-all for
                    cancellations closest to trip start.
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      disabled={!hasUnsavedChanges || saving}
                      onClick={() => openEditor(editingPolicy)}
                    >
                      Discard changes
                    </Button>
                    <Button
                      className="gap-2"
                      disabled={!hasUnsavedChanges || saving}
                      onClick={saveDraft}
                    >
                      <Save className="h-4 w-4" />
                      {saving ? "Saving…" : "Save draft"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <Pencil className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-medium text-foreground">
                    Select a draft to edit
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Active and retired policy versions remain read-only audit
                    records.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setNewPolicyName("");
            setClonePolicyId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create cancellation-policy draft</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-policy-name">Policy name</Label>
              <Input
                id="new-policy-name"
                value={newPolicyName}
                maxLength={120}
                onChange={(event) => setNewPolicyName(event.target.value)}
                placeholder="Standard cancellation terms"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-4">
                <Label htmlFor="clone-active-policy">
                  {cloneSource
                    ? `Copy rules from version ${cloneSource.version}`
                    : "Copy the active policy rules"}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {cloneSource
                    ? `Use “${cloneSource.name}” as the starting point.`
                    : activePolicy
                      ? `Start from version ${activePolicy.version} and adjust only what changes.`
                      : "No active policy is available to copy."}
                </p>
              </div>
              <Switch
                id="clone-active-policy"
                checked={!!clonePolicyId}
                disabled={!activePolicy && !cloneSource}
                onCheckedChange={(checked) =>
                  setClonePolicyId(
                    checked
                      ? (cloneSource?.id ?? activePolicy?.id ?? null)
                      : null,
                  )
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={createPolicy.isPending}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={createPolicy.isPending} onClick={createDraft}>
              {createPolicy.isPending ? "Creating…" : "Create draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!activatePolicyId}
        onOpenChange={(open) => !open && setActivatePolicyId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Activate version {activationPolicy?.version}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This version becomes the policy for all new bookings. The current
              active version will be retired and cannot be edited.
            </p>
            {activationPolicy && <PolicyRules policy={activationPolicy} />}
            <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Confirm every threshold and fee before activation.
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={activatePolicy.isPending}
              onClick={() => setActivatePolicyId(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={activatePolicy.isPending}
              onClick={activateDraft}
            >
              {activatePolicy.isPending ? "Activating…" : "Activate policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

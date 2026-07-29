import {
  cancellationPoliciesTable,
  cancellationPolicyRulesTable,
  db,
} from "@workspace/db";
import { asc, desc, eq, inArray } from "drizzle-orm";

export type CancellationPolicyWithRules =
  typeof cancellationPoliciesTable.$inferSelect & {
    rules: Array<typeof cancellationPolicyRulesTable.$inferSelect>;
  };

export function validateCancellationRuleSet(
  rules: Array<{ minimumMinutesBeforeTrip: number; feePercentage: string | number }>,
): string | null {
  if (rules.length === 0) return "At least one cancellation rule is required";
  const thresholds = new Set<number>();
  for (const rule of rules) {
    if (!Number.isInteger(rule.minimumMinutesBeforeTrip) || rule.minimumMinutesBeforeTrip < 0) {
      return "Rule thresholds must be non-negative whole minutes";
    }
    const fee = Number(rule.feePercentage);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
      return "Cancellation fees must be between 0 and 100 percent";
    }
    if (thresholds.has(rule.minimumMinutesBeforeTrip)) {
      return "Cancellation rule thresholds must be unique";
    }
    thresholds.add(rule.minimumMinutesBeforeTrip);
  }
  if (!thresholds.has(0)) {
    return "A zero-minute catch-all cancellation rule is required";
  }
  return null;
}

export async function getCancellationPolicyById(
  policyId: string,
): Promise<CancellationPolicyWithRules | null> {
  const [policy] = await db
    .select()
    .from(cancellationPoliciesTable)
    .where(eq(cancellationPoliciesTable.id, policyId))
    .limit(1);
  if (!policy) return null;
  const rules = await db
    .select()
    .from(cancellationPolicyRulesTable)
    .where(eq(cancellationPolicyRulesTable.policyId, policyId))
    .orderBy(desc(cancellationPolicyRulesTable.minimumMinutesBeforeTrip));
  return { ...policy, rules };
}

export async function getActiveCancellationPolicy(): Promise<CancellationPolicyWithRules | null> {
  const [policy] = await db
    .select()
    .from(cancellationPoliciesTable)
    .where(eq(cancellationPoliciesTable.status, "active"))
    .limit(1);
  if (!policy) return null;
  const rules = await db
    .select()
    .from(cancellationPolicyRulesTable)
    .where(eq(cancellationPolicyRulesTable.policyId, policy.id))
    .orderBy(desc(cancellationPolicyRulesTable.minimumMinutesBeforeTrip));
  return { ...policy, rules };
}

export async function listCancellationPolicies(): Promise<CancellationPolicyWithRules[]> {
  const policies = await db
    .select()
    .from(cancellationPoliciesTable)
    .orderBy(desc(cancellationPoliciesTable.version));
  if (!policies.length) return [];
  const rules = await db
    .select()
    .from(cancellationPolicyRulesTable)
    .where(inArray(cancellationPolicyRulesTable.policyId, policies.map((policy) => policy.id)))
    .orderBy(
      asc(cancellationPolicyRulesTable.policyId),
      desc(cancellationPolicyRulesTable.minimumMinutesBeforeTrip),
    );
  const rulesByPolicy = new Map<string, typeof rules>();
  for (const rule of rules) {
    const grouped = rulesByPolicy.get(rule.policyId) ?? [];
    grouped.push(rule);
    rulesByPolicy.set(rule.policyId, grouped);
  }
  return policies.map((policy) => ({
    ...policy,
    rules: rulesByPolicy.get(policy.id) ?? [],
  }));
}

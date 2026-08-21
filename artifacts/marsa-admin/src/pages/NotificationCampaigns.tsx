import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminListNotificationCampaignsQueryKey,
  type NotificationCampaign,
  useAdminCreateNotificationCampaign,
  useAdminListNotificationCampaigns,
} from "@workspace/api-client-react";
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Mail,
  Megaphone,
  Send,
  Smartphone,
  TriangleAlert,
  Users,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const statusStyles: Record<string, string> = {
  queued: "border-blue-400/40 text-blue-500",
  sending: "border-amber-400/40 text-amber-500",
  completed: "border-green-500/40 text-green-600",
  partial_failed: "border-orange-500/40 text-orange-600",
  failed: "border-destructive/40 text-destructive",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function DeliveryMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Smartphone;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-bold text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default function NotificationCampaigns() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const campaignsQuery = useAdminListNotificationCampaigns({
    query: {
      queryKey: getAdminListNotificationCampaignsQueryKey(),
      refetchInterval: 15_000,
    },
  });
  const campaigns = campaignsQuery.data?.campaigns ?? [];
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const createCampaign = useAdminCreateNotificationCampaign({
    mutation: {
      onSuccess: (campaign) => {
        queryClient.invalidateQueries({
          queryKey: getAdminListNotificationCampaignsQueryKey(),
        });
        setTitle("");
        setMessage("");
        setConfirmOpen(false);
        toast({
          title: "Broadcast queued",
          description: `In-app delivery started for ${campaign.totalRecipients.toLocaleString()} users.`,
        });
      },
      onError: (error: any) => {
        toast({
          title: "Broadcast could not be sent",
          description:
            error?.data?.error ??
            error?.message ??
            "Review the message and try again.",
          variant: "destructive",
        });
      },
    },
  });

  const validateAndConfirm = () => {
    if (!title.trim() || !message.trim()) {
      toast({
        title: "Add a title and message",
        variant: "destructive",
      });
      return;
    }
    if (title.trim().length > 120 || message.trim().length > 1000) {
      toast({
        title: "The broadcast is too long",
        description: "Use at most 120 title characters and 1,000 message characters.",
        variant: "destructive",
      });
      return;
    }
    setConfirmOpen(true);
  };

  const send = () => {
    createCampaign.mutate({
      data: {
        title: title.trim(),
        message: message.trim(),
        audience: "all",
      },
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          User communication
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">
          Broadcast notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send one announcement to every MARSA user.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Compose broadcast</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The audience is currently fixed to all registered users.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="broadcast-title">Notification title</Label>
              <Input
                id="broadcast-title"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Weekend availability just opened"
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {title.length}/120
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="broadcast-message">Message</Label>
              <Textarea
                id="broadcast-message"
                value={message}
                maxLength={1000}
                rows={7}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Tell guests what is new and what action they can take."
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {message.length}/1,000
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">All users</p>
                  <p className="text-xs text-muted-foreground">
                    Guests, hosts, and administrators
                  </p>
                </div>
              </div>
              <Badge variant="outline">Audience</Badge>
            </div>

            <Button
              className="w-full gap-2"
              disabled={createCampaign.isPending}
              onClick={validateAndConfirm}
            >
              <Send className="h-4 w-4" />
              Review and send
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="font-semibold text-foreground">Delivery channels</h2>
            <div className="space-y-3">
              <div className="flex gap-3 rounded-lg border p-3">
                <BellRing className="mt-0.5 h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    In-app notification
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Created immediately for every current user.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-lg border p-3">
                <Smartphone className="mt-0.5 h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Push notification
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Queued for users who enabled push on a registered device.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-lg border border-dashed p-3 opacity-70">
                <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">Email</p>
                    <Badge variant="secondary">Future</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    The campaign model is ready for a later email provider.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Broadcasts cannot be recalled after you confirm them.
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Campaign history</h2>
            <p className="text-xs text-muted-foreground">
              Counts refresh while push delivery is running.
            </p>
          </div>
          <Badge variant="secondary">{campaigns.length} campaigns</Badge>
        </div>

        {campaignsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full" />
            ))}
          </div>
        ) : campaignsQuery.error ? (
          <Card className="border-destructive/30">
            <CardContent className="flex items-center justify-between p-5">
              <p className="text-sm text-destructive">
                Campaign history could not be loaded.
              </p>
              <Button variant="outline" onClick={() => campaignsQuery.refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : campaigns.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Megaphone className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium text-foreground">
                No broadcasts sent yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your first campaign will appear here with delivery results.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign: NotificationCampaign) => (
              <Card key={campaign.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">
                          {campaign.title}
                        </p>
                        <Badge
                          variant="outline"
                          className={statusStyles[campaign.status] ?? ""}
                        >
                          {campaign.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {campaign.message}
                      </p>
                      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        Created {formatDate(campaign.createdAt)}
                        {campaign.completedAt
                          ? ` · completed ${formatDate(campaign.completedAt)}`
                          : ""}
                      </p>
                    </div>
                    {campaign.status === "completed" && (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                    )}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    <DeliveryMetric
                      icon={Users}
                      label="Recipients"
                      value={campaign.totalRecipients}
                    />
                    <DeliveryMetric
                      icon={BellRing}
                      label="In-app sent"
                      value={campaign.inAppSentCount}
                    />
                    <DeliveryMetric
                      icon={Smartphone}
                      label="Push sent"
                      value={campaign.pushSentCount}
                    />
                    <DeliveryMetric
                      icon={TriangleAlert}
                      label="Push failed"
                      value={campaign.pushFailedCount}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this broadcast to all users?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="font-semibold text-foreground">{title.trim()}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {message.trim()}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              In-app messages are created immediately and eligible device pushes
              are queued. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={createCampaign.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              Keep editing
            </Button>
            <Button
              className="gap-2"
              disabled={createCampaign.isPending}
              onClick={send}
            >
              <Send className="h-4 w-4" />
              {createCampaign.isPending ? "Sending…" : "Send to all users"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

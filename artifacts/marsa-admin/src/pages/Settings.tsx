import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminGetSupportConfigQueryKey,
  useAdminGetSupportConfig,
  useAdminUpdateSupportConfig,
} from "@workspace/api-client-react";
import { MessageCircle, Save, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const configQuery = useAdminGetSupportConfig();
  const [whatsappSupportNumber, setWhatsappSupportNumber] = useState("");

  useEffect(() => {
    if (configQuery.data?.whatsappSupportNumber) {
      setWhatsappSupportNumber(configQuery.data.whatsappSupportNumber);
    }
  }, [configQuery.data?.whatsappSupportNumber]);

  const update = useAdminUpdateSupportConfig({
    mutation: {
      onSuccess: (data) => {
        setWhatsappSupportNumber(data.whatsappSupportNumber);
        queryClient.invalidateQueries({
          queryKey: getAdminGetSupportConfigQueryKey(),
        });
        toast({ title: "WhatsApp support number saved" });
      },
      onError: (error: any) =>
        toast({
          title: "Support number could not be saved",
          description:
            error?.data?.error ??
            error?.message ??
            "Enter a valid international WhatsApp number and try again.",
          variant: "destructive",
        }),
    },
  });

  const save = () => {
    const normalized = whatsappSupportNumber.replace(/[^\d]/g, "");
    if (!/^\d{7,15}$/.test(normalized)) {
      toast({
        title: "Enter a valid WhatsApp number",
        description:
          "Use an international number with 7 to 15 digits, including the country code.",
        variant: "destructive",
      });
      return;
    }
    update.mutate({ data: { whatsappSupportNumber } });
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Marketplace controls
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the contact details guests and hosts use when they need
          help with a booking.
        </p>
      </div>

      {configQuery.isLoading ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-9 w-28" />
          </CardContent>
        </Card>
      ) : configQuery.error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <p className="text-sm text-destructive">
              Support settings could not be loaded.
            </p>
            <Button variant="outline" onClick={() => configQuery.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                <MessageCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">WhatsApp support</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This number is used by booking support buttons in the MARSA
                  mobile app. Guests and hosts receive booking-aware messages.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp-support-number">
                International WhatsApp number
              </Label>
              <Input
                id="whatsapp-support-number"
                value={whatsappSupportNumber}
                onChange={(event) => setWhatsappSupportNumber(event.target.value)}
                placeholder="+20 100 000 0000"
                inputMode="tel"
                autoComplete="tel"
              />
              <p className="text-xs text-muted-foreground">
                Include the country code. Spaces, dashes, and a leading plus are
                accepted; MARSA stores the number as digits only.
              </p>
            </div>

            <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
              <div className="flex gap-2 text-sm text-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  Changes are recorded in the admin audit log and take effect
                  for every support link immediately.
                </p>
              </div>
            </div>

            <Button onClick={save} disabled={update.isPending} className="gap-2">
              <Save className="h-4 w-4" />
              {update.isPending ? "Saving…" : "Save support number"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
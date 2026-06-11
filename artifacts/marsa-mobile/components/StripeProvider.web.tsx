import React from "react";

interface Props {
  children: React.ReactNode;
  publishableKey?: string;
  merchantIdentifier?: string;
  [key: string]: any;
}

export function StripeProvider({ children }: Props) {
  return <>{children}</>;
}

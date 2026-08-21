import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function Root() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Redirect href={"/(home)" as any} />;
  return <Redirect href="/(auth)/sign-in" />;
}

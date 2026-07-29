import { Redirect } from "expo-router";

/**
 * Compatibility boundary for links from older app builds.
 * The mixed guest/host tab navigator no longer exists.
 */
export default function LegacyTabsRedirect() {
  return <Redirect href={"/(home)" as any} />;
}

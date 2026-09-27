import { useEffect } from 'react';
import { Redirect } from 'expo-router';

/**
 * Legacy `/gov` entry point.
 *
 * The dashboard now lives in the `(gov)` route group so it can use a proper
 * bottom-tab navigator. This shim keeps the old path working for anyone who
 * bookmarked or deep-linked `/gov`, and avoids maintaining two dashboards.
 */
export default function GovLegacyRoute() {
  useEffect(() => {
    // no-op; Redirect below performs the navigation
  }, []);

  return <Redirect href="/(gov)" />;
}

/**
 * The application shell.
 *
 * Scoped to this route group so the storefront at `/` can render without a
 * sidebar, a command palette or any of the app's global listeners — a visitor
 * who hasn't opened the tool yet shouldn't be paying to hydrate it.
 */

import { AppShell } from "@/components/shell/AppShell";

export default function AppGroupLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}

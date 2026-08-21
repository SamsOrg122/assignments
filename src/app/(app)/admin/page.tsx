/**
 * Administration moved into Settings.
 *
 * The route stays. It has been linked to from the sidebar, from the command
 * palette, and from whatever people bookmarked while it was its own console
 * — and a 404 is a worse answer than a hop, especially for the one screen
 * somebody opens when they are already trying to work out why something is
 * not working.
 */

import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/settings#administration");
}

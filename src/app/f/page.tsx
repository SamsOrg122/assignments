import type { Metadata } from "next";
import { FillClient } from "./FillClient";

export const metadata: Metadata = {
  title: "Form",
  // The questions are in the fragment, which never reaches a server — but a
  // form link is somebody's data collection, not a page for a search index.
  robots: { index: false, follow: false },
};

export default function FillPage() {
  return <FillClient />;
}

import type { Metadata } from "next";
import { PresenterClient } from "./PresenterClient";

export const metadata: Metadata = {
  title: "Presenter view",
  robots: { index: false, follow: false },
};

export default function PresentPage() {
  return <PresenterClient />;
}

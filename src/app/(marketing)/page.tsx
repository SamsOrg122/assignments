import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Product } from "@/components/landing/Product";
import { Signature } from "@/components/landing/Signature";
import { Mission } from "@/components/landing/Mission";
import { Impact } from "@/components/landing/Impact";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { IMPACT, percent } from "@/lib/impact/config";

export const metadata: Metadata = {
  title: "Assignments — everything you make, in one place",
  description:
    `An AI-native workspace for entrepreneurs and students: write, present, draw and organise in one place. ` +
    `${percent(IMPACT.shareOfRevenue.value)} of every euro — subscription and AI usage alike — is set aside for reforestation.`,
};

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Product />
        <Signature />
        <Mission />
        <Impact />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}

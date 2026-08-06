/**
 * Visual slots.
 *
 * Every image position on the landing page is declared here rather than
 * inlined in a component, so the page can be reasoned about as a set of
 * *slots* — each one either filled with a real asset or falling back to a
 * crafted, hand-built visual.
 *
 * Two deliberate rules:
 *
 * 1. A slot with `status: "placeholder"` renders its crafted fallback, never a
 *    stand-in image dressed up as final art. Nothing on the page pretends to
 *    be a generated asset that doesn't exist.
 * 2. The crafted fallbacks are not apologies. Half this page is meant to be
 *    hand-made — vector, type and real product mark-ups — because that mix is
 *    the point: AI where it shines, design everywhere.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FOUNDER: to fill a slot, generate against `prompt` (see `higgsfield.ts`),
 * drop the file into `public/visuals/`, then set `src` and flip `status` to
 * "generated". Keep `alt` accurate to what the image actually shows — it is
 * read aloud, not decoration.
 * ───────────────────────────────────────────────────────────────────────────
 */

export type SlotId =
  | "hero-photo"
  | "hero-ambient"
  | "impact-forest"
  | "impact-canopy"
  | "mission-texture";

export interface VisualSlot {
  id: SlotId;
  /** What the slot is for, in a sentence. */
  role: string;
  /** Ready to generate against — written to match the brand, not improvised. */
  prompt: string;
  /** Higgsfield model. Verified to exist; the catalog is still the authority. */
  model: string;
  aspect: string;
  /**
   * What the image shows. Kept as documentation even when the slot is
   * decorative, so nobody has to open the CDN to know what is in it.
   */
  alt: string;
  /**
   * True when the image is pure atmosphere sitting behind text that already
   * carries the meaning. Decorative slots render `alt=""`, which is both the
   * correct accessibility answer and the reason a failed load degrades to
   * nothing rather than to a paragraph of alt text across the layout.
   */
  decorative?: boolean;
  status: "placeholder" | "generated";
  /**
   * Where the asset lives. Currently the Higgsfield CDN; move these into
   * `public/visuals/` before production so the page owns its own images.
   */
  src?: string;
  /**
   * An asset already generated for this slot, still sitting in Higgsfield.
   * Download it, put it in `public/visuals/`, then set `src` and `status`.
   */
  generated?: { url: string; model: string };
  /** Another take on the same slot, kept so the choice can be revisited. */
  alternate?: string;
}

const BRAND =
  "near-black #121215 background, single cool electric-blue accent #3d7dff used sparingly, " +
  "frosted translucent glass surfaces with soft depth and light catching the edges, " +
  "hairline highlights, precise and restrained, cinematic macro, high detail, no text, " +
  "no logos, no people, no stock-photo styling";

export const VISUAL_SLOTS: Record<SlotId, VisualSlot> = {
  /**
   * The one image on the page that isn't brand atmosphere. It's a real place
   * at dusk, and it's here because the impact promise is about land — a page
   * that talks about planting trees and shows only frosted glass is asking to
   * be disbelieved.
   */
  "hero-photo": {
    id: "hero-photo",
    role: "Full-bleed photograph behind the wordmark at the top of the page.",
    prompt:
      `Painterly landscape photograph at dusk, wide open valley with a still shallow ` +
      `river winding through low green meadow grass, dense dark treelines on both sides ` +
      `framing the view, distant soft hills. Sky is a broad gradient of deep teal-cyan ` +
      `fading into muted rose and dusty pink near the horizon, faint stars in the upper ` +
      `corners. Cool soft diffuse light, the last minutes after sunset. Muted ` +
      `desaturated colour, slight film grain, subtle vignette, painterly matte-painting ` +
      `quality, generous empty sky in the upper middle third for text to sit over. ` +
      `No text, no logos, no people, no buildings, no watermarks.`,
    model: "nano_banana_pro",
    aspect: "16:9",
    alt:
      "A river valley at dusk, dark treelines on both sides under a teal sky fading to rose.",
    decorative: true,
    status: "generated",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260806_185822_6af62224-7a42-453b-8e78-f6ec883a99e2.png",
    generated: {
      url: "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260806_185822_6af62224-7a42-453b-8e78-f6ec883a99e2.png",
      model: "nano_banana_pro",
    },
    /** A second take on the same prompt, kept so the choice can be revisited. */
    alternate:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260806_185822_d68e1804-882c-4ae3-83f6-6ca4ae3edf8f.png",
  },

  "hero-ambient": {
    id: "hero-ambient",
    role: "Ambient light behind the hero, under the product mock-up.",
    prompt:
      `Abstract composition of thin frosted glass panels floating in dark space, ` +
      `edge-lit by one cool blue light source, deep falloff into black, ` +
      `volumetric haze, extremely subtle. ${BRAND}`,
    model: "nano_banana",
    aspect: "16:9",
    alt:
      "Frosted glass panels floating in near-black space, edge-lit in cool blue.",
    decorative: true,
    status: "generated",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260805_090818_0f485780-8b7a-4c9d-a9cc-027428e447a4.png",
    generated: {
      url: "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260805_090818_0f485780-8b7a-4c9d-a9cc-027428e447a4.png",
      model: "nano_banana",
    },
  },
  "impact-forest": {
    id: "impact-forest",
    role: "The full-bleed forest band that opens the impact section.",
    prompt:
      `Wide cinematic aerial view over a vast dense forest canopy at dawn, thick low ` +
      `fog drifting between the treetops, deep cool desaturated blue-green tones, almost ` +
      `monochrome, very dark and moody, deep shadows in the valleys, one soft cool light ` +
      `low on the horizon. ${BRAND}`,
    model: "nano_banana",
    aspect: "21:9",
    alt: "An aerial view over a dense forest canopy at dawn, with fog between the treetops.",
    decorative: true,
    status: "generated",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260805_094924_4265ebef-7e93-45c0-8776-b40fe4c1c266.png",
    generated: {
      url: "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260805_094924_4265ebef-7e93-45c0-8776-b40fe4c1c266.png",
      model: "nano_banana",
    },
    /** A second take: looking up through pines into fog, 16:9. */
    alternate:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260805_094924_51e15411-b9d5-4da5-a242-071ccae18150.png",
  },
  "impact-canopy": {
    id: "impact-canopy",
    role: "The trees moment in the impact section.",
    prompt:
      `A single young sapling with a few leaves, lit by one cool rim light against ` +
      `near-black, macro, shallow depth of field, dew on the leaf edges, calm and quiet, ` +
      `not triumphant. ${BRAND}`,
    model: "nano_banana",
    aspect: "4:3",
    alt:
      "A young sapling lit by a single cool rim light against near-black.",
    decorative: true,
    status: "generated",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260805_090828_4ed28e26-eca9-4c04-ae82-bdc378e85f61.png",
    generated: {
      url: "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260805_090828_4ed28e26-eca9-4c04-ae82-bdc378e85f61.png",
      model: "nano_banana",
    },
  },
  "mission-texture": {
    id: "mission-texture",
    role: "Quiet texture behind the statement of intent.",
    prompt:
      `Extreme macro of brushed dark glass with a faint blue caustic sweeping across it, ` +
      `almost black, nearly abstract, gentle gradient, no focal subject. ${BRAND}`,
    model: "nano_banana",
    aspect: "21:9",
    alt:
      "Brushed dark glass with a faint blue caustic sweeping across it.",
    decorative: true,
    status: "generated",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260805_090828_774c525c-0ef3-4486-bfdc-e414bc16198c.png",
    generated: {
      url: "https://d8j0ntlcm91z4.cloudfront.net/user_3EWli8CAM0sQ73ZEQAcK2HryYZM/hf_20260805_090828_774c525c-0ef3-4486-bfdc-e414bc16198c.png",
      model: "nano_banana",
    },
  },
};

export const slot = (id: SlotId): VisualSlot => VISUAL_SLOTS[id];

/** True when a slot has a real asset behind it. */
export const isFilled = (
  s: VisualSlot,
): s is VisualSlot & { src: string } =>
  s.status === "generated" && typeof s.src === "string" && s.src.length > 0;

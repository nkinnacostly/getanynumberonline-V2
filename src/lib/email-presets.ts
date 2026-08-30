import { type CampaignDraft, heroImageUrl } from "@/lib/admin-api";

/**
 * Ready-written campaigns.
 *
 * A preset is content, not a layout — it loads into the composer and is fully
 * editable before it goes anywhere. That matters: a launch email that can only
 * be sent verbatim gets sent verbatim, typos and stale prices included.
 *
 * Every claim here is checked against what the product actually does:
 * data-only (no calls or SMS), paid from the wallet, activated by QR or LPA
 * string, usage visible in the dashboard. Do not add a number to this copy
 * that the dashboard cannot back up.
 */
export interface EmailPreset {
  id: string;
  name: string;
  /** What the admin sees before loading it. */
  summary: string;
  draft: CampaignDraft;
}

export const EMAIL_PRESETS: EmailPreset[] = [
  {
    id: "esim-launch",
    name: "eSIM launch",
    summary:
      "Announces data-only eSIMs to the whole list: what it is, how to install it, and why it beats roaming.",
    draft: {
      template: "promo",
      hero_image: heroImageUrl("hero-travel.jpg"),
      subject: "Your phone can now have data in 190+ countries",
      preheader:
        "No roaming bill, no airport SIM queue — and your own number stays exactly where it is.",
      headline: "Data that works the second you land",
      cta_label: "Browse data plans",
      cta_url: "https://www.getanynumberonline.com/dashboard/esim",
      body: `You already use us for numbers. The same wallet now buys you mobile data in **190+ countries** — no plastic SIM, no shop, no queue.

## What it is

A data-only eSIM: a mobile data plan that installs on your phone as software. Pick a country or region, choose how much data and how many days, and pay from your GetAnyNumberOnline balance. Nothing arrives in the post.

It is **data only** — no calls, no SMS, and that is exactly the point. Your own number stays live on your physical SIM, so WhatsApp, Telegram and your bank OTPs carry on as normal while the eSIM handles the internet.

## Why you'll want one

- Roaming from your home carrier is the most expensive data you will ever buy.
- Airport SIM kiosks cost you an hour, your passport, and a price written for tourists.
- Hotel and café wifi is slow, shared, and a poor place to open your bank app.
- Installed before you fly, you land already online — maps, ride-hailing and messages from the door of the plane.

## How to set it up — about two minutes

- Open **Data eSIM** in your dashboard, pick your destination, and choose a plan by size and length.
- Pay from your wallet. The plan is usually ready in under a minute.
- Tap **Install on iPhone**, or scan the QR code from another device. On Android: **Settings → Network → SIMs → Add eSIM**.
- On arrival, set the eSIM as your **default data line**. That's it.

Do the install at home on wifi. Scanning a QR code is much easier before you are standing in an arrivals hall.

## Check one thing first

Your phone needs to support eSIM and be carrier-unlocked. Most phones from the last few years do — iPhone XS and newer, Pixel 3 and newer, Galaxy S20 and newer.

Your remaining data is always visible in the dashboard, so you can top up before you run out rather than after.

Travelling soon? Set it up before you go.`,
    },
  },
];

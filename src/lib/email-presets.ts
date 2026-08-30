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
      "Announces data-only eSIMs to the whole list: what it is, how to install it, and why it earns its place both at home and abroad.",
    draft: {
      template: "promo",
      // Deliberately the neutral phone shot, not the airport one: the whole
      // point of this revision is that the feature is not travel-only.
      hero_image: heroImageUrl("hero-phone.jpg"),
      subject: "Mobile data, straight from your wallet balance",
      preheader:
        "Buy data in Nigeria or 190+ other countries — no plastic SIM, and your number stays exactly where it is.",
      headline: "Data on your phone, at home or abroad",
      cta_label: "See plans and prices",
      cta_url: "https://www.getanynumberonline.com/dashboard/esim",
      body: `You already keep a balance with us for numbers. That same balance now buys **mobile data** — in Nigeria and 190+ other countries — as a data-only eSIM.

## What it is

A data plan that installs on your phone as software. No plastic SIM, nothing in the post. Pick where you want data, how much, and for how many days, then pay from your GetAnyNumberOnline balance.

It is **data only** — no calls, no SMS, and that is the point. Your number stays live on your physical SIM, so WhatsApp, Telegram and your bank OTPs carry on exactly as before while the eSIM handles the internet.

## Using it at home

- Top up data straight from the balance you already keep with us — no card, no bank app, no kiosk.
- Keep a second data line for when your main network drops mid-transfer or mid-deadline. Two networks, one phone.
- Run work data separately from personal without carrying a second handset.
- Your main line is untouched. Same number, same calls, same SMS.

## Using it when you travel

- Roaming from your home carrier is the most expensive data you will ever buy.
- Airport SIM kiosks cost you an hour, your passport, and a price written for tourists.
- Install it before you fly and you land already online — maps, ride-hailing and messages from the door of the plane.

## How to set it up — about two minutes

- Open **Data eSIM** in your dashboard, pick your destination, and choose a plan by size and length.
- Pay from your wallet. The plan is usually ready in under a minute.
- Tap **Install on iPhone**, or scan the QR code from another device. On Android: **Settings → Network → SIMs → Add eSIM**.
- Set the eSIM as your **default data line** when you want to use it. Switch back any time.

Do the install somewhere with wifi. Scanning a QR code is easier before you need the data, not after.

## Check one thing first

Your phone needs to support eSIM and be carrier-unlocked. Most phones from the last few years do — iPhone XS and newer, Pixel 3 and newer, Galaxy S20 and newer.

Your remaining data is always visible in the dashboard, so you can top up before you run out rather than after.`,
    },
  },
];

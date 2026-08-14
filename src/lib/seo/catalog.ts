/**
 * Curated catalog for the public, crawlable pages.
 *
 * SMSPool lists 1,372 services across 152 countries. Generating a page for
 * every combination would produce hundreds of thousands of near-identical
 * URLs — textbook doorway pages, and a fast way to get the whole site
 * demoted. So this is a hand-picked set of services and countries that people
 * actually search for, and `dynamicParams = false` on the routes means
 * anything outside it 404s rather than becoming thin content.
 *
 * IDs are pinned rather than resolved by name at build time: SMSPool's
 * `service/retrieve_all` names are messy ("Twitter / X", "Google/Gmail") and
 * matching on them would silently break a page if they were edited upstream.
 * Pinning the ID keeps the price lookup correct and lets us show a clean
 * display name. Verified against the live catalog on 2026-08-05.
 */

export interface ServiceEntry {
  /** URL slug: /receive-sms/<slug> */
  slug: string;
  /** Clean brand name for headings and copy. */
  name: string;
  /** SMSPool service ID used for price lookups. */
  id: number;
  /** One-line description of what the number is used for. */
  purpose: string;
}

export interface CountryEntry {
  /** URL slug: /numbers/<slug> */
  slug: string;
  name: string;
  /** SMSPool country ID. */
  id: number;
  /** Alpha-2, used for the flag emoji and schema. */
  iso: string;
  /** Demonym / adjective for natural copy ("a UK number"). */
  adjective: string;
}

export const SERVICES: ServiceEntry[] = [
  { slug: "whatsapp", name: "WhatsApp", id: 1012, purpose: "activate a WhatsApp account or add a second one without using your personal SIM" },
  { slug: "telegram", name: "Telegram", id: 907, purpose: "sign in to Telegram or run a second account separate from your main number" },
  { slug: "google", name: "Google", id: 395, purpose: "verify a new Gmail or Google account when Google asks for phone confirmation" },
  { slug: "instagram", name: "Instagram", id: 457, purpose: "confirm a new Instagram or Threads account, or recover one that needs SMS" },
  { slug: "tiktok", name: "TikTok", id: 924, purpose: "register a TikTok account or verify one flagged for phone confirmation" },
  { slug: "twitter", name: "X (Twitter)", id: 948, purpose: "verify an X account during signup or unlock one asking for a phone number" },
  { slug: "facebook", name: "Facebook", id: 329, purpose: "confirm a Facebook or Meta account that requires SMS verification" },
  { slug: "discord", name: "Discord", id: 273, purpose: "verify a Discord account so you can join servers that require a phone number" },
  { slug: "openai", name: "OpenAI ChatGPT", id: 671, purpose: "complete the phone check when creating an OpenAI or ChatGPT account" },
  { slug: "uber", name: "Uber", id: 951, purpose: "sign up for Uber or Postmates without handing over your personal number" },
  { slug: "amazon", name: "Amazon", id: 39, purpose: "verify an Amazon or AWS account during registration" },
  { slug: "microsoft", name: "Microsoft", id: 1072, purpose: "confirm a Microsoft, Outlook or Bing account that requires SMS" },
  { slug: "tinder", name: "Tinder", id: 926, purpose: "create a Tinder profile on a number that isn't your personal one" },
  { slug: "netflix", name: "Netflix", id: 630, purpose: "verify a Netflix account or complete a household check" },
  { slug: "signal", name: "Signal", id: 829, purpose: "register Signal on a number that isn't tied to your personal identity" },
  { slug: "snapchat", name: "Snapchat", id: 846, purpose: "verify a Snapchat account during signup" },
  { slug: "linkedin", name: "LinkedIn", id: 523, purpose: "confirm a LinkedIn account that has been asked for phone verification" },
  { slug: "airbnb", name: "Airbnb", id: 28, purpose: "verify an Airbnb guest or host account" },
  { slug: "bumble", name: "Bumble", id: 142, purpose: "create a Bumble profile, which requires a non-VoIP mobile number" },
  { slug: "steam", name: "Steam", id: 868, purpose: "secure a Steam account or enable Steam Guard by SMS" },
  { slug: "apple", name: "Apple", id: 48, purpose: "verify an Apple ID during setup" },
  { slug: "twitch", name: "Twitch", id: 947, purpose: "verify a Twitch account so you can chat in phone-verified channels" },
  { slug: "ebay", name: "eBay", id: 305, purpose: "confirm an eBay buyer or seller account" },
  { slug: "viber", name: "Viber", id: 978, purpose: "activate Viber on a temporary number" },
  { slug: "wechat", name: "WeChat", id: 1004, purpose: "register WeChat, which requires SMS confirmation" },
  { slug: "lyft", name: "Lyft", id: 542, purpose: "sign up for Lyft with a verifiable mobile number" },
  { slug: "doordash", name: "DoorDash", id: 280, purpose: "verify a DoorDash account at signup" },
  { slug: "yahoo", name: "Yahoo", id: 1034, purpose: "confirm a Yahoo Mail account" },
  { slug: "alibaba", name: "Alibaba", id: 33, purpose: "verify an Alibaba buyer account" },
  { slug: "grab", name: "Grab", id: 1093, purpose: "register for Grab in Southeast Asia" },
  { slug: "bolt", name: "Bolt", id: 124, purpose: "sign up for Bolt rides or delivery" },
  { slug: "line", name: "LINE", id: 522, purpose: "activate LINE messenger on a temporary number" },
  { slug: "kakaotalk", name: "KakaoTalk", id: 487, purpose: "register KakaoTalk, which requires SMS verification" },
  { slug: "yandex", name: "Yandex", id: 1036, purpose: "verify a Yandex account" },
];

export const COUNTRIES: CountryEntry[] = [
  { slug: "usa", name: "United States", id: 1, iso: "US", adjective: "US" },
  { slug: "uk", name: "United Kingdom", id: 2, iso: "GB", adjective: "UK" },
  { slug: "germany", name: "Germany", id: 24, iso: "DE", adjective: "German" },
  { slug: "france", name: "France", id: 23, iso: "FR", adjective: "French" },
  { slug: "netherlands", name: "Netherlands", id: 3, iso: "NL", adjective: "Dutch" },
  { slug: "spain", name: "Spain", id: 55, iso: "ES", adjective: "Spanish" },
  { slug: "italy", name: "Italy", id: 79, iso: "IT", adjective: "Italian" },
  { slug: "poland", name: "Poland", id: 21, iso: "PL", adjective: "Polish" },
  { slug: "sweden", name: "Sweden", id: 6, iso: "SE", adjective: "Swedish" },
  { slug: "india", name: "India", id: 15, iso: "IN", adjective: "Indian" },
  { slug: "indonesia", name: "Indonesia", id: 9, iso: "ID", adjective: "Indonesian" },
  { slug: "philippines", name: "Philippines", id: 12, iso: "PH", adjective: "Philippine" },
  { slug: "nigeria", name: "Nigeria", id: 14, iso: "NG", adjective: "Nigerian" },
  { slug: "south-africa", name: "South Africa", id: 153, iso: "ZA", adjective: "South African" },
  { slug: "brazil", name: "Brazil", id: 68, iso: "BR", adjective: "Brazilian" },
  { slug: "mexico", name: "Mexico", id: 53, iso: "MX", adjective: "Mexican" },
  { slug: "australia", name: "Australia", id: 159, iso: "AU", adjective: "Australian" },
  { slug: "romania", name: "Romania", id: 13, iso: "RO", adjective: "Romanian" },
  { slug: "portugal", name: "Portugal", id: 8, iso: "PT", adjective: "Portuguese" },
  { slug: "ireland", name: "Ireland", id: 32, iso: "IE", adjective: "Irish" },
  { slug: "ukraine", name: "Ukraine", id: 25, iso: "UA", adjective: "Ukrainian" },
  { slug: "turkey", name: "Turkey", id: 60, iso: "TR", adjective: "Turkish" },
  { slug: "vietnam", name: "Vietnam", id: 11, iso: "VN", adjective: "Vietnamese" },
  { slug: "thailand", name: "Thailand", id: 52, iso: "TH", adjective: "Thai" },
  { slug: "kenya", name: "Kenya", id: 16, iso: "KE", adjective: "Kenyan" },
];

/**
 * Pre-rendered at build time. The rest are generated on first request and
 * then cached by ISR, which keeps the build fast without losing coverage.
 */
export const TOP_SERVICE_SLUGS = [
  "whatsapp", "telegram", "google", "instagram", "tiktok",
  "twitter", "discord", "openai", "tinder", "facebook",
];

export const TOP_COUNTRY_SLUGS = [
  "usa", "uk", "germany", "france", "india", "nigeria", "indonesia", "philippines",
];

/** Countries priced on each service page, and columns of the pricing matrix. */
export const PRICING_COUNTRY_SLUGS = TOP_COUNTRY_SLUGS;

/** Services priced on each country page, and rows of the pricing matrix. */
export const PRICING_SERVICE_SLUGS = [
  "whatsapp", "telegram", "google", "instagram", "tiktok",
  "twitter", "discord", "openai", "tinder", "facebook",
  "signal", "uber",
];

export function findService(slug: string): ServiceEntry | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function findCountry(slug: string): CountryEntry | undefined {
  return COUNTRIES.find((c) => c.slug === slug);
}

export function servicesBySlugs(slugs: string[]): ServiceEntry[] {
  return slugs.map(findService).filter((s): s is ServiceEntry => !!s);
}

export function countriesBySlugs(slugs: string[]): CountryEntry[] {
  return slugs.map(findCountry).filter((c): c is CountryEntry => !!c);
}

/** Regional-indicator flag emoji from an alpha-2 code. */
export function flagEmoji(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

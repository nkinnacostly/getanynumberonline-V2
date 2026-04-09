const services = [
  "WhatsApp",
  "Google",
  "Telegram",
  "Discord",
  "Twitter",
  "Instagram",
  "TikTok",
  "Binance",
  "Coinbase",
  "OpenAI",
  "Netflix",
  "Uber",
  "Amazon",
  "PayPal",
  "Tinder",
];

export default function ServiceTicker() {
  // Duplicate the list for seamless looping
  const items = [...services, ...services];

  return (
    <div className="w-full overflow-hidden border-t border-b border-[#1A1A1A] py-4">
      <div className="ticker-track flex w-max whitespace-nowrap">
        {items.map((name, i) => (
          <span key={i} className="font-mono text-[13px] text-[#555555] mx-4">
            {name}
            <span className="ml-4">&mdash;</span>
          </span>
        ))}
      </div>
    </div>
  );
}

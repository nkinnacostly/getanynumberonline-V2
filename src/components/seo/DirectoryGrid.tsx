import Link from "next/link";

/**
 * A grid of links into the programmatic pages.
 *
 * Shared by both hubs because the only thing that differs between "every
 * country" and "every service" is the label and the href — and the whole point
 * of these pages is the link graph, which should be identical in shape.
 */
export default function DirectoryGrid({
  items,
}: {
  items: { href: string; label: string; sub?: string }[];
}) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="flex flex-col gap-0.5 px-4 py-3 rounded-md border border-line bg-surface hover:border-accent/40 transition-colors h-full"
          >
            <span className="font-sans text-sm font-medium text-foreground">
              {item.label}
            </span>
            {item.sub && (
              <span className="font-mono text-[11px] text-muted leading-snug">
                {item.sub}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

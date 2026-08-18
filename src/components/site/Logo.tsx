/**
 * The GANO wordmark — g, a, n, o, for GetAnyNumberOnline.
 *
 * Recoloured from the supplied two-tone artwork (warm black #141312 on cream
 * #FDFAF7) onto the product palette. Two things changed beyond the colours:
 *
 * 1. The counters — the holes in the g, a, n and o, plus the ring separating
 *    the g's descender from the a — were opaque cream circles painted on top.
 *    Here they are knocked out with a mask, so they are genuinely transparent.
 *    That matters because the original only worked on its own cream background;
 *    this sits correctly on #080808, on a #0F0F0F card, on an OG image, or on
 *    white.
 *
 * 2. The mark draws in `currentColor`, so one file serves every context —
 *    #F5F5F5 in the nav, #00FF94 where the accent is earned, #555555 when
 *    muted. Colour is set by the caller with `className` or `style`.
 *
 * Server-renderable: no hooks, no client JS. `id` only needs overriding if two
 * instances share a page and you want strictly valid unique IDs.
 */
export default function Logo({
  className = "",
  title = "GetAnyNumberOnline",
  id = "gano",
  ...rest
}: React.SVGProps<SVGSVGElement> & { title?: string; id?: string }) {
  const maskId = `${id}-counters`;

  return (
    <svg
      viewBox="160 460 1072 470"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
      {...rest}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="160" y="460" width="1072" height="470">
        {/* White paints the letterforms, black cuts them away. Order matters:
            the r=146 disc must land after the g's descender to clear the gap,
            and before the a, which is drawn back over the top of it. */}
        <circle cx="300" cy="610" r="130" fill="#fff" />
        <path
          d="M 384 526 L 384 780 Q 384 854 310 854"
          fill="none"
          stroke="#fff"
          strokeWidth="92"
          strokeLinecap="round"
        />
        <circle cx="552" cy="610" r="146" fill="#000" />
        <circle cx="552" cy="610" r="130" fill="#fff" />
        <rect x="590" y="480" width="92" height="260" fill="#fff" />
        <path d="M 692 740 L 692 610 A 130 130 0 0 1 952 610 L 952 740 Z" fill="#fff" />
        <circle cx="1082" cy="610" r="130" fill="#fff" />

        {/* Counters */}
        <circle cx="300" cy="610" r="26" fill="#000" />
        <circle cx="552" cy="610" r="26" fill="#000" />
        <path d="M 782 740 L 782 640 A 40 40 0 0 1 862 640 L 862 740 Z" fill="#000" />
        <circle cx="1082" cy="610" r="26" fill="#000" />
      </mask>

      <rect
        x="160"
        y="460"
        width="1072"
        height="470"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}

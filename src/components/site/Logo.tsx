/**
 * The GANO mark — a rounded square with the G and its speech-bubble tail.
 *
 * Two things about how it is drawn:
 *
 * 1. The G is a KNOCKOUT, not a white shape. The single path is the square
 *    with the letterform subtracted, exactly as the source artwork draws it,
 *    so the G always takes the colour of whatever is behind the mark — the
 *    page on the landing header, the card in a sidebar, the tab strip in a
 *    favicon. One file works on #080808, on a #0F0F0F card and on white.
 *
 * 2. It fills with `currentColor`, so colour is set by the caller with
 *    `className` or `style` (CLAUDE.md §13's one literal-colour exception).
 *    In practice that is `text-accent` everywhere: mint in dark, emerald in
 *    light.
 *
 * Server-renderable: no hooks, no client JS, no <text> (which would depend on
 * Syne having loaded). The square is slightly wider than tall — 184.86 x
 * 171.11 — so size it by height and let the width follow.
 */
export default function Logo({
  className = "",
  title = "GetAnyNumberOnline",
  ...rest
}: React.SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="328.52 212.09 184.86 171.11"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
      {...rest}
    >
      <path
        fill="currentColor"
        d="m497.45,212.09h-153c-8.8,0-15.93,7.13-15.93,15.93v139.25c0,8.8,7.13,15.93,15.93,15.93h153c8.8,0,15.93-7.13,15.93-15.93v-139.25c0-8.8-7.13-15.93-15.93-15.93Zm-6.64,156.9h-25.44c0-4.57.29-9.84.89-15.82.02-.2.04-.41.06-.61-9.74,7.82-21.78,13.61-34.98,15.07-45.95,5.09-78.81-30.06-80.21-67.32-1.57-41.77,32.88-77.17,77.33-73.8,33.33,2.53,60.81,31.81,62.29,56.14h-34.19c-10.57-17.89-25.47-26.38-46.3-19.93-13.91,4.31-24.74,18.69-24.77,32.91-.05,21.58,12.11,33.69,32.54,38.97-2.6,6.76-7.17,11.63-12.76,15.9,12.26.77,22.67-3.59,31.87-10.68,7.52-5.79,13.12-13.14,16.9-21.72h-48.6v-18.8h85.38v69.68Zm-51.31-83.3c0,1.88-1.52,3.4-3.4,3.4s-3.4-1.52-3.4-3.4,1.52-3.4,3.4-3.4,3.4,1.52,3.4,3.4Zm-11.6,0c0,2.61-2.11,4.72-4.72,4.72s-4.72-2.11-4.72-4.72,2.11-4.72,4.72-4.72,4.72,2.11,4.72,4.72Zm-14.23,0c0,1.88-1.52,3.4-3.4,3.4s-3.4-1.52-3.4-3.4,1.52-3.4,3.4-3.4,3.4,1.52,3.4,3.4Z"
      />
    </svg>
  );
}

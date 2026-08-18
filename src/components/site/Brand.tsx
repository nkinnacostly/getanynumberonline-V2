import Logo from "./Logo";

/**
 * The brand lockup: the GANO mark plus the name.
 *
 * Three places rendered their own version of this — the marketing nav, the
 * footer and the admin rail — each with its own copy of the green block and a
 * different spelling of the name. One component now, so the next brand change
 * is one edit rather than three.
 *
 * The mark carries the accent and the name stays in text colour, which is the
 * treatment the old `█ name` lockup already used: the green presence is kept
 * small, per §13's "accent used sparingly".
 *
 * The name is spelled "getanynumberonline" everywhere now. It previously read
 * "getnumber" in the marketing nav and footer while every metadata tag, the
 * legal name and the domain said otherwise — that was the open TODO(brand),
 * and this resolves it toward the spelling everything else already used.
 *
 * Pass `showName={false}` for the mark alone once it is recognisable enough to
 * stand by itself. It is left on by default because four letters give a
 * first-time visitor nothing to search for.
 */
export default function Brand({
  markHeight = 20,
  showName = true,
  id = "brand",
  className = "",
  markClassName = "text-[#00FF94]",
  nameClassName = "text-[#F5F5F5] text-sm",
}: {
  /** Rendered height of the mark in px; width follows the aspect ratio. */
  markHeight?: number;
  showName?: boolean;
  /** Must be unique if two lockups share a page — it namespaces the SVG mask. */
  id?: string;
  className?: string;
  markClassName?: string;
  nameClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Logo
        id={id}
        className={`shrink-0 ${markClassName}`}
        style={{ height: markHeight, width: "auto" }}
      />
      {showName && (
        <span className={`font-mono leading-none ${nameClassName}`}>
          getanynumberonline
        </span>
      )}
    </span>
  );
}

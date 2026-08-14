import type { FaqItem } from "@/lib/seo/jsonld";

/**
 * FAQ accordion built on <details>/<summary>.
 *
 * Deliberately not a client component: native disclosure needs no JS, and the
 * answers are present in the server-rendered HTML. A JS-driven accordion that
 * only mounts answers on click hides them from crawlers, which would defeat
 * the FAQPage schema it's paired with.
 */
export default function Faq({
  items,
  heading = "Frequently asked questions",
  headingId,
}: {
  items: FaqItem[];
  heading?: string;
  headingId?: string;
}) {
  return (
    <section
      className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16"
      aria-labelledby={headingId ?? "faq-heading"}
    >
      <h2
        id={headingId ?? "faq-heading"}
        className="font-sans text-3xl sm:text-4xl font-bold text-[#F5F5F5] mb-8 text-center"
      >
        {heading}
      </h2>

      <div className="divide-y divide-[#1A1A1A] border-t border-b border-[#1A1A1A]">
        {items.map((item) => (
          <details key={item.question} className="group py-4">
            <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[#F5F5F5] text-[15px] font-medium min-h-[44px]">
              {item.question}
              <span
                aria-hidden="true"
                className="text-[#00FF94] shrink-0 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-[#555555] leading-relaxed">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

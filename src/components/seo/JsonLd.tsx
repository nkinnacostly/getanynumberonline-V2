/**
 * Renders a JSON-LD block. Server component — the script is in the initial
 * HTML, which is what crawlers read.
 *
 * JSON.stringify output is escaped for `<` so a stray "</script>" inside any
 * interpolated value can't break out of the tag.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  const payload = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // Content is built server-side from our own data, never user input.
      dangerouslySetInnerHTML={{ __html: payload }}
    />
  );
}

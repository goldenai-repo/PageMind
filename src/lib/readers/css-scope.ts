/**
 * Confine a stylesheet to `scope` so EPUB CSS cannot restyle the app chrome
 * (sidebar, header, notes). `html` / `body` map onto the scoped root.
 */
export function isolateCss(css: string, scope: string): string {
  const rewritten = css.replace(
    /(^|[\s,{>+~])(html|body)(?=[\s,{.#[:[>+~]|$)/gi,
    "$1:scope",
  );
  return `@scope (${scope}) {\n${rewritten}\n}`;
}

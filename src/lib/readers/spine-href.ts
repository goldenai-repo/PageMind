/** Match a tip/TOC href to a spine item (full path, suffix, or filename). */
export function spineIndexForHref(spineHrefs: string[], href: string): number {
  const file = href.split("#")[0]!.replace(/\\/g, "/");
  if (!file) return -1;
  return spineHrefs.findIndex((raw) => {
    const sh = raw.split("#")[0]!.replace(/\\/g, "/");
    return (
      sh === file ||
      sh.endsWith("/" + file) ||
      file.endsWith("/" + sh) ||
      sh.split("/").pop() === file.split("/").pop()
    );
  });
}

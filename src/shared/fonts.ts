// Add local font files under public/fonts/ and register their family here.
// Files are bundled into dist; no font request leaves the device.
export const bundledFonts = [{ family: "Inter", file: "fonts/inter.woff2" }];
export function fontFaces(root: string) {
  return bundledFonts
    .map(
      (f) =>
        `@font-face{font-family:${JSON.stringify(f.family)};src:url(${JSON.stringify(root + f.file)});font-display:swap}`,
    )
    .join("\n");
}

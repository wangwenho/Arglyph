// The test fonts `pnpm e2e` and `pnpm bench` open.
//
// They are not in git: font files are big, and a font's license is its own. There
// are two kinds, and `pnpm fetch:fixtures` makes both:
//
//   downloaded   real fonts, from a pinned commit of their own repository and
//                checked against a SHA-256, so every machine tests the same bytes
//   synthetic    made by scripts/fixtures/synthetic-fonts.ts: a font with exactly the gaps
//                the states checks need (glyphs that are mapped but empty), which
//                no font worth downloading has on purpose
//
// A font that is missing makes its checks skip on your machine; on CI (the CI
// environment variable) it makes them fail, so a run that tested nothing cannot
// look green.

const ROOT = "test/fixtures/fonts";

export const FONTS = {
  // Noto CJK ships as OpenType/CFF (.otf): the Sans and, with serifs, the Serif
  notoSans: `${ROOT}/NotoSansTC/NotoSansTC-Regular.otf`,
  notoSerif: `${ROOT}/NotoSerifTC/NotoSerifTC-Regular.otf`,
  // A Latin font with no CJK at all, in TrueType (glyf outlines)
  latin: `${ROOT}/Lato/Lato-Regular.ttf`,
  // Made by scripts/fixtures/synthetic-fonts.ts: plenty of undrawn glyphs, a few blank
  // ones and some glyphs with no code point
  synthesized: `${ROOT}/Synthesized/Synthesized-Regular.otf`,
};

const NOTO_CJK = "f8d157532fbfaeda587e826d4cd5b21a49186f7c";
const GOOGLE_FONTS = "86aced91de05cd4f96a06838124cca45be337b2b";

/**
 * What `pnpm fetch:fixtures` downloads. The addresses name a commit, not a branch,
 * so the file cannot change under us; the hash is there to notice a bad download.
 * To move to a newer font: change the commit, run the fetch with `--force`, and put
 * the hash it reports here. All three are SIL Open Font License 1.1.
 */
export const DOWNLOADS = [
  {
    path: FONTS.notoSans,
    url: `https://raw.githubusercontent.com/notofonts/noto-cjk/${NOTO_CJK}/Sans/SubsetOTF/TC/NotoSansTC-Regular.otf`,
    sha256: "5bab0cb3c1cf89dde07c4a95a4054b195afbcfe784d69d75c340780712237537",
  },
  {
    path: FONTS.notoSerif,
    url: `https://raw.githubusercontent.com/notofonts/noto-cjk/${NOTO_CJK}/Serif/SubsetOTF/TC/NotoSerifTC-Regular.otf`,
    sha256: "63515eb0622d589a2f4062e8757c598b3da3bffd053f69abd181c210158ef10c",
  },
  {
    path: FONTS.latin,
    url: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS}/ofl/lato/Lato-Regular.ttf`,
    sha256: "d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251",
  },
];

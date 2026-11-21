// Which Unicode Character Database release the extension is built against, and
// which of its files we use. Upgrading Unicode means changing UNICODE_VERSION,
// then running `pnpm fetch:unicode`, `pnpm gen:unicode` and the tests.

export const UNICODE_VERSION = "18.0.0";

/**
 * Files of the UCD (`/Public/<version>/ucd/`) that the generator reads, each
 * with what its first line must start with. Blocks.txt names its version
 * ("# Blocks-18.0.0.txt"); UnicodeData.txt has no header at all, it starts with
 * the first character, so there the check only catches an error page.
 */
export const UCD_FILES: readonly {
  name: string;
  firstLine: (version: string) => string;
}[] = [
  { name: "Blocks.txt", firstLine: (version) => `# Blocks-${version}.txt` },
  { name: "UnicodeData.txt", firstLine: () => "0000;<control>;Cc;" },
  {
    name: "DerivedCoreProperties.txt",
    firstLine: (version) => `# DerivedCoreProperties-${version}.txt`,
  },
];

export const UCD_BASE_URL = "https://www.unicode.org/Public";

/**
 * Where the untouched files are kept: `data/ucd/<file>`. There is no version in
 * the path: a new release overwrites them, and git shows the difference.
 */
export const UCD_DATA_DIR = "data/ucd";

/** The Unicode License text, which THIRD_PARTY_NOTICES reproduces. */
export const UCD_LICENSE_FILE = "data/ucd/license.txt";

/** The generated module that `src/core` imports. */
export const GENERATED_FILE = "src/core/unicode/data.generated.ts";

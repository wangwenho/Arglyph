// Import this before anything else in a script that names files relative to the
// repository root ("test/fixtures/...", "data/..."): it makes that true whatever
// folder the script was started from. (Run from another folder, the e2e used to
// leave a test/ folder there.)

import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));

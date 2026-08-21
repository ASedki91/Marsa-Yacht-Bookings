const fs = require("node:fs");
const path = require("node:path");

const userAgent = process.env.npm_config_user_agent ?? "";

if (!userAgent.startsWith("pnpm/")) {
  process.stderr.write("Use pnpm instead\n");
  process.exit(1);
}

for (const filename of ["package-lock.json", "yarn.lock"]) {
  fs.rmSync(path.resolve(__dirname, "..", filename), { force: true });
}

#!/usr/bin/env node

const { rotateOperatorToken } = require("../src/config/operator-token-settings.js");

async function main() {
  const result = await rotateOperatorToken();

  process.stdout.write(
    [
      `Operator token rotated in ${result.envFile}.`,
      `Old token rejected: ${result.oldTokenRejected}.`,
      `New token accepted: ${result.newTokenAccepted}.`,
      "Secret returned: false."
    ].join("\n") + "\n"
  );

  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  main
};

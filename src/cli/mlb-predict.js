#!/usr/bin/env node
// @ts-nocheck
const fs = require("node:fs/promises");
const { predictMlbGame } = require("../mlb/unified-machine.js");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--output") args.output = argv[++i];
    else if (argv[i] === "--compact") args.compact = true;
  }
  if (!args.input) throw new Error("usage: mlb-predict --input <file> [--output <file>] [--compact]");
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const input = JSON.parse(await fs.readFile(args.input, "utf8"));
  const output = predictMlbGame(input);
  const text = JSON.stringify(output, null, args.compact ? 0 : 2) + "\n";
  if (args.output) await fs.writeFile(args.output, text);
  else process.stdout.write(text);
  return output;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };

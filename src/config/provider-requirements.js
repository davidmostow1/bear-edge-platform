const fs = require("node:fs");
const path = require("node:path");

const { parseEnv } = require("./env.js");

const PROVIDER_REQUIREMENTS = Object.freeze([
  {
    id: "the-odds-api",
    name: "The Odds API",
    tier: "required",
    envKeys: ["THE_ODDS_API_KEY", "ODDS_API_KEY"],
    writableEnvKey: "THE_ODDS_API_KEY",
    verificationMode: "live",
    unlocks: [
      "Verified sportsbook odds",
      "DraftKings bookmaker feed",
      "MLB/NHL/tennis markets",
      "Player props and historical closing-line checks"
    ],
    docsUrl: "https://the-odds-api.com/liveapi/guides/v4/",
    signupUrl: "https://the-odds-api.com/"
  },
  {
    id: "sportsdataio",
    name: "SportsDataIO",
    tier: "recommended",
    envKeys: ["SPORTSDATAIO_API_KEY"],
    writableEnvKey: "SPORTSDATAIO_API_KEY",
    verificationMode: "saved",
    unlocks: [
      "Verified injuries",
      "Lineups and rosters",
      "Player stats",
      "MLB/NHL/tennis context"
    ],
    docsUrl: "https://sportsdata.io/developers/api-documentation",
    signupUrl: "https://sportsdata.io/"
  },
  {
    id: "sportradar",
    name: "Sportradar",
    tier: "enterprise",
    envKeys: ["SPORTRADAR_API_KEY"],
    writableEnvKey: "SPORTRADAR_API_KEY",
    verificationMode: "saved",
    unlocks: [
      "Official-grade sports data",
      "Lineups, rosters, injuries, and play-by-play",
      "MLB/NHL/tennis enterprise feeds"
    ],
    docsUrl: "https://developer.sportradar.com/",
    signupUrl: "https://sportradar.com/"
  },
  {
    id: "opticodds",
    name: "OpticOdds",
    tier: "alternative",
    envKeys: ["OPTICODDS_API_KEY"],
    writableEnvKey: "OPTICODDS_API_KEY",
    verificationMode: "saved",
    unlocks: [
      "Multi-book odds",
      "Streaming odds",
      "Props, injuries, lineups, bet grading, and limits"
    ],
    docsUrl: "https://developer.opticodds.com/docs/odds-api-getting-started-guide",
    signupUrl: "https://opticodds.com/"
  },
  {
    id: "sportsgameodds",
    name: "SportsGameOdds",
    tier: "alternative",
    envKeys: ["SPORTS_GAME_ODDS_API_KEY"],
    writableEnvKey: "SPORTS_GAME_ODDS_API_KEY",
    verificationMode: "saved",
    unlocks: [
      "Odds and player props",
      "Alternate lines",
      "Scores, results, and bet settlement"
    ],
    docsUrl: "https://sportsgameodds.com/",
    signupUrl: "https://sportsgameodds.com/"
  },
  {
    id: "tennis-stats",
    name: "Tennis stats provider",
    tier: "sport-specific",
    envKeys: ["TENNIS_API_KEY", "SPORTDEVS_API_KEY"],
    writableEnvKey: "TENNIS_API_KEY",
    verificationMode: "saved",
    unlocks: [
      "Automated tennis candidate generation",
      "Player form and match context",
      "Safer tennis risk gates"
    ],
    docsUrl: "https://sportsdata.io/developers/api-documentation/tennis",
    signupUrl: "https://sportsdata.io/"
  },
  {
    id: "weather",
    name: "Weather",
    tier: "optional",
    envKeys: ["OPENWEATHER_API_KEY"],
    writableEnvKey: "OPENWEATHER_API_KEY",
    verificationMode: "saved",
    unlocks: [
      "Paid/commercial weather backup",
      "Ballpark weather context"
    ],
    docsUrl: "https://openweathermap.org/api",
    signupUrl: "https://openweathermap.org/api",
    noKeyAlternative: "Open-Meteo is usable without a key for non-commercial/basic forecast checks."
  },
  {
    id: "exa",
    name: "Exa",
    tier: "optional",
    envKeys: ["EXA_API_KEY"],
    writableEnvKey: "EXA_API_KEY",
    verificationMode: "saved",
    unlocks: [
      "Research packet search",
      "News/context discovery",
      "Non-verdict supporting evidence"
    ],
    docsUrl: "https://docs.exa.ai/",
    signupUrl: "https://exa.ai/"
  },
  {
    id: "openai",
    name: "OpenAI",
    tier: "optional",
    envKeys: ["OPENAI_API_KEY"],
    writableEnvKey: "OPENAI_API_KEY",
    verificationMode: "saved",
    unlocks: [
      "AI-assisted summarization",
      "OCR or extraction upgrades",
      "Research packet formatting"
    ],
    docsUrl: "https://platform.openai.com/docs",
    signupUrl: "https://platform.openai.com/"
  }
]);

function readEnvFileState(rootDir, fileName) {
  const filePath = path.join(rootDir, fileName);

  if (!fs.existsSync(filePath)) {
    return {
      fileName,
      exists: false,
      keys: {}
    };
  }

  return {
    fileName,
    exists: true,
    keys: parseEnv(fs.readFileSync(filePath, "utf8"))
  };
}

function envKeyStatus(key, envFiles) {
  const fileEntries = envFiles
    .filter((file) => Object.prototype.hasOwnProperty.call(file.keys, key))
    .map((file) => ({
      fileName: file.fileName,
      present: true,
      empty: !String(file.keys[key] ?? "").trim()
    }));
  const processConfigured = Boolean(String(process.env[key] ?? "").trim());
  const savedLocally = fileEntries.some((entry) => !entry.empty);
  const blankInLocalFile = fileEntries.some((entry) => entry.empty);

  return {
    name: key,
    configured: processConfigured,
    savedLocally,
    blankInLocalFile,
    presentInLocalFile: fileEntries.length > 0,
    files: fileEntries
  };
}

function providerStatus(provider, envFiles) {
  const keyStatuses = provider.envKeys.map((key) => envKeyStatus(key, envFiles));
  const configured = keyStatuses.some((key) => key.configured);
  const savedLocally = keyStatuses.some((key) => key.savedLocally);
  const blankInLocalFile = keyStatuses.some((key) => key.blankInLocalFile);
  const status = configured ? "configured" : savedLocally ? "restart_needed" : blankInLocalFile ? "blank" : "missing";

  return {
    ...provider,
    status,
    configured,
    savedLocally,
    blankInLocalFile,
    usableNow: configured,
    secretReturned: false,
    keyStatuses
  };
}

function getProviderSetupStatus(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const envFiles = [readEnvFileState(rootDir, ".env.local"), readEnvFileState(rootDir, ".env")];
  const providers = PROVIDER_REQUIREMENTS.map((provider) => providerStatus(provider, envFiles));
  const required = providers.filter((provider) => provider.tier === "required");
  const recommended = providers.filter((provider) => provider.tier === "recommended");

  return {
    generatedAt: new Date().toISOString(),
    rootDir,
    envFiles: envFiles.map((file) => ({
      fileName: file.fileName,
      exists: file.exists
    })),
    providers,
    summary: {
      total: providers.length,
      configured: providers.filter((provider) => provider.configured).length,
      savedButNeedsRestart: providers.filter((provider) => provider.status === "restart_needed").length,
      blank: providers.filter((provider) => provider.status === "blank").length,
      missing: providers.filter((provider) => provider.status === "missing").length,
      requiredReady: required.every((provider) => provider.configured),
      recommendedReady: recommended.every((provider) => provider.configured)
    },
    notes: [
      "Keys are never returned by this endpoint.",
      "Configured means the currently running server process can use the key.",
      "Saved locally means a non-empty value exists in .env.local or .env, but the server may need restart if it was edited outside the dashboard."
    ]
  };
}

module.exports = {
  PROVIDER_REQUIREMENTS,
  getProviderSetupStatus
};

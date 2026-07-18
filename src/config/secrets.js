const SECRET_ENV_KEYS = Object.freeze([
  "THE_ODDS_API_KEY",
  "ODDS_API_KEY",
  "OPTICODDS_API_KEY",
  "SPORTS_GAME_ODDS_API_KEY",
  "SPORTSDATAIO_API_KEY",
  "SPORTRADAR_API_KEY",
  "TENNIS_API_KEY",
  "SPORTDEVS_API_KEY",
  "OPENWEATHER_API_KEY",
  "EXA_API_KEY",
  "OPENAI_API_KEY",
  "STATSIG_SERVER_SDK_SECRET",
  "BEAR_EDGE_OPERATOR_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY"
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSecrets(value) {
  let text = String(value ?? "");

  text = text
    .replace(/([?&](?:apiKey|api_key|key|token)=)[^&\s"']+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, "$1[REDACTED]");

  for (const envKey of SECRET_ENV_KEYS) {
    const secret = process.env[envKey];

    if (typeof secret !== "string" || secret.length < 4) {
      continue;
    }

    text = text.replace(new RegExp(escapeRegExp(secret), "g"), "[REDACTED]");
  }

  return text;
}

function safeErrorMessage(error) {
  return redactSecrets(error instanceof Error ? error.message : String(error));
}

module.exports = {
  SECRET_ENV_KEYS,
  redactSecrets,
  safeErrorMessage
};

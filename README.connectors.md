# Connectors & Backtest - Quickstart

1. Secrets:
   - Set CLAUDE_API_KEY and OPENAI_API_KEY in your secrets manager.
   - Do NOT check keys into repo.

2. Local dev:
   - pip install -r requirements.txt  # include pandas, numpy, requests, pytest
   - python backtest/backtest.py --input fixtures/historical.csv --out out/backtest

3. Running connector locally:
   - export OPENAI_API_KEY=...
   - python -c "from connectors.openai_adapter import OpenAIAdapter; a=OpenAIAdapter(api_key='${OPENAI_API_KEY}'); print(a.send_message('hello'))"

4. Routing:
   - Configure Router in router/router.py with mode 'single'|'failover'|'fanout'
   - Feature flag this in your config (ENV variable like PROVIDER_ROUTER_MODE)

5. Tests & CI:
   - Add tests under tests/
   - CI example in .github/workflows/ci.yml

Security notes:
 - Keys must be stored encrypted (Secrets Manager / GitHub Actions secrets).
 - Sanitize user inputs before forwarding to external providers.

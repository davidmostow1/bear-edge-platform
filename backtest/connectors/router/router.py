# router/router.py
from typing import List, Dict, Any
from connectors.anthropic_adapter import AnthropicAdapter
from connectors.openai_adapter import OpenAIAdapter
import os

class Router:
    def __init__(self, mode='single', primary='openai', adapters: Dict[str, Any]=None, fanout_enabled=False):
        """
        mode: 'single', 'failover', 'fanout'
        primary: 'openai' or 'anthropic'
        adapters: dict mapping provider keys to adapter instances
        """
        self.mode = mode
        self.primary = primary
        self.adapters = adapters or {}
        self.fanout_enabled = fanout_enabled

    def send(self, prompt: str) -> Dict[str, Any]:
        if self.mode == 'single':
            return self._call_provider(self.primary, prompt)
        elif self.mode == 'failover':
            try:
                return self._call_provider(self.primary, prompt)
            except Exception as e:
                # fallback
                fallback = 'anthropic' if self.primary == 'openai' else 'openai'
                return self._call_provider(fallback, prompt)
        elif self.mode == 'fanout':
            # call all adapters in parallel or sequentially (simple sequential example)
            results = {}
            for key, adapter in self.adapters.items():
                try:
                    results[key] = adapter.send_message(prompt)
                except Exception as e:
                    results[key] = {'error': str(e)}
            # naive choice: pick reply with lowest latency or highest tokens (customize)
            chosen = min(( (k, v) for k,v in results.items() if 'latency_ms' in v ), key=lambda kv: kv[1]['latency_ms'], default=None)
            if chosen:
                return {'chosen_provider': chosen[0], 'responses': results, 'selected': results[chosen[0]]}
            return {'responses': results}
        else:
            raise ValueError("unknown routing mode")

    def _call_provider(self, provider_key: str, prompt: str):
        adapter = self.adapters.get(provider_key)
        if adapter is None:
            raise ValueError(f"No adapter configured for {provider_key}")
        return adapter.send_message(prompt)

# connectors/anthropic_adapter.py
import requests
from .base_adapter import BaseAdapter
import os

class AnthropicAdapter(BaseAdapter):
    def __init__(self, api_key: str, model: str='claude-2', timeout: int=30):
        super().__init__(api_key, {'model': model, 'timeout': timeout})
        self.endpoint = 'https://api.anthropic.com/v1'  # adjust per API spec

    def send_message(self, prompt: str, **kwargs):
        model = self.config['model']
        timeout = self.config['timeout']
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        payload = {
            'model': model,
            'prompt': prompt,
            **kwargs
        }
        def call():
            r = requests.post(f"{self.endpoint}/responses", json=payload, headers=headers, timeout=timeout)
            r.raise_for_status()
            return r.json()
        res, latency = self._timed_call(call)
        # Map response to common shape:
        text = res.get('output', '') if isinstance(res, dict) else ''
        tokens = res.get('usage', {}).get('total_tokens') if isinstance(res, dict) else None
        return {
            'reply': text,
            'tokens_used': tokens,
            'latency_ms': latency,
            'provider_meta': {'provider': 'anthropic', 'model': model, 'raw': res}
        }

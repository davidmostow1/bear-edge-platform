# connectors/openai_adapter.py
import os
import requests
from .base_adapter import BaseAdapter

class OpenAIAdapter(BaseAdapter):
    def __init__(self, api_key: str, model: str='gpt-4o', timeout: int=30):
        super().__init__(api_key, {'model': model, 'timeout': timeout})
        self.endpoint = 'https://api.openai.com/v1'

    def send_message(self, prompt: str, **kwargs):
        model = self.config['model']
        timeout = self.config['timeout']
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        payload = {
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            **kwargs
        }
        def call():
            r = requests.post(f"{self.endpoint}/chat/completions", json=payload, headers=headers, timeout=timeout)
            r.raise_for_status()
            return r.json()
        res, latency = self._timed_call(call)
        # parse response
        text = ''
        tokens = None
        if isinstance(res, dict):
            choices = res.get('choices', [])
            if choices:
                text = choices[0].get('message', {}).get('content', '')
            tokens = res.get('usage', {}).get('total_tokens')
        return {
            'reply': text,
            'tokens_used': tokens,
            'latency_ms': latency,
            'provider_meta': {'provider': 'openai', 'model': model, 'raw': res}
        }

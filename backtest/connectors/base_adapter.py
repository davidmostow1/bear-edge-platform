# connectors/base_adapter.py
from abc import ABC, abstractmethod
import time
from typing import Dict, Any

class BaseAdapter(ABC):
    def __init__(self, api_key: str, config: Dict[str, Any]=None):
        self.api_key = api_key
        self.config = config or {}

    @abstractmethod
    def send_message(self, prompt: str, **kwargs) -> Dict[str, Any]:
        """
        Returns:
          {
            'reply': str,
            'tokens_used': int,   # if available
            'latency_ms': float,
            'provider_meta': {...}
          }
        """
        pass

    def _timed_call(self, fn, *args, **kwargs):
        start = time.time()
        res = fn(*args, **kwargs)
        latency = (time.time() - start) * 1000.0
        return res, latency

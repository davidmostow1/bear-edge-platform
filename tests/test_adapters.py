# tests/test_adapters.py
# pytest skeleton for adapters (mock HTTP responses)
import pytest
from connectors.base_adapter import BaseAdapter

def test_anthropic_adapter_mock(monkeypatch):
    # monkeypatch requests.post to return a fake response
    pass

def test_openai_adapter_mock(monkeypatch):
    # monkeypatch requests.post or openai client
    pass

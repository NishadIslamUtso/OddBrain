"""Stub of Hermes's ``agent`` package, for running the provider tests on a
ordinary machine.

The real provider imports ``agent.memory_provider`` and ``tools.registry``
because it runs inside Hermes. Those modules only exist in a Hermes install,
which made ``tests/test_provider.py`` and ``tests/test_anonymous.py`` fail
with ``No module named 'agent'`` anywhere else — and because those files were
not wired into ``run_tests.py``, nobody saw it.

The stub mirrors the real signatures closely enough that the provider's own
tests mean something; it is only used when the real package is absent.
"""

from __future__ import annotations

__version__ = "0.0.0-stub"

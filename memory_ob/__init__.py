"""Memory_OB — a personal memory engine.

Capture anything. Trust is a score. Truth is a signature.

The package is deliberately dependency-light: the store is SQLite (stdlib),
search uses FTS5 (stdlib), and quotes use hashlib (stdlib). Model calls
(reading what you say, meaning search) go through :mod:`memory_ob.models` and are
optional at runtime.
"""

from __future__ import annotations

__version__ = "0.1.0"
__all__ = ["__version__"]

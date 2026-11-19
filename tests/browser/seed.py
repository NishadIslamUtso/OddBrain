"""Fill a fresh Memory_OB with the same small, realistic set of memories the browser checks expect.

usage: python seed.py <token file> [base url]
"""
import json
import sys
import urllib.request

tok = open(sys.argv[1]).read().strip()
base = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8791"


def post(path, body):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Memory-OB-Token": tok},
        method="POST",
    )
    return json.load(urllib.request.urlopen(req))


texts = [
    "I live in Dhaka and I study CSE at BRAC University.",
    "My sister Aisha is a doctor and she lives in Sylhet.",
    "I am allergic to peanuts.",
    "I want to start a small online clothing business. I'll come back to this business idea in a year.",
    "I play football on weekends and I love cricket.",
    "My budget for rent is 12000 taka a month.",
    "I plan to learn Rust next month.",
    "My friend Rahim Uddin is helping me with the app idea.",
    "I need to renew my passport.",
]
for t in texts:
    print(post("/api/tell", {"text": t})["message"])
print(post("/api/tell", {"text": "I moved to Chittagong, I no longer live in Dhaka."})["message"])
post("/api/journal/entry", {"text": "Started building the memory plugin today.", "day": "2026-11-01"})
post("/api/people", {"name": "Aisha Rahman", "relation": "cousin"})
post("/api/journal/biography", {"action": "rewrite"})

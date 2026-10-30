#!/usr/bin/env python3
"""
Brain vault initializer — creates the 12-folder vault structure.
Run once before first use.
"""
import pathlib

VAULT = pathlib.Path(r"C:\Users\Nishad Islam Utso\Documents\Hermes\Memory_OB")

FOLDERS = [
    "00 System", "01 Inbox", "02 Sources", "03 Memory",
    "04 Working Memory", "05 Knowledge", "06 Review/proposals",
    "07 Sharing Receipts", "08 Journal", "09 Activity & Undo",
    "10 People", "90 Archive", ".brain"
]

def main():
    for folder in FOLDERS:
        path = VAULT / folder
        path.mkdir(parents=True, exist_ok=True)
        print(f"Created: {path}")

    # Create index.json
    index = VAULT / ".brain" / "index.json"
    if not index.exists():
        index.write_text('{"version": 1, "brain_path": "", "next_id": 1, "last_scan": null, "total_records": 0}')
        print(f"Created: {index}")

    # Create README
    readme = VAULT / "README.md"
    if not readme.exists():
        readme.write_text("""# Memory_OB Vault

This is the canonical memory store for Hermes + Brain.

## Folder structure

- 00 System — vault rules and system docs
- 01 Inbox — raw intake, unprocessed
- 02 Sources — original sources (imports, captures)
- 03 Memory — confirmed memories
- 04 Working Memory — active WIP, current tasks
- 05 Knowledge — research, facts, how-tos
- 06 Review/proposals — pending proposals awaiting approval
- 07 Sharing Receipts — what was shared, with whom
- 08 Journal — build logs, session notes
- 09 Activity & Undo — actions, retractions, undo history
- 10 People — people, preferences, relationships
- 90 Archive — retracted/denied records (never deleted)

## Rules

- Everything starts as raw unconfirmed evidence
- Nothing is confirmed without user approval in the Review tab
- Nothing is ever permanently deleted — retracted records go to 90 Archive
- All times are Asia/Dhaka (+06:00) by default
""")
        print(f"Created: {readme}")

    print(f"\nVault initialized at: {VAULT}")

if __name__ == "__main__":
    main()

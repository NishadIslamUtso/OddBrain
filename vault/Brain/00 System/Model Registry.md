# Model Registry

Track exact capabilities per model. UI enables/disables based on this.

| model_id | type | context_limit | tools | vision | files | audio | structured | search | tested_notes |
|---|---|---|---|---|---|---|---|---|---|
| qwen2.5:3b | local ollama | 32k | no | no | txt/code | no | partial | no | baseline, misreads slow as Solow, weak reasoning |
| qwen3-vl:4b | local ollama | 32k | no | yes | txt/img | no | partial | no | ~3.3GB download, tight on 8GB RAM |
| claude-opus-4.5* | remote | 200k | yes | yes | yes | yes | yes | yes | example, not local, needs approval |

* Remote only after exact-content/destination preview + one-send approval.

Update when you switch models. Don't claim access without connector.

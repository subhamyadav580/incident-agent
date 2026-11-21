"""Condense plugins' structured prefetch evidence into what the UI panels show."""
import json
from typing import Any

MAX_PATTERNS = 5
MAX_PATTERN_CHARS = 400
MAX_ROWS = 3


def _pattern_text(example: dict) -> str:
    text = example.get("message")
    if not isinstance(text, str):
        text = json.dumps({k: v for k, v in example.items() if "timestamp" not in k}, default=str)
    return text[:MAX_PATTERN_CHARS]


def summarize_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {"searched_for": {}, "services": [], "traces": [], "records": []}

    logs = evidence.get("elasticsearch") or {}
    summary["searched_for"] = logs.get("searched_for", {})
    for result in logs.get("error_occurrences", []):
        if not result.get("total") and not result.get("error"):
            continue
        histogram_key = next((key for key in result if key.startswith("per_")), None)
        summary["services"].append({
            "name": result["prefix"],
            "total": result.get("total"),
            "first_seen": result.get("first_seen"),
            "last_seen": result.get("last_seen"),
            "histogram": [
                {"t": bucket, "count": count}
                for bucket, count in (result.get(histogram_key) or {}).items()
            ],
            "patterns": [
                {"count": pattern["count"], "text": _pattern_text(pattern["example"])}
                for pattern in result.get("patterns", [])[:MAX_PATTERNS]
            ],
            "error": result.get("error"),
        })

    for trace in logs.get("request_traces", []):
        if trace["services"]:
            summary["traces"].append({
                "id": trace["identifier"],
                "services": [
                    {"name": service["prefix"], "total": service.get("total"), "error": service.get("error")}
                    for service in trace["services"]
                ],
            })

    for record in evidence.get("postgres") or []:
        summary["records"].append({
            "database": record["database"],
            "table": record["table"],
            "where": record["where"],
            "rows": record.get("rows", [])[:MAX_ROWS],
            "error": record.get("error"),
        })
    # Rows carry datetimes/decimals; store them as strings in the JSONB column.
    return json.loads(json.dumps(summary, default=str))

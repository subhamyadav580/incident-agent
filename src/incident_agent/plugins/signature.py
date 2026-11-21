"""
Turn a user's message (an error, a log line, a question) into search terms
shared by every plugin: identifiers, exception class names and the fixed
phrases of the error text, with variable parts (ids, numbers, quoted values)
removed so every occurrence of the error matches.
"""
import re
from typing import Sequence

# Identifier-looking tokens: mixed letters+digits (order ids, trace ids, UUIDs,
# 32-hex request ids, abc123) or long pure numbers. Override per deployment with
# the `identifier_patterns` option.
DEFAULT_IDENTIFIER_PATTERNS = (
    r"\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{6,}\b",
    r"\b\d{8,}\b",
)

# java.lang.NumberFormatException, HttpResponseException, ValueError, ...
_EXCEPTION = re.compile(r"\b(?:[a-z_]\w*\.)*[A-Z]\w*(?:Exception|Error)\b")
_QUOTED = re.compile(r"'[^']*'|\"[^\"]*\"")
# URL paths are fixed parts of an error (/connector/v1/search), kept as a phrase.
_PATH = re.compile(r"(?<![\w/])/[A-Za-z][\w.-]*(?:/[\w.-]+)*")
# Phrases are split at variable parts and punctuation that rarely sits inside a
# fixed log phrase.
_PHRASE_BREAK = re.compile(r"[\d:=,;()\[\]{}<>|/\\]+|\s-\s|\.\s")
_WORD = re.compile(r"[A-Za-z][A-Za-z_-]*")
MIN_PHRASE_WORDS = 3
MAX_PHRASES = 6


def extract_identifiers(text: str, patterns: Sequence[re.Pattern]) -> list[str]:
    """Pull ids out of free text, de-duplicated in order of appearance."""
    found = [match for pattern in patterns for match in pattern.findall(text)]
    return list(dict.fromkeys(found))


def extract_signature(text: str, identifiers: Sequence[str]) -> tuple[list[str], list[str]]:
    """
    Split an error message into (exception class names, fixed phrases).

    Variable parts (identifiers, numbers, quoted values) are cut out, so the
    phrases match every occurrence of the error, not just this one.
    """
    exceptions = list(dict.fromkeys(_EXCEPTION.findall(text)))

    remaining = _QUOTED.sub(" | ", text)
    phrases = []
    for path in _PATH.findall(remaining):
        words = [part for part in re.split(r"[/.]", path) if part and part not in identifiers]
        if words:
            phrases.append(" ".join(words))
    remaining = _PATH.sub(" | ", remaining)

    for value in [*identifiers, *exceptions]:
        remaining = remaining.replace(value, " | ")

    for chunk in _PHRASE_BREAK.split(remaining):
        words = _WORD.findall(chunk)
        if len(words) >= MIN_PHRASE_WORDS:
            phrases.append(" ".join(words))
    return exceptions, list(dict.fromkeys(phrases))[:MAX_PHRASES]

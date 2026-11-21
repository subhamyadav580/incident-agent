from typing import Literal

from pydantic import BaseModel, Field

INTENT_INSTRUCTIONS = """\
Classify the user's message for a production-incident assistant.

- investigation: an error message, exception, stack trace or log line; an id of
  something that failed (order, user, payment, request, trace); or a report that
  something is broken, failing, slow or stuck.
- data_question: a question answered by looking up data, not reporting a failure,
  e.g. the current status of a record, counts, or what a table or index holds.
- conversation: greetings, thanks, questions about what the assistant can do, or
  anything else that needs no data.

When unsure between investigation and the others, choose investigation."""


class Intent(BaseModel):
    intent: Literal["conversation", "investigation", "data_question"]
    reason: str = Field(description="One short sentence explaining the choice.")

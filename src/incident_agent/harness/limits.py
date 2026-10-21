from dataclasses import dataclass


@dataclass(frozen=True)
class ExecutionLimits:
    max_steps: int = 10
    max_execution_seconds: int = 120
    max_model_calls: int = 15

    def __post_init__(self):
        if self.max_steps < 1:
            raise ValueError("max_steps must be positive")

        if self.max_execution_seconds < 1:
            raise ValueError("Execution timeout must be positive")

        if self.max_model_calls < 1:
            raise ValueError("max_model_calls must be positive")
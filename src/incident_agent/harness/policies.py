class PolicyError(Exception):
    pass


class ToolPolicy:
    def __init__(self, allowed_tools: list[str]):
        self.allowed_tools = set(allowed_tools)

    def validate_tool(self, tool_name: str) -> None:
        if tool_name not in self.allowed_tools:
            raise PolicyError(
                f"Tool is not allowed: {tool_name}"
            )
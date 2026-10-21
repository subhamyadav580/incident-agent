from importlib import import_module

from .base import Plugin, Prefetch

__all__ = ["BUILTIN_PLUGINS", "Plugin", "Prefetch", "load_plugin", "load_plugins"]

BUILTIN_PLUGINS = {
    "elasticsearch": "incident_agent.plugins.elasticsearch",
    "postgres": "incident_agent.plugins.postgres",
}


def load_plugin(name: str, options: dict) -> Plugin:
    """
    Import a plugin module and build it from its config section.

    Built-in plugins are found by name. Any other plugin is loaded from the
    `module` option, e.g. `module: my_package.my_plugin`.
    """
    module_path = options.get("module") or BUILTIN_PLUGINS.get(name)
    if not module_path:
        raise ValueError(
            f"Unknown plugin {name!r}. Built-in plugins: {', '.join(sorted(BUILTIN_PLUGINS))}. "
            "For a custom plugin, set `module: <python.module.path>` in its config."
        )

    module = import_module(module_path)
    create_plugin = getattr(module, "create_plugin", None)
    if create_plugin is None:
        raise TypeError(f"Plugin module {module_path!r} has no create_plugin(options) function")

    plugin = create_plugin(options)
    if not isinstance(plugin, Plugin):
        raise TypeError(f"{module_path}.create_plugin() must return a Plugin, got {type(plugin).__name__}")
    return plugin


def load_plugins(config: dict) -> list[Plugin]:
    """Load every plugin whose config section has `enabled: true`."""
    return [
        load_plugin(name, options or {})
        for name, options in (config or {}).items()
        if (options or {}).get("enabled", False)
    ]

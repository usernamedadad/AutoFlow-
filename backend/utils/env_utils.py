import os
from typing import Dict


def update_env_config(data: Dict[str, str]) -> None:
    api_key = data.get("api_key", "")
    model_id = data.get("model_id", "")
    base_url = data.get("base_url", "")

    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")

    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

    config_map = {
        "LLM_API_KEY": f"LLM_API_KEY={api_key}\n",
        "LLM_MODEL_ID": f"LLM_MODEL_ID={model_id}\n",
        "LLM_BASE_URL": f"LLM_BASE_URL={base_url}\n",
    }

    updated_keys = set()
    new_lines = []

    for line in lines:
        stripped = line.strip()
        if any(stripped.startswith(key + "=") for key in config_map):
            key = stripped.split("=")[0]
            if key in config_map:
                new_lines.append(config_map[key])
                updated_keys.add(key)
        else:
            new_lines.append(line)

    for key, value_line in config_map.items():
        if key not in updated_keys:
            new_lines.append(value_line)

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

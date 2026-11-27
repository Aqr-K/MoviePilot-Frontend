"""构造 get_page() 的返回值。bundle 随插件发布，initial_data 属于当前实例。"""

from base64 import b64encode
from pathlib import Path


def lynx_page(bundle: Path, initial_data: dict, content: list[dict]) -> list[dict]:
    with bundle.open("rb") as stream:
        template = stream.read(1024 * 1024 + 1)
    if not 0 < len(template) <= 1024 * 1024:
        raise ValueError("内联 Lynx bundle 大小应为 1 字节至 1 MiB")
    return [{
        "component": "div",
        "content": content,
        "lynx": {
            "version": 1,
            "bundle": b64encode(template).decode("ascii"),
            "initialData": initial_data,
        },
    }]

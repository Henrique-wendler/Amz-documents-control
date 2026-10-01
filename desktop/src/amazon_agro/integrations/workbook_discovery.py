"""Read-only discovery of locally synchronized property workbooks."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True, slots=True)
class DiscoveredWorkbook:
    path: Path
    relative_path: str
    name: str
    size: int
    modified_at: datetime


class PropertyWorkbookDiscovery:
    def discover(
        self, source_directory: Path, patterns: list[str] | tuple[str, ...],
        recursive: bool = False, excluded_files: list[str] | tuple[str, ...] = (),
    ) -> list[DiscoveredWorkbook]:
        root = Path(source_directory).expanduser().resolve()
        if not root.is_dir():
            raise FileNotFoundError(f"Pasta de imóveis não encontrada: {root}")
        found: dict[Path, DiscoveredWorkbook] = {}
        excluded = {name.casefold() for name in excluded_files}
        for pattern in patterns:
            if not pattern or Path(pattern).name != pattern:
                raise ValueError("Use padrões de arquivo simples, como *.xlsx.")
            candidates = root.rglob(pattern) if recursive else root.glob(pattern)
            for path in candidates:
                if not path.is_file() or path.suffix.casefold() not in {".xlsx", ".xlsm"}:
                    continue
                relative = path.relative_to(root)
                if (
                    path.name.startswith(("~$", "."))
                    or path.name.casefold() in excluded
                    or any(part.startswith(".") for part in relative.parts[:-1])
                ):
                    continue
                stat = path.stat()
                if getattr(stat, "st_file_attributes", 0) & 2:
                    continue
                resolved = path.resolve()
                if not resolved.is_relative_to(root):
                    continue
                found[resolved] = DiscoveredWorkbook(
                    path=resolved, relative_path=relative.as_posix(), name=path.name,
                    size=stat.st_size,
                    modified_at=datetime.fromtimestamp(stat.st_mtime, timezone.utc),
                )
        return sorted(found.values(), key=lambda item: item.relative_path.casefold())

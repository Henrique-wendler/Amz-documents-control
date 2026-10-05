"""Rasterize the provisional SVG and assemble a multi-size Windows icon."""

from io import BytesIO
from pathlib import Path
import struct

from PySide6.QtCore import QByteArray, QBuffer, QIODevice, Qt
from PySide6.QtGui import QImage, QPainter
from PySide6.QtSvg import QSvgRenderer


ROOT = Path(__file__).resolve().parent
SIZES = (16, 24, 32, 48, 64, 128, 256)


def render_png(renderer: QSvgRenderer, size: int) -> bytes:
    image = QImage(size, size, QImage.Format.Format_ARGB32)
    image.fill(Qt.GlobalColor.transparent)
    painter = QPainter(image)
    renderer.render(painter)
    painter.end()
    data = QByteArray()
    buffer = QBuffer(data)
    buffer.open(QIODevice.OpenModeFlag.WriteOnly)
    if not image.save(buffer, "PNG"):
        raise RuntimeError(f"Could not render {size}px icon")
    return bytes(data)


def main() -> None:
    renderer = QSvgRenderer(str(ROOT / "AmazonAgro.svg"))
    if not renderer.isValid():
        raise ValueError("Invalid AmazonAgro.svg")
    images = [(size, render_png(renderer, size)) for size in SIZES]
    (ROOT / "AmazonAgro.png").write_bytes(images[-1][1])
    offset = 6 + 16 * len(images)
    output = BytesIO()
    output.write(struct.pack("<HHH", 0, 1, len(images)))
    for size, data in images:
        encoded_size = 0 if size == 256 else size
        output.write(struct.pack("<BBBBHHII", encoded_size, encoded_size, 0, 0,
                                 1, 32, len(data), offset))
        offset += len(data)
    for _, data in images:
        output.write(data)
    (ROOT / "AmazonAgro.ico").write_bytes(output.getvalue())


if __name__ == "__main__":
    main()

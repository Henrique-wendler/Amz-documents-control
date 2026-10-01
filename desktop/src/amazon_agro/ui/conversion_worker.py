"""Keep Qt responsive during conversion; SQLite stays on the GUI thread."""
from PySide6.QtCore import QEventLoop, QThread


class ConversionWorker(QThread):
    def __init__(self, backend, source, destination):
        super().__init__()
        self.backend, self.source, self.destination = backend, source, destination
        self.result = None
        self.error = None

    def run(self) -> None:
        try:
            self.result = self.backend.convert(self.source, self.destination)
        except Exception as error:
            self.error = error


def run_conversion(backend, source, destination):
    worker = ConversionWorker(backend, source, destination)
    loop = QEventLoop()
    worker.finished.connect(loop.quit)
    worker.start()
    loop.exec()
    worker.wait()
    if worker.error is not None:
        raise worker.error
    return worker.result

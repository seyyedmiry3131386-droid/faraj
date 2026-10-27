"""Architecture sizes only. None of these configurations has trained weights."""
from dataclasses import dataclass

@dataclass(frozen=True)
class TextConfig:
    width: int = 512
    heads: int = 8
    feedforward: int = 2048
    layers: int = 10
    vocabulary: int = 32768
    context: int = 1024

TEXT_PRESETS = {
    '50m': TextConfig(),
    '150m': TextConfig(width=768, heads=12, feedforward=3072, layers=18, context=2048),
    '400m': TextConfig(width=1024, heads=16, feedforward=4096, layers=28, context=4096),
    '1b': TextConfig(width=1536, heads=24, feedforward=6144, layers=33, context=4096),
}

DEFAULT_TEXT_PRESET = '1b'

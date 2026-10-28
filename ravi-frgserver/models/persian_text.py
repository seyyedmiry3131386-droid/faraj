"""Hazm input pipeline for the UNTRAINED text architecture, not the JS Worker.

Normalised tokens are features only. Evidence always slices the immutable raw
text using Python code-point offsets (not JavaScript UTF-16 offsets).
"""
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from types import MappingProxyType
from importlib.metadata import version
import json
import unicodedata

PIPELINE_VERSION = 'hazm-0.12.1-conservative-v1'


@dataclass(frozen=True)
class Token:
    text: str
    start: int
    end: int
    raw_start: int
    raw_end: int


@dataclass(frozen=True)
class Document:
    raw: str
    normalized: str
    tokens: tuple[Token, ...]
    pipeline_version: str = PIPELINE_VERSION

    def evidence(self, first: int, last: int) -> tuple[int, int, str]:
        """Raw span for a half-open token range. Never quote normalized features."""
        if not 0 <= first < last <= len(self.tokens):
            raise ValueError('Invalid token range.')
        start = min(t.raw_start for t in self.tokens[first:last])
        end = max(t.raw_end for t in self.tokens[first:last])
        return start, end, self.raw[start:end]


def _source_map(raw: str, normalized: str):
    """Conservative bounding spans for changed characters, preserving order.

    Expansions map to their entire original segment; inserted spacing maps to a
    boundary. This is a bounding source span, not a claim of character equality.
    """
    spans = [None] * len(normalized)
    for tag, a, b, c, d in SequenceMatcher(None, raw, normalized, autojunk=False).get_opcodes():
        if tag == 'equal':
            spans[c:d] = [(i, i + 1) for i in range(a, b)]
        elif tag == 'replace':
            spans[c:d] = [(a, b)] * (d - c)
        elif tag == 'insert':
            spans[c:d] = [(a, a)] * (d - c)
    return spans


class PersianProcessor:
    def __init__(self):
        if version('hazm') != '0.12.1':
            raise ValueError('Install the pinned Hazm version before loading this pipeline.')
        from hazm import Normalizer, WordTokenizer
        self.normalizer = Normalizer(
            persian_numbers=False, remove_specials_chars=False,
            decrease_repeated_chars=False, persian_style=False,
            unicodes_replacement=False,
        )
        self.tokenizer = WordTokenizer(join_verb_parts=False)

    def process(self, text: str) -> Document:
        if not isinstance(text, str) or not text.strip() or len(text) > 6000:
            raise ValueError('Expected nonempty text, at most 6000 code points.')
        normalized = self.normalizer.normalize(text)
        mapping = _source_map(text, normalized)
        result, cursor = [], 0
        for word in self.tokenizer.tokenize(normalized):
            start = normalized.find(word, cursor)
            if start < 0 or normalized[cursor:start].strip():
                raise ValueError('Tokenizer alignment changed; refusing an uncertain span.')
            end = start + len(word)
            bounds = mapping[start:end]
            raw_start = min(a for a, _ in bounds)
            raw_end = max(b for _, b in bounds)
            # Include removed terminal diacritics in the original evidence.
            while raw_end < len(text) and unicodedata.combining(text[raw_end]):
                raw_end += 1
            if raw_start == raw_end:
                raise ValueError('Token has no source text.')
            result.append(Token(word, start, end, raw_start, raw_end))
            cursor = end
        if not result or normalized[cursor:].strip():
            raise ValueError('No complete, aligned token sequence.')
        return Document(text, normalized, tuple(result))


class FrozenVocabulary:
    """Explicit, versioned training artifact. Never fit on an incoming report.

    No trained vocabulary is shipped. Unknown words have ID 1; PAD is ID 0.
    Test fixtures must not be mistaken for a production tokenizer.
    """
    def __init__(self, tokens, pipeline_version=PIPELINE_VERSION):
        if pipeline_version != PIPELINE_VERSION:
            raise ValueError('Vocabulary and preprocessing versions differ.')
        if not isinstance(tokens, list) or tokens[:2] != ['[PAD]', '[UNK]']:
            raise ValueError('Vocabulary must begin with [PAD], [UNK].')
        if any(not isinstance(t, str) or not t for t in tokens) or len(set(tokens)) != len(tokens):
            raise ValueError('Vocabulary tokens must be unique, nonempty strings.')
        self.tokens = tuple(tokens)
        self.ids = MappingProxyType({t: i for i, t in enumerate(tokens)})

    @classmethod
    def load(cls, path):
        artifact = json.loads(Path(path).read_text(encoding='utf-8'))
        return cls(artifact['tokens'], artifact['pipeline_version'])

    def encode(self, document):
        # Literal reserved-token text must never be treated as padding.
        return [max(1, self.ids.get(t.text, 1)) for t in document.tokens]


@dataclass(frozen=True)
class TextBatch:
    documents: tuple[Document, ...]
    input_ids: tuple[tuple[int, ...], ...]
    lengths: tuple[int, ...]
    unknown_counts: tuple[int, ...]


def prepare_batch(texts, processor, vocabulary, config):
    if isinstance(texts, str):
        raise ValueError('Expected a batch of strings, not one string.')
    documents = tuple(processor.process(text) for text in texts)
    if not documents:
        raise ValueError('Empty batch.')
    if len(vocabulary.tokens) > config.vocabulary:
        raise ValueError('Vocabulary exceeds model embedding capacity.')
    rows = [vocabulary.encode(doc) for doc in documents]
    lengths = tuple(map(len, rows))
    if max(lengths) > config.context:
        raise ValueError('Context exceeded; explicitly segment the source before encoding.')
    width = max(lengths)
    return TextBatch(documents, tuple(tuple(row + [0] * (width - len(row))) for row in rows),
                     lengths, tuple(row.count(1) for row in rows))

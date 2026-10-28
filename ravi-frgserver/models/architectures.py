"""Untrained architecture prototypes. No checkpoints or production inference.

Inputs must be tokenized/preprocessed under the contract in DESIGN.fa.md.
Model heads propose report fields; they must never supply missing facts.
"""
import math
from configs import TEXT_PRESETS, DEFAULT_TEXT_PRESET
import torch
from torch import nn
from torch.nn import functional as F

import json
from pathlib import Path

BANK = json.loads(Path(__file__).with_name('question-bank.json').read_text())
BANK_VERSION = BANK['version']
TOPICS = tuple(BANK['topics'])
SCENARIO_TAXONOMY = json.loads(Path(__file__).with_name('data').joinpath('taxonomy-500.json').read_text())
SUBTOPICS = tuple(row['id'] for row in SCENARIO_TAXONOMY['subtopics'])
CATEGORIES = tuple(BANK['categories'])
ENTITY_TYPES = ('person', 'place', 'object', 'vehicle', 'contact', 'time', 'document')
MODULES = ('time', 'place', 'event_details', 'person', 'object', 'vehicle', 'contact', 'source')
RELATIONS = ('none', 'person_place', 'vehicle_person', 'vehicle_place', 'contact_person',
             'object_person', 'object_place', 'contact_place')

def pad_mask(lengths, width):
    return torch.arange(width, device=lengths.device)[None, :] >= lengths[:, None]

def pair_features(left, right):
    return torch.cat((left, right, left * right, torch.abs(left - right)), dim=-1)

class Encoder(nn.Module):
    def __init__(self, layers, width=512, heads=8, feedforward=2048):
        super().__init__()
        # Independent initialization, not cloned copies of a single layer.
        self.layers = nn.ModuleList([
            nn.TransformerEncoderLayer(width, heads, feedforward, dropout=0.1,
                                       activation='gelu', batch_first=True,
                                       norm_first=True, bias=True)
            for _ in range(layers)
        ])
        self.norm = nn.LayerNorm(width)

    def forward(self, x, mask):
        for layer in self.layers:
            x = layer(x, src_key_padding_mask=mask)
        return self.norm(x).masked_fill(mask.unsqueeze(-1), 0)

class ReportUnderstanding(nn.Module):
    """Configurable UNTRAINED architecture; MULTILABEL, not free-form generation.

    The same encoder encodes report text and candidate question templates.
    Entity embeddings are mean-pooled from user-text spans, not identities.
    """
    def __init__(self, preset=DEFAULT_TEXT_PRESET):
        super().__init__()
        self.config = config = TEXT_PRESETS[preset]
        width = config.width
        self.tokens = nn.Embedding(config.vocabulary, width, padding_idx=0)
        self.positions = nn.Embedding(config.context, width)
        self.input_norm = nn.LayerNorm(width)
        self.encoder = Encoder(config.layers, width, config.heads, config.feedforward)
        self.topic_head = nn.Linear(width, len(TOPICS))
        self.subtopic_head = nn.Linear(width, len(SUBTOPICS))
        self.category_head = nn.Linear(width, len(CATEGORIES))
        self.entity_head = nn.Linear(width, 1 + 2*len(ENTITY_TYPES))  # O/B/I
        self.module_head = nn.Linear(width, len(MODULES))
        self.grounding_head = nn.Linear(width, 2)  # needs clarification / grounded
        self.relation_head = nn.Sequential(nn.Linear(4*width, width), nn.GELU(), nn.Linear(width, len(RELATIONS)))
        self.question_ranker = nn.Sequential(nn.Linear(4*width, 128), nn.GELU(), nn.Linear(128, 1))

    def encode(self, input_ids, lengths):
        if input_ids.ndim != 2 or not 1 <= input_ids.shape[1] <= self.config.context:
            raise ValueError(f'Input must be B x T with 1 <= T <= {self.config.context}.')
        if lengths.shape != (input_ids.shape[0],) or torch.any(lengths < 1) or torch.any(lengths > input_ids.shape[1]):
            raise ValueError('Invalid unpadded sequence lengths.')
        positions = torch.arange(input_ids.shape[1], device=input_ids.device)
        mask = pad_mask(lengths, input_ids.shape[1])
        x = self.input_norm(self.tokens(input_ids) + self.positions(positions)[None])
        hidden = self.encoder(x, mask)
        pooled = hidden.sum(dim=1) / lengths[:, None].to(hidden.dtype)
        return hidden, pooled

    def forward(self, input_ids, lengths):
        hidden, pooled = self.encode(input_ids, lengths)
        return {
            'category_logits': self.category_head(pooled),  # four independent labels
            'topic_logits': self.topic_head(pooled),  # sigmoid/BCE, NOT softmax
            'subtopic_logits': self.subtopic_head(pooled),
            'entity_logits': self.entity_head(hidden),
            'module_logits': self.module_head(pooled),
            'grounding_logits': self.grounding_head(pooled),
            'hidden': hidden, 'pooled': pooled,
        }

    def forward_text(self, texts, processor, vocabulary):
        """Use the same Hazm pipeline in training and inference; no trained weights.

        Returned documents retain raw evidence offsets. Logits are NOT facts or
        production predictions until trained and independently evaluated.
        """
        from persian_text import prepare_batch
        batch = prepare_batch(texts, processor, vocabulary, self.config)
        device = self.tokens.weight.device
        output = self.forward(torch.tensor(batch.input_ids, dtype=torch.long, device=device),
                              torch.tensor(batch.lengths, dtype=torch.long, device=device))
        return output, batch.documents

    def initialize_lexical_vectors(self, vectors, matched):
        """Import aligned word vectors only. Does not train encoder or task heads.

        Matched rows use pretrained coordinates and zero remainder. Other rows
        retain their initial values. The caller must use the associated vocabulary.
        """
        vectors = torch.as_tensor(vectors, dtype=self.tokens.weight.dtype,
                                  device=self.tokens.weight.device)
        matched = torch.as_tensor(matched, dtype=torch.bool, device=vectors.device)
        if vectors.ndim != 2 or vectors.shape[0] != self.config.vocabulary or not 1 <= vectors.shape[1] <= self.config.width:
            raise ValueError('Invalid lexical matrix dimensions.')
        if matched.shape != (self.config.vocabulary,) or matched[:2].any() or not torch.isfinite(vectors).all():
            raise ValueError('Invalid lexical mask or nonfinite vectors.')
        indices = matched.nonzero(as_tuple=True)[0]
        with torch.no_grad():
            self.tokens.weight[indices] = 0
            self.tokens.weight[indices, :vectors.shape[1]] = vectors[indices]
        return int(matched.sum().item())

    def classify_relation(self, left_span, right_span):
        return self.relation_head(pair_features(left_span, right_span))

    def rank_question(self, report_vector, question_vector):
        return self.question_ranker(pair_features(report_vector, question_vector)).squeeze(-1)


class ReportUnderstanding50M(ReportUnderstanding):
    """Compatibility alias; untrained 50M configuration."""
    def __init__(self):
        super().__init__("50m")


def sinusoidal(width, device, dtype):
    positions = torch.arange(width, device=device, dtype=torch.float32)[:, None]
    scales = torch.exp(torch.arange(0, 512, 2, device=device, dtype=torch.float32)
                       * (-math.log(10000.0) / 512))
    pe = torch.empty(width, 512, device=device)
    pe[:, 0::2] = torch.sin(positions * scales)
    pe[:, 1::2] = torch.cos(positions * scales)
    return pe.to(dtype)

class PersianSpeech50M(nn.Module):
    """50,299,392 trainable parameters, bidirectional CTC; not streaming.

    Input: normalized 80-bin log-mel features B x T x 80, actual frame lengths.
    Recommended chunks <=30s (3000 frames at a 10ms hop).
    Output vocabulary: 4096 including CTC blank=0, tokenizer trained separately.
    """
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv1d(80, 512, 3, stride=2, padding=1)
        self.conv2 = nn.Conv1d(512, 512, 3, stride=2, padding=1)
        self.input_norm = nn.LayerNorm(512)
        self.encoder = Encoder(15)
        self.ctc_head = nn.Linear(512, 4096)

    def forward(self, log_mel, frame_lengths):
        if log_mel.ndim != 3 or log_mel.shape[-1] != 80 or not 1 <= log_mel.shape[1] <= 3000:
            raise ValueError('Expected B x T x 80 with 1 <= T <= 3000.')
        if frame_lengths.shape != (log_mel.shape[0],) or torch.any(frame_lengths < 1) or torch.any(frame_lengths > log_mel.shape[1]):
            raise ValueError('Invalid feature lengths.')
        lengths = frame_lengths.clone()
        x = log_mel.masked_fill(pad_mask(lengths, log_mel.shape[1]).unsqueeze(-1), 0).transpose(1, 2)
        for conv in (self.conv1, self.conv2):
            x = F.gelu(conv(x))
            lengths = (lengths + 1) // 2  # exact conv(k=3,s=2,p=1) length
            x = x.masked_fill(pad_mask(lengths, x.shape[-1]).unsqueeze(1), 0)
        x = x.transpose(1, 2)
        mask = pad_mask(lengths, x.shape[1])
        x = self.input_norm(x + sinusoidal(x.shape[1], x.device, x.dtype)[None])
        logits = self.ctc_head(self.encoder(x, mask))
        return logits, lengths

    @staticmethod
    def loss(logits, output_lengths, targets, target_lengths):
        # Dataset validation must reject impossible alignments (including repeats).
        # float32 loss for stable CTC under mixed precision. No silent zeroing.
        return F.ctc_loss(logits.float().log_softmax(-1).transpose(0, 1), targets,
                          output_lengths, target_lengths, blank=0,
                          reduction='mean', zero_infinity=False)

    @staticmethod
    def greedy_decode(logits, output_lengths):
        tokens = logits.argmax(-1).tolist()
        result = []
        for row, length in zip(tokens, output_lengths.tolist()):
            previous = None
            decoded = []
            for token in row[:length]:
                if token != 0 and token != previous:
                    decoded.append(token)
                previous = token
            result.append(decoded)
        return result

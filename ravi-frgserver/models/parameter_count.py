"""Exact trainable parameter counts; standard-library-only, no dummy parameters."""
from configs import TEXT_PRESETS
import json
from pathlib import Path
BANK = json.loads(Path(__file__).with_name('question-bank.json').read_text())
SUBTOPICS = json.loads(Path(__file__).with_name('data').joinpath('taxonomy-500.json').read_text())['subtopics']

def linear(i, o):
    return i * o + o

def transformer_layer(d=512, ff=2048):
    # Q,K,V + output projections; FFN; two affine LayerNorms.
    return 4*d*d + 4*d + 2*d*ff + ff+d + 4*d

def text_count(config):
    d = config.width
    return {
        'token_embeddings': config.vocabulary*d,
        'position_embeddings': config.context*d,
        'encoder_layers': config.layers*transformer_layer(d, config.feedforward),
        'input_and_output_norms': 4*d,
        'topic_head': linear(d, len(BANK['topics'])),
        'subtopic_head': linear(d, len(SUBTOPICS)),
        'category_head': linear(d, len(BANK['categories'])),
        'entity_BIO_head': linear(d, 15),
        'module_head': linear(d, 8),
        'grounding_head': linear(d, 2),
        'relation_head': linear(4*d, d)+linear(d, 8),
        'question_ranker': linear(4*d, 128)+linear(128, 1),
    }

def counts():
    d = 512
    text = text_count(TEXT_PRESETS['50m'])
    speech = {
        'subsampling_conv1': 80*512*3+512,
        'subsampling_conv2': 512*512*3+512,
        'encoder_15_layers': 15*transformer_layer(),
        'input_and_output_norms': 4*d,
        'ctc_head': linear(d, 4096),
    }
    return {name:{'components':parts,'total':sum(parts.values())}
            for name,parts in [('text',text),('speech',speech),*[(name,text_count(config)) for name,config in TEXT_PRESETS.items() if name!='50m']]}

if __name__ == '__main__':
    print(json.dumps(counts(), indent=2))

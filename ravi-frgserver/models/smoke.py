"""Run after installing PyTorch in a separate ML environment.

This checks random initialization, tensor shapes and backward paths, NOT quality.
"""
import torch
from architectures import ReportUnderstanding50M, PersianSpeech50M, TOPICS, CATEGORIES
from parameter_count import counts

def count(model):
    return sum(p.numel() for p in model.parameters() if p.requires_grad)

def main():
    torch.set_num_threads(2)
    torch.manual_seed(7)
    text = ReportUnderstanding50M()
    assert count(text) == counts()['text']['total']
    output = text(torch.randint(1, 32768, (2, 16)), torch.tensor([16, 11]))
    assert output['topic_logits'].shape == (2, len(TOPICS))
    assert output['category_logits'].shape == (2, len(CATEGORIES))
    pair = text.classify_relation(output['pooled'], output['pooled'])
    rank = text.rank_question(output['pooled'], output['pooled'])
    loss = sum(output[k].square().mean() for k in ('category_logits', 'topic_logits', 'entity_logits', 'module_logits', 'grounding_logits')) + pair.square().mean() + rank.square().mean()
    loss.backward()
    assert all(p.grad is not None for p in text.parameters())
    del text, output, loss, pair, rank
    speech = PersianSpeech50M()
    assert count(speech) == counts()['speech']['total']
    logits, lengths = speech(torch.randn(2, 80, 80), torch.tensor([80, 61]))
    assert logits.shape == (2, 20, 4096)
    assert lengths.tolist() == [20, 16]
    targets = torch.tensor([[1, 2, 2, 3], [4, 5, 6, 7]])
    loss = speech.loss(logits, lengths, targets, torch.tensor([4, 4]))
    assert torch.isfinite(loss)
    loss.backward()
    assert all(p.grad is not None for p in speech.parameters())
    print('Parameter counts, forward shapes and backward paths pass; weights are untrained.')

if __name__ == '__main__':
    main()

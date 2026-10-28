"""Synthetic pipeline tests, not a model quality evaluation."""
from dataclasses import replace
import unittest
from configs import TEXT_PRESETS, DEFAULT_TEXT_PRESET
from parameter_count import text_count
from persian_text import PersianProcessor, FrozenVocabulary, prepare_batch


class PersianInputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.processor = PersianProcessor()
        cls.config = TEXT_PRESETS['1b']

    def test_one_billion_architecture(self):
        self.assertEqual(DEFAULT_TEXT_PRESET, '1b')
        self.assertEqual(self.config.width % self.config.heads, 0)
        self.assertEqual(sum(text_count(self.config).values()), 1_002_718_554)

    def test_normalization_keeps_negation_numbers_and_original(self):
        raw = 'مي دانم اما دعوا نكردند. پلاک ۱۲۳ و ١٢٣ و 123 بود.'
        doc = self.processor.process(raw)
        self.assertEqual(doc.raw, raw)
        words = [t.text for t in doc.tokens]
        self.assertIn('می‌دانم', words)
        self.assertIn('نکردند', words)
        for number in ['۱۲۳', '١٢٣', '123']:
            self.assertIn(number, words)
        i = words.index('نکردند')
        self.assertEqual(doc.evidence(i, i + 1)[2], 'نكردند')
        self.assertEqual(doc.evidence(0, 1)[2], 'مي دانم')

    def test_repeated_words_and_hearsay_preserve_source_spans(self):
        raw = 'کافه کافه؛ شنیدم گفته شده است که درگیری نبود.'
        doc = self.processor.process(raw)
        self.assertEqual(doc.tokens[0].raw_start, 0)
        self.assertEqual(doc.tokens[1].raw_start, 5)
        for i, token in enumerate(doc.tokens):
            start, end, quote = doc.evidence(i, i + 1)
            self.assertEqual(quote, raw[start:end])
            self.assertEqual(doc.normalized[token.start:token.end], token.text)
        self.assertEqual(doc.evidence(3, len(doc.tokens))[2], raw[raw.index('شنیدم'):])

    def test_contact_punctuation_is_not_copied_as_normalized_evidence(self):
        raw = 'شماره 021-12345678 و test@example.com'
        doc = self.processor.process(raw)
        self.assertEqual(doc.evidence(0, len(doc.tokens))[2], raw)

    def test_fixed_vocabulary_padding_and_unknowns(self):
        vocab = FrozenVocabulary(['[PAD]', '[UNK]', 'دعوا', 'نبود', '.'])
        batch = prepare_batch(['دعوا نبود.', 'نامعلوم'], self.processor, vocab, self.config)
        self.assertEqual(batch.input_ids, ((2, 3, 4), (1, 0, 0)))
        self.assertEqual(batch.lengths, (3, 1))
        self.assertEqual(batch.unknown_counts, (0, 1))
        self.assertEqual(vocab.tokens, ('[PAD]', '[UNK]', 'دعوا', 'نبود', '.'))

    def test_no_silent_truncation_or_incompatible_vocabulary(self):
        vocab = FrozenVocabulary(['[PAD]', '[UNK]'])
        with self.assertRaisesRegex(ValueError, 'Context exceeded'):
            prepare_batch(['دعوا نبود.'], self.processor, vocab, replace(self.config, context=2))
        with self.assertRaises(ValueError):
            FrozenVocabulary(['[PAD]', '[UNK]'], 'different-pipeline')
        with self.assertRaises(ValueError):
            prepare_batch(['متن'], self.processor, vocab, replace(self.config, vocabulary=1))
        with self.assertRaises(ValueError):
            self.processor.process(' ')
        with self.assertRaises(ValueError):
            self.processor.process('الف' * 2001)


if __name__ == '__main__':
    unittest.main()

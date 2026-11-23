import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('builder', Path(__file__).resolve().parents[1] / 'scripts/build_catalogue.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

def card(id, oracle, lang, printed=None, **extra):
    return dict(id=id, oracle_id=oracle, lang=lang, name='Sol Ring', printed_name=printed or 'Sol Ring', set='test', set_name='Test fixture', collector_number='1', released_at='2020-01-01', games=['paper'], image_status='highres_scan', image_uris={'normal':'https://example.invalid/normal.jpg','png':'https://example.invalid/print.png'}, **extra)

class BuilderTests(unittest.TestCase):
    def test_builds_names_printings_and_missing_image_aliases(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'cards.json'; output=Path(temp)/'data'
            missing=card('missing','oracle-two','de','Ohne Bild'); missing['image_status']='missing'
            source.write_text(json.dumps([card('en','oracle-one','en'),card('de','oracle-one','de','Sonnenring'),missing]))
            manifest=builder.build(source,output)
            data=output/manifest['version']
            names=json.loads((data/'names.json').read_text())
            self.assertEqual(names['sonnenring'],['oracle-one'])
            self.assertEqual(names['ohne bild'],['oracle-two'])
            groups=json.loads((data/f'{builder.shard("oracle-one"):02}.json').read_text())
            self.assertEqual({c['lang'] for c in groups['oracle-one']},{'en','de'})
            self.assertEqual(manifest['printings'],{'de':1,'en':1})
            self.assertEqual(len(list(data.glob('*.json'))),66)
            self.assertEqual(manifest['version'],builder.build(source,output)['version'])
    def test_reads_compressed_json_lines(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'cards.jsonl.gz'
            values=[card('en','oracle-one','en'),card('de','oracle-one','de','Sonnenring')]
            with gzip.open(source,'wt',encoding='utf-8') as target:
                for value in values:target.write(json.dumps(value)+'\n')
            self.assertEqual(list(builder.stream_array(source)),values)
    def test_rejects_empty_export_without_publishing(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'cards.json';source.write_text('[]')
            with self.assertRaises(ValueError):builder.build(source,Path(temp)/'data')
            self.assertFalse((Path(temp)/'data/manifest.json').exists())
    def test_rejects_truncated_export(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'cards.json';source.write_text('[{"id":"broken"}')
            with self.assertRaises(ValueError):list(builder.stream_array(source))

if __name__=='__main__':unittest.main()

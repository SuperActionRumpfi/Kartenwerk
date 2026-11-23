#!/usr/bin/env python3
"""Build static English/German catalogue from Scryfall's all_cards bulk export.
No third-party Python packages required. Streams the large export into SQLite.
"""
import argparse
import datetime as dt
import hashlib
import gzip
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unicodedata
import urllib.request

HEADERS = {'User-Agent': 'KartenwerkCatalogue/1.0 (private playgroup tool)', 'Accept': 'application/json'}

def normal(value):
    return unicodedata.normalize('NFC', value).strip().lower()

def shard(oracle):
    return sum(oracle.encode('ascii')) % 64

def stream_array(path):
    with open(path, "rb") as probe:
        compressed = probe.read(2) == b"\x1f\x8b"
    opener = gzip.open if compressed else open
    with opener(path, mode="rt", encoding="utf-8-sig") as probe:
        first = ""
        while not first:
            chunk = probe.read(1)
            if not chunk:
                raise ValueError("Empty bulk export")
            first = chunk.strip()
        if first == "{":
            probe.seek(0)
            for line in probe:
                if line.strip():
                    yield json.loads(line)
            return
    yield from stream_json_array(path, opener)

def stream_json_array(path, opener):
    decoder = json.JSONDecoder()
    with opener(path, mode='rt', encoding='utf-8-sig') as source:
        buffer = ''
        started = False
        eof = False
        ended = False
        while True:
            if not eof:
                chunk = source.read(1024 * 1024)
                eof = not chunk
                buffer += chunk
            while True:
                buffer = buffer.lstrip()
                if not started:
                    if not buffer:
                        break
                    if buffer[0] != '[':
                        raise ValueError('Bulk export must be a JSON array')
                    buffer = buffer[1:]
                    started = True
                    continue
                if ended:
                    if buffer.strip():
                        raise ValueError('Unexpected data after bulk array')
                    break
                if buffer.startswith(','):
                    buffer = buffer[1:]
                    continue
                if buffer.startswith(']'):
                    ended = True
                    buffer = buffer[1:]
                    continue
                if not buffer:
                    break
                try:
                    card, end = decoder.raw_decode(buffer)
                except json.JSONDecodeError:
                    if eof:
                        raise
                    break
                yield card
                buffer = buffer[end:]
            if eof:
                if not ended:
                    raise ValueError('Incomplete bulk export')
                return

def download_bulk(destination):
    request = urllib.request.Request('https://api.scryfall.com/bulk-data', headers=HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:
        metadata = json.load(response)
    item = next(x for x in metadata['data'] if x['type'] == 'all_cards')
    url = item.get('jsonl_download_uri') or item['download_uri']
    if not url.startswith('https://'):
        raise ValueError('Expected HTTPS download URL')
    print('Downloading all_cards export (large download; may take several minutes).', flush=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=180) as response, open(destination, 'wb') as target:
        shutil.copyfileobj(response, target, 1024 * 1024)
    return item['updated_at']

def slim(card):
    fields = ('id', 'oracle_id', 'name', 'printed_name', 'set', 'set_name', 'collector_number', 'lang', 'released_at', 'image_status')
    result = {key: card[key] for key in fields if key in card}
    def image_fields(uris):
        return {key: uris[key] for key in ('normal', 'png') if key in uris}
    if card.get('image_uris'):
        result['image_uris'] = image_fields(card['image_uris'])
    elif card.get('card_faces'):
        result['card_faces'] = [dict(name=f.get('name', card['name']), printed_name=f.get('printed_name', f.get('name', card['name'])), image_uris=image_fields(f['image_uris'])) for f in card['card_faces'] if f.get('image_uris')]
    return result

def build(source, output, source_updated=None):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='kartenwerk-') as temp:
        database = sqlite3.connect(str(Path(temp) / 'cards.sqlite'))
        database.executescript('CREATE TABLE aliases(name TEXT, oracle TEXT, priority INTEGER, PRIMARY KEY(name,oracle)); CREATE TABLE cards(id TEXT PRIMARY KEY, oracle TEXT, bucket INTEGER, lang TEXT, released TEXT, data TEXT);')
        seen = 0
        for card in stream_array(source):
            if card.get('lang') not in ('en', 'de') or not card.get('oracle_id') or 'paper' not in card.get('games', []):
                continue
            oracle = card['oracle_id']
            aliases = [(card.get('name'), 0), (card.get('printed_name'), 0), (card.get('flavor_name'), 1)]
            for face in card.get('card_faces', []):
                aliases.extend(((face.get('name'), 1), (face.get('printed_name'), 1), (face.get('flavor_name'), 1)))
            for alias, priority in aliases:
                if alias:
                    database.execute('INSERT INTO aliases VALUES (?,?,?) ON CONFLICT(name,oracle) DO UPDATE SET priority=MIN(priority,excluded.priority)', (normal(alias), oracle, priority))
            compact = slim(card)
            # Preserve aliases even when a particular printing has no usable scan.
            has_image = compact.get('image_uris') or compact.get('card_faces')
            if has_image and card.get('image_status') not in ('missing', 'placeholder'):
                database.execute('INSERT OR REPLACE INTO cards VALUES (?,?,?,?,?,?)', (card['id'], oracle, shard(oracle), card['lang'], card.get('released_at', ''), json.dumps(compact, ensure_ascii=False, separators=(',', ':'))))
                seen += 1
            if seen and seen % 10000 == 0:
                database.commit()
        database.commit()
        if not seen:
            raise ValueError('No usable English/German paper card images in input; refusing to publish empty catalogue')
        stage = Path(temp) / 'output'
        stage.mkdir()
        aliases = {}
        for name, oracle in database.execute('SELECT a.name,a.oracle FROM aliases a WHERE priority=(SELECT MIN(b.priority) FROM aliases b WHERE b.name=a.name) ORDER BY a.name,a.oracle'):
            aliases.setdefault(name, []).append(oracle)
        write_json(stage / 'names.json', aliases)
        counts = dict(database.execute('SELECT lang,COUNT(*) FROM cards GROUP BY lang'))
        for bucket in range(64):
            groups = {}
            for oracle, data in database.execute('SELECT oracle,data FROM cards WHERE bucket=? ORDER BY released DESC,id', (bucket,)):
                groups.setdefault(oracle, []).append(json.loads(data))
            write_json(stage / f'{bucket:02d}.json', groups)
        defaults = {}
        for oracle, language, data in database.execute('SELECT oracle,lang,data FROM cards ORDER BY released DESC,id'):
            if oracle not in defaults or (language == 'de' and defaults[oracle]['lang'] != 'de'):
                defaults[oracle] = json.loads(data)
        write_json(stage / 'defaults.json', defaults)
        version_hash = hashlib.sha256()
        for file in sorted(stage.glob('*.json')):
            version_hash.update(file.read_bytes())
        version = version_hash.hexdigest()[:16]
        built = dt.datetime.now(dt.timezone.utc).isoformat()
        manifest = {'schema': 1, 'version': version, 'generated_at': built, 'source_updated_at': source_updated, 'source': 'https://scryfall.com/docs/api/bulk-data', 'shards': 64, 'defaults': True, 'printings': counts, 'names': len(aliases)}
        # Versioned paths keep old cached shards from mixing with a new index.
        version_dir = output / version
        if not version_dir.exists():
            shutil.copytree(stage, version_dir)
        manifest_tmp = output / 'manifest.json.tmp'
        write_json(manifest_tmp, manifest)
        os.replace(manifest_tmp, output / 'manifest.json')
        database.close()
        return manifest

def write_json(path, data):
    encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if len(encoded) >= 24 * 1024 * 1024:
        raise ValueError(f'{path.name} exceeds safe static hosting file size')
    Path(path).write_bytes(encoded)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', help='Existing all_cards JSON; omit to download from Scryfall')
    parser.add_argument('--output', default='dist/data')
    args = parser.parse_args()
    if args.input:
        result = build(args.input, args.output)
    else:
        with tempfile.TemporaryDirectory(prefix='scryfall-bulk-') as temp:
            source = Path(temp) / 'all-cards.json'
            updated = download_bulk(source)
            result = build(source, args.output, updated)
    print(json.dumps(result, indent=2), flush=True)

if __name__ == '__main__':
    main()

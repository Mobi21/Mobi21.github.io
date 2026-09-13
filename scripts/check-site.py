"""Check the deployable portfolio's local navigation and metadata."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import re
ROOT=Path(__file__).resolve().parents[1]
files=[ROOT/'index.html',ROOT/'about/index.html',ROOT/'commercial-work/index.html']+list((ROOT/'projects').rglob('index.html'))+list((ROOT/'work-writing').rglob('index.html'))
class Page(HTMLParser):
    def __init__(self,text):
        super().__init__();self.ids=[];self.links=[];self.images=[];self.h1=0;self.canonical=False;self.description=False;self.title=False;self.feed(text)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if tag=='h1':self.h1+=1
        if tag=='title':self.title=True
        if tag=='link' and a.get('rel')=='canonical':self.canonical=True
        if tag=='meta' and a.get('name')=='description':self.description=bool(a.get('content'))
        if tag=='img':self.images.append(a)
        for key in ('href','src'):
            if a.get(key):self.links.append(a[key])
pages={p:Page(p.read_text(encoding='utf-8')) for p in files};errors=[]
for path,p in pages.items():
    rel=path.relative_to(ROOT)
    if p.h1!=1:errors.append(f'{rel}: {p.h1} H1s')
    if len(p.ids)!=len(set(p.ids)):errors.append(f'{rel}: duplicate IDs')
    if not(p.canonical and p.description and p.title):errors.append(f'{rel}: missing metadata')
    for img in p.images:
        if 'alt' not in img:errors.append(f'{rel}: image missing alt')
    for href in p.links:
        u=urlsplit(href)
        if u.scheme or u.netloc:continue
        dest=(ROOT/unquote(u.path).lstrip('/')) if u.path.startswith('/') else path.parent/unquote(u.path) if u.path else path
        if dest.is_dir():dest=dest/'index.html'
        dest=dest.resolve()
        if not dest.exists():errors.append(f'{rel}: missing {href}');continue
        if u.fragment and dest in pages and u.fragment not in pages[dest].ids:errors.append(f'{rel}: missing fragment {href}')
    text=path.read_text(encoding='utf-8')
    if re.search(r'99\.2%|185 search|511 /|0\.42 to 0\.71|15 checkpoints',text):errors.append(f'{rel}: stale evidence')
demo=(ROOT/'demos/kora/index.html').read_text(encoding='utf-8')
if "connect-src 'none'" not in demo:errors.append('Demo network boundary missing')
for src in re.findall(r'(?:src|href)="(/demos/kora/[^"]+)"',demo):
    if not (ROOT/src.lstrip('/')).exists():errors.append(f'Demo missing asset: {src}')
if errors:raise SystemExit('\n'.join(errors))
print(f'PASS: {len(files)} pages, local links/assets/fragments, metadata, headings, image alt, stale claims, demo asset/CSP checks.')

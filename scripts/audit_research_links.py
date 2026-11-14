"""Audit static navigation for both Workers independently; no web requests."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit,unquote

ROOT=Path(__file__).resolve().parents[1]
EXTERNAL=('http:','https:','mailto:','tel:','data:','javascript:')
class Links(HTMLParser):
    def __init__(self):super().__init__();self.values=[]
    def handle_starttag(self,tag,attrs):
        if tag not in ('a','link','script','img','source'):return
        at=dict(attrs)
        for key in ('href','src'):
            if at.get(key):self.values.append((tag,at[key]))

def audit(surface):
    root=ROOT/surface;missing=[];checked=0
    for html in root.rglob('*.html'):
        parser=Links();parser.feed(html.read_text(encoding='utf-8'))
        for tag,link in parser.values:
            if link.startswith(('#','//')) or link.startswith(EXTERNAL):continue
            path=unquote(urlsplit(link).path)
            if not path:continue
            if path.startswith('/'):
                candidate=root/path.lstrip('/')
            else:
                candidate=html.parent/path
            if candidate.is_dir() or path.endswith('/'):
                candidate=candidate/'index.html'
            checked+=1
            if not candidate.is_file():missing.append(f'{html.relative_to(ROOT)} -> {link}')
    return checked,missing

if __name__=='__main__':
    failed=[]
    for surface in ('site','desk'):
        count,missing=audit(surface)
        print(f'{surface}: {count} local HTML references checked; {len(missing)} missing')
        for x in missing:print('MISSING:',x)
        failed.extend(missing)
    raise SystemExit(1 if failed else 0)

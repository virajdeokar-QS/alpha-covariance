"""Idempotently add Research Access entrance to the existing public site generator.
Run from repository root: python scripts/apply_stage1_public.py
Keeps .git, existing remote README, and unchanged public research pages intact.
"""
from pathlib import Path
import subprocess, sys
ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'build.py'
if not source.exists():
    raise SystemExit('ERROR: Run inside the existing alpha-covariance-site repository, not its parent folder.')
s = source.read_text(encoding='utf-8')

# Specific generator anchors are required; abort rather than apply partial unsafe replacements.
changes = [
    ("('About','/about/')]", "('About','/about/'),('Access','/access/')]"),
    ('href="/contact/" class="header-action">OPEN A CONVERSATION',
     'href="/access/" class="header-action">RESEARCH ACCESS'),
    ('<a href="/about/">About</a></div>',
     '<a href="/about/">About</a><a href="/access/">Research access</a></div>'),
    ("('privacy','privacy','Privacy'",
     "('access','access','Research access','Sign in to the restricted Alpha Covariance Research Desk using approved identity credentials.',access,''),('privacy','privacy','Privacy'"),
    ("'contact','privacy')]", "'contact','access','privacy')]"),
]
for old,new in changes:
    if new in s: continue
    if old not in s: raise SystemExit(f'ERROR: Generator structure differs; no changes saved. Missing: {old[:65]}')
    s=s.replace(old,new,1)
if "access=f'''" not in s:
    anchor='pages=[('
    if anchor not in s: raise SystemExit('ERROR: Could not locate generator pages list; no changes saved.')
    fragment=(ROOT/'scripts/access_fragment.txt').read_text(encoding='utf-8')
    s=s.replace(anchor,fragment+anchor,1)
source.write_text(s,encoding='utf-8')
subprocess.run([sys.executable,str(source)],cwd=ROOT,check=True)
readme=ROOT/'README.md'
section='''\n\n## Private Desk / Stage 1\n\nThe new authenticated Research Desk is in `desk/` and has its own Worker configuration `wrangler.desk.jsonc`. It is not automatically deployed by the existing public Worker. Read `docs/DESK_STAGE1_DEPLOY.md` for safe deployment and Cloudflare Access configuration. See `docs/DESK_ROADMAP.md` for stage gates. No broker trading, backtest jobs, persistent trading database or strategy performance is claimed at this stage.\n'''
if readme.exists() and '## Private Desk / Stage 1' not in readme.read_text(encoding='utf-8'):
    with readme.open('a',encoding='utf-8') as f: f.write(section)
print('Public access entrance created at site/access/index.html; nav updated. Existing site sections preserved.')

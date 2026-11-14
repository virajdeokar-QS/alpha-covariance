$ErrorActionPreference = 'Stop'
function Assert-Exit { if ($LASTEXITCODE -ne 0) { throw "Previous command failed: exit $LASTEXITCODE" } }
Write-Host "Alpha Covariance R1.2 · local release verification"
python build.py; Assert-Exit
node --test (Get-ChildItem .\tests\*.test.mjs | ForEach-Object FullName); Assert-Exit
python -m unittest discover -s tests_engine -q; Assert-Exit
python -m research_engine check; Assert-Exit
python scripts/audit_research_links.py; Assert-Exit
git diff --check; Assert-Exit
npx.cmd wrangler deploy --config .\wrangler.desk.jsonc --dry-run; Assert-Exit
Write-Host "Local checks passed. No production deployment performed."

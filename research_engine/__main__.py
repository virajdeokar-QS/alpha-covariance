import sys
if len(sys.argv)!=2 or sys.argv[1] not in ('api','worker','check'):
    raise SystemExit('Usage: python -m research_engine [api|worker|check]')
if sys.argv[1]=='api':
    from .server import serve
    serve()
elif sys.argv[1]=='worker':
    from .daemon import work
    work()
else:
    import json,os
    from .store import ResearchStore
    print(json.dumps(ResearchStore(os.environ.get('AC_ENGINE_HOME','./runtime')).state(),indent=2))

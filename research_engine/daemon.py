"""Durable local job runner: a separate process, not tied to a browser tab."""
import os,time
from .store import ResearchStore


def work():
    store=ResearchStore(os.environ.get('AC_ENGINE_HOME','./runtime'))
    store.recover_jobs()
    interval=float(os.environ.get('AC_REPLAY_TICK_SECONDS','3.0'))
    if not 1<=interval<=60:raise SystemExit('AC_REPLAY_TICK_SECONDS must be 1 to 60')
    print('Alpha Covariance research worker: online. Historical replay only; no live orders.',flush=True)
    try:
        while True:
            processed=store.process_one_job()
            store.tick_sessions()
            time.sleep(0.1 if processed else interval)
    except KeyboardInterrupt:print('Worker stopped; queued research is persisted. Paper sessions require explicit restart only if stopped.',flush=True)

"""
test_weekly_summary_e2e.py — throwaway e2e check for the new
/dashboard/patients/{id}/weekly-summary endpoint.

Run from breathquest/backend/:
    python test_weekly_summary_e2e.py

Delete once it passes — same as the throwaway test from the assignments/
goals/messages round.
"""

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from httpx import AsyncClient, ASGITransport

from database import Base, get_db
from main import app
from core.deps import get_current_therapist

# Import every model module so all tables (including vaakmirror /
# voicehurdlerace, if those live in separate Base-metadata modules in your
# tree) get registered on Base.metadata before create_all — same gotcha
# your last e2e run hit.
from models import models as core_models
try:
    from models import voicehurdlerace_models  # noqa: F401
except ImportError:
    pass
try:
    from vaakmirror import models as vaakmirror_models  # noqa: F401
except ImportError:
    pass

from models.models import Patient, Therapist, GameSession, LevelID, SessionStatus, \
    Assignment, AssignmentStatus, Goal, HomePracticeLog


TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


async def main():
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with TestSession() as session:
            yield session

    # --- seed a therapist + patient + this-week data ---
    async with TestSession() as session:
        therapist = Therapist(email="t@example.com", hashed_password="x", full_name="Test Therapist")
        session.add(therapist)
        await session.flush()

        patient = Patient(
            therapist_id=therapist.id, first_name="Maya", avatar="chick",
            pin_hash="x", player_code="ABC123",
        )
        session.add(patient)
        await session.flush()

        now = datetime.now(timezone.utc)
        this_monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

        # BreathQuest sessions this week
        for i in range(3):
            session.add(GameSession(
                patient_id=patient.id, level_id=LevelID.pinwheel,
                started_at=this_monday + timedelta(days=i, hours=1),
                status=SessionStatus.completed, completed=(i != 2),
                stars_earned=[3, 2, 1][i], avg_breath_strength=0.7,
                breath_consistency=0.6,
            ))

        # Assignment completed this week + one overdue
        session.add(Assignment(
            patient_id=patient.id, assigned_by=therapist.id, game="chime",
            title="Practice /s/ sounds", status=AssignmentStatus.completed,
            completed_at=this_monday + timedelta(days=1),
        ))
        session.add(Assignment(
            patient_id=patient.id, assigned_by=therapist.id, game="breathquest",
            title="Finish Candle level", status=AssignmentStatus.overdue,
            due_at=this_monday - timedelta(days=2),
        ))

        # Goal achieved this week
        session.add(Goal(
            patient_id=patient.id, created_by=therapist.id,
            target_metric="breath_consistency", target_value=0.5,
            achieved=True, achieved_at=this_monday + timedelta(days=2),
        ))

        # Home practice logs
        for i in range(4):
            session.add(HomePracticeLog(
                patient_id=patient.id,
                practiced_on=this_monday + timedelta(days=i),
                duration_minutes=10,
            ))

        await session.commit()
        patient_id = patient.id
        therapist_id = therapist.id

    async def override_get_current_therapist():
        async with TestSession() as session:
            t = await session.get(Therapist, therapist_id)
            return t

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_therapist] = override_get_current_therapist

    # Detect whether routes are registered with an /api/v1 prefix at the
    # FastAPI level (vs. added only by a reverse proxy in front of it) so
    # this test hits the right path either way, instead of guessing.
    def _walk(routes):
        out = []
        for r in routes:
            p = getattr(r, "path", None)
            if p:
                out.append(p)
            sub = getattr(r, "routes", None)
            if sub:
                out.extend(_walk(sub))
            orig = getattr(r, "original_router", None)
            if orig is not None:
                out.extend(_walk(orig.routes))
        return out

    all_paths = _walk(app.routes)
    prefix = "/api/v1" if any(p.startswith("/api/v1") for p in all_paths) else ""
    print(f"Using route prefix: {prefix!r}")

    # Find the actual Route object(s) for weekly-summary, not just the path
    # string, so we can see real HTTP methods / endpoint / whether it's
    # registered more than once with conflicting config.
    def _walk_route_objs(routes):
        out = []
        for r in routes:
            p = getattr(r, "path", None)
            if p:
                out.append(r)
            sub = getattr(r, "routes", None)
            if sub:
                out.extend(_walk_route_objs(sub))
            orig = getattr(r, "original_router", None)
            if orig is not None:
                out.extend(_walk_route_objs(orig.routes))
        return out

    route_objs = _walk_route_objs(app.routes)
    ws_routes = [r for r in route_objs if "weekly-summary" in getattr(r, "path", "")]
    print(f"\n{len(ws_routes)} route object(s) matched weekly-summary:")
    for r in ws_routes:
        print("  path:", r.path)
        print("  methods:", getattr(r, "methods", None))
        print("  endpoint:", getattr(r, "endpoint", None))
        print("  name:", getattr(r, "name", None))

    if not ws_routes:
        raise SystemExit("No weekly-summary route object found — aborting before making a request.")

    real_path = app.url_path_for(ws_routes[0].name, patient_id=patient_id)
    print(f"\nReal dispatchable path via url_path_for: {real_path}")

    # --- Direct call, bypassing HTTP/ASGI entirely, to isolate whether the
    # 404 comes from routing or from the endpoint's own logic (e.g. the
    # ownership check not finding the patient). ---
    print("\n--- Direct function call diagnostic (no HTTP layer) ---")
    from routers.dashboard import get_weekly_summary as _get_weekly_summary_fn
    async with TestSession() as diag_session:
        diag_therapist = await diag_session.get(Therapist, therapist_id)
        print("diag_therapist found:", diag_therapist is not None, diag_therapist)
        diag_patient_check = await diag_session.get(Patient, patient_id)
        print("diag_patient found via session.get:", diag_patient_check is not None, diag_patient_check)
        try:
            direct_result = await _get_weekly_summary_fn(
                patient_id=patient_id, week_offset=0,
                therapist=diag_therapist, db=diag_session,
            )
            print("DIRECT CALL SUCCEEDED:")
            print(" narrative:", direct_result.narrative[:120], "...")
        except Exception as e:
            print(f"DIRECT CALL RAISED: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
    print("--- end diagnostic ---\n")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # --- own patient: should succeed with real data ---
        resp = await client.get(str(real_path))
        print("Actual request URL:", resp.request.url)
        print("status:", resp.status_code)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        print("\n--- narrative ---")
        print(data["narrative"])
        print("\n--- highlights ---")
        for h in data["highlights"]:
            print(" ", h)
        print("\n--- stats ---")
        print(data["stats"])

        assert data["stats"]["bq_sessions"] == 3
        assert data["stats"]["assignments_completed"] == 1
        assert data["stats"]["assignments_overdue"] == 1
        assert data["stats"]["home_practice_days"] == 4
        assert data["stats"]["goals_achieved_total"] == 1
        print("\nPASS: stats match seeded data")

        # --- determinism: calling twice gives identical narrative ---
        resp2 = await client.get(str(app.url_path_for("get_weekly_summary", patient_id=patient_id)))
        assert resp2.json()["narrative"] == data["narrative"]
        print("PASS: narrative is deterministic across repeated calls")

        # --- week_offset=1 (prior week, no data) should still 200 ---
        resp3 = await client.get(str(app.url_path_for("get_weekly_summary", patient_id=patient_id)) + "?week_offset=1")
        assert resp3.status_code == 200, resp3.text
        assert resp3.json()["narrative"] != data["narrative"]
        print("PASS: prior week returns a different (quiet-week) narrative, still 200")

        # --- another therapist's patient: must 404, not leak ---
        async with TestSession() as session:
            other_therapist = Therapist(email="other@example.com", hashed_password="x", full_name="Other")
            session.add(other_therapist)
            await session.commit()
            other_id = other_therapist.id

        app.dependency_overrides[get_current_therapist] = lambda: TestSession().get(Therapist, other_id)
        # simpler: just hit with a patient_id that belongs to `therapist`, while
        # overridden current-therapist is `other_therapist`
        async def override_other():
            async with TestSession() as session:
                return await session.get(Therapist, other_id)
        app.dependency_overrides[get_current_therapist] = override_other

        resp4 = await client.get(str(app.url_path_for("get_weekly_summary", patient_id=patient_id)))
        assert resp4.status_code == 404, resp4.text
        print("PASS: another therapist's request 404s (no data leak)")

    await engine.dispose()
    print("\nALL WEEKLY-SUMMARY E2E CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())

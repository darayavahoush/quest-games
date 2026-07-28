"""
One-off diagnostic: confirms which database the app's engine is actually
connected to, and whether the patients table exists there with real rows.

Run from breathquest/backend with the venv active:
    python check_db.py
"""

import asyncio

from database import engine


async def check() -> None:
    async with engine.connect() as conn:
        db_name = (await conn.exec_driver_sql("SELECT current_database()")).scalar()
        print(f"Connected to database: {db_name}")

        table_exists = (
            await conn.exec_driver_sql("SELECT to_regclass('patients')")
        ).scalar()
        print(f"patients table exists here: {bool(table_exists)}")

        if table_exists:
            count = (await conn.exec_driver_sql("SELECT count(*) FROM patients")).scalar()
            print(f"Row count in patients: {count}")


if __name__ == "__main__":
    asyncio.run(check())

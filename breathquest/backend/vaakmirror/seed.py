"""
Seeds the exercise_templates table with VaakMirror's starter exercise library.

Run from breathquest/backend with the venv active:
    python -m vaakmirror.seed
"""

import asyncio

from sqlalchemy import select

from database import AsyncSessionLocal
from vaakmirror.models import ExerciseTemplate

EXERCISE_TEMPLATES = [
    {
        "title": "Mirror Practice: /s/ and /z/ Sounds",
        "description": "Practice tongue placement for sibilant sounds using the mirror feedback game. Focus on keeping the tongue tip low and avoiding lateral airflow.",
        "duration_label": "5 min",
        "target_categories": ["sibilants", "place_of_articulation"],
    },
    {
        "title": "Tongue Tamer: Alveolar Sounds",
        "description": "Hold-to-pass exercise targeting /t/, /d/, /n/, and /l/ — sounds produced with the tongue tip against the alveolar ridge.",
        "duration_label": "7 min",
        "target_categories": ["alveolar", "place_of_articulation"],
    },
    {
        "title": "Lip Sync Hero: Bilabial Warm-Up",
        "description": "Timed matching exercise for /p/, /b/, and /m/ — sounds requiring both lips to close fully.",
        "duration_label": "4 min",
        "target_categories": ["bilabial", "place_of_articulation"],
    },
    {
        "title": "Voicing Contrast Drill",
        "description": "Alternating practice between voiced and voiceless cognate pairs (e.g. /p/-/b/, /t/-/d/, /k/-/g/) to build voicing control.",
        "duration_label": "6 min",
        "target_categories": ["voicing"],
    },
    {
        "title": "Fricative Focus Session",
        "description": "Extended practice on continuous airflow sounds — /f/, /v/, /θ/, /ð/, /s/, /z/, /ʃ/, /ʒ/ — using the mirror feedback game.",
        "duration_label": "8 min",
        "target_categories": ["fricatives", "manner_of_articulation"],
    },
]


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(ExerciseTemplate.title))
        existing_titles = {row[0] for row in existing.all()}

        to_add = [
            ExerciseTemplate(**data)
            for data in EXERCISE_TEMPLATES
            if data["title"] not in existing_titles
        ]

        if not to_add:
            print("All seed exercise templates already exist — nothing to add.")
            return

        session.add_all(to_add)
        await session.commit()
        print(f"Added {len(to_add)} exercise template(s).")


if __name__ == "__main__":
    asyncio.run(seed())

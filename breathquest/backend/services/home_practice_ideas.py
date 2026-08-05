"""
services/home_practice_ideas.py — static library of 50 written home
practice activities, tagged by condition and goal so they can be filtered
(spec: "50 written home practice ideas sorted by condition and goal").

These are generic, non-clinical activity suggestions in the spirit of what
an SLP hands a parent at the end of a session — not dosing, not medical
advice, not a substitute for a therapist's individualized home program.
Each patient's actual therapist should still pick what's appropriate.
"""

CONDITIONS = [
    "articulation", "phonological", "language", "fluency", "voice", "oral-motor",
]

IDEAS = [
    # --- Articulation: /s/, /z/ ---
    {"id": 1, "title": "Snake hiss hunt", "description": "Walk around the house making a long 'sss' sound, then say five words that start with S you can find along the way.", "conditions": ["articulation"], "goals": ["s"]},
    {"id": 2, "title": "S at the sink", "description": "While washing hands, practice 's' words related to the bathroom: soap, sink, splash, suds.", "conditions": ["articulation"], "goals": ["s"]},
    {"id": 3, "title": "Buzzing bee game", "description": "Take turns being a 'z' buzzing bee flying to objects around the room, naming each one with a z-word if possible (zoo animal toy, zipper, etc).", "conditions": ["articulation"], "goals": ["z"]},
    # --- Articulation: /r/ ---
    {"id": 4, "title": "Pirate 'rrr' warm-up", "description": "Growl like a pirate ('rrrrr') for 10 seconds before practicing r-words like 'red', 'run', 'rabbit'.", "conditions": ["articulation"], "goals": ["r"]},
    {"id": 5, "title": "Car engine sounds", "description": "Make revving car-engine 'rrr' noises during pretend play, then race toy cars while naming their colors using r-words where possible.", "conditions": ["articulation"], "goals": ["r"]},
    {"id": 6, "title": "R at the dinner table", "description": "Practice naming three foods on the table that have 'r' in them (carrot, rice, orange) before eating.", "conditions": ["articulation"], "goals": ["r"]},
    # --- Articulation: /l/ ---
    {"id": 7, "title": "Lollipop lick-up", "description": "Practice lifting just the tongue tip (like reaching for an imaginary lollipop) 10 times, then say 'la la la' together.", "conditions": ["articulation", "oral-motor"], "goals": ["l"]},
    {"id": 8, "title": "L is for laundry", "description": "While folding laundry, name items using l-words: light, long, little, laundry.", "conditions": ["articulation"], "goals": ["l"]},
    # --- Articulation: /th/ ---
    {"id": 9, "title": "Thumbs-up th check", "description": "Practice sticking the tongue tip out gently between the teeth for 'th' words like 'thumb', 'this', 'that' — use a mirror so your child can see their tongue.", "conditions": ["articulation"], "goals": ["th"]},
    {"id": 10, "title": "Thinking cap game", "description": "Ask 'what are you thinking about?' and encourage a full sentence starting with 'I think...' to get repeated th practice.", "conditions": ["articulation"], "goals": ["th"]},
    # --- Articulation: /k/, /g/ ---
    {"id": 11, "title": "Cookie jar cough", "description": "Practice a gentle throat-clear/cough sound to feel where 'k' and 'g' sounds are made, then ask for a 'cookie' using a clear k.", "conditions": ["articulation", "oral-motor"], "goals": ["k", "g"]},
    {"id": 12, "title": "Goofy goose walk", "description": "Waddle around like a goose saying 'go go go' and 'goose goose goose' to practice the g sound in motion.", "conditions": ["articulation"], "goals": ["g"]},
    # --- Articulation: general / minimal pairs ---
    {"id": 13, "title": "Minimal pair matching", "description": "Say two similar-sounding words (e.g. 'sip' vs 'ship') and have your child point to the matching picture or object — great for sounds they mix up.", "conditions": ["articulation", "phonological"], "goals": ["general"]},
    {"id": 14, "title": "Mirror mouth check", "description": "Practice target sounds in front of a mirror so your child can watch their own mouth shape match yours.", "conditions": ["articulation"], "goals": ["general"]},
    {"id": 15, "title": "Slow-motion sound stretch", "description": "Stretch out the target sound at the start of a word ('mmmmilk' instead of 'milk') before saying the whole word normally.", "conditions": ["articulation"], "goals": ["general"]},

    # --- Phonological processes ---
    {"id": 16, "title": "Ending sounds scavenger hunt", "description": "Find 5 objects around the house and practice saying the whole word clearly, paying extra attention to the last sound (e.g. 'cup' not 'cu').", "conditions": ["phonological"], "goals": ["final-consonants"]},
    {"id": 17, "title": "Syllable clap-along", "description": "Clap out the syllables in your child's favorite words together (e.g. 'el-e-phant' = 3 claps) to build awareness of longer words.", "conditions": ["phonological"], "goals": ["syllables"]},
    {"id": 18, "title": "Big sound vs. small sound", "description": "Practice contrasting a sound made at the front of the mouth (like 't') with one made at the back ('k') using simple word pairs like 'tea' vs 'key'.", "conditions": ["phonological"], "goals": ["general"]},
    {"id": 19, "title": "Blend it together", "description": "Practice consonant blends by starting slow — 's...top', 's-top' — then speeding up to the full word 'stop'.", "conditions": ["phonological"], "goals": ["blends"]},
    {"id": 20, "title": "Silly simplification swap", "description": "If your child simplifies a word, model it back clearly without correcting directly: child says 'wabbit', you say 'oh, the rabbit! the rabbit is hopping.'", "conditions": ["phonological"], "goals": ["general"]},

    # --- Language / vocabulary ---
    {"id": 21, "title": "Describe it, don't name it", "description": "Take turns describing an object's color, size, and use without saying its name, and guess what the other person means.", "conditions": ["language"], "goals": ["vocabulary", "description"]},
    {"id": 22, "title": "Category sorting", "description": "Sort toys, groceries, or laundry into categories together (animals, clothes, food) and talk about why each item belongs.", "conditions": ["language"], "goals": ["vocabulary", "categorization"]},
    {"id": 23, "title": "Two-word combos", "description": "During play, model and encourage simple two-word combinations: 'more juice', 'big dog', 'go car'.", "conditions": ["language"], "goals": ["sentence-length"]},
    {"id": 24, "title": "Story retell", "description": "After reading a short book together, ask your child to retell it in their own words — help by asking 'and then what happened?'", "conditions": ["language"], "goals": ["narrative"]},
    {"id": 25, "title": "New word of the day", "description": "Pick one new word each day (from a book, a walk, a meal) and use it together in at least three different sentences.", "conditions": ["language"], "goals": ["vocabulary"]},
    {"id": 26, "title": "Wh-question walk", "description": "On a walk, ask a mix of 'what', 'where', and 'who' questions about what you see, keeping questions short and concrete.", "conditions": ["language"], "goals": ["comprehension"]},
    {"id": 27, "title": "Opposite game", "description": "Say a word and have your child say its opposite (big/small, hot/cold, up/down) — swap roles so they also get to give the prompt.", "conditions": ["language"], "goals": ["vocabulary"]},
    {"id": 28, "title": "Following two-step directions", "description": "Give playful two-step directions ('touch your nose, then jump twice') and gradually build to three steps as they succeed.", "conditions": ["language"], "goals": ["comprehension"]},
    {"id": 29, "title": "Pronoun practice with photos", "description": "Look at family photos together and practice 'he', 'she', 'they' — 'she is smiling', 'they are outside'.", "conditions": ["language"], "goals": ["grammar"]},
    {"id": 30, "title": "Past-tense storytelling", "description": "Ask about something that already happened today ('what did you eat for breakfast?') to practice past-tense verbs naturally.", "conditions": ["language"], "goals": ["grammar"]},

    # --- Fluency ---
    {"id": 31, "title": "Slow, easy starts", "description": "Model starting sentences a little slower and with a relaxed, easy first sound, rather than rushing in — your child can copy the pace, not the words.", "conditions": ["fluency"], "goals": ["general"]},
    {"id": 32, "title": "One at a time talking", "description": "During family meals, practice a 'talking stick' or similar turn-taking cue so there's no rush or interruption pressure while your child is speaking.", "conditions": ["fluency"], "goals": ["general"]},
    {"id": 33, "title": "Pause and breathe together", "description": "Practice taking one slow breath before starting a sentence, turning it into a calm shared habit rather than a correction.", "conditions": ["fluency"], "goals": ["general"]},
    {"id": 34, "title": "Low-pressure describing", "description": "Look at a picture book together and describe it out loud yourself first, at an unhurried pace, before inviting your child to add something.", "conditions": ["fluency"], "goals": ["general"]},
    {"id": 35, "title": "Singing it out", "description": "Sing familiar songs together — singing naturally smooths out speech rhythm and can be a fun, pressure-free practice moment.", "conditions": ["fluency"], "goals": ["general"]},

    # --- Voice ---
    {"id": 36, "title": "Quiet voice vs. loud voice", "description": "Practice using an intentionally quiet 'library voice' and a louder 'outside voice' with silly examples, building awareness of vocal volume.", "conditions": ["voice"], "goals": ["volume"]},
    {"id": 37, "title": "Water sipping breaks", "description": "Build in regular water sips during long periods of talking or singing to keep the vocal folds hydrated.", "conditions": ["voice"], "goals": ["vocal-hygiene"]},
    {"id": 38, "title": "Humming warm-up", "description": "Hum a favorite tune together gently for a minute before a big talking activity (like a video call with grandparents) as a vocal warm-up.", "conditions": ["voice"], "goals": ["general"]},
    {"id": 39, "title": "No-shouting signal", "description": "Agree on a hand signal for 'let's use our regular voice' instead of shouting across rooms — practice using it playfully during games.", "conditions": ["voice"], "goals": ["vocal-hygiene"]},
    {"id": 40, "title": "Gentle voice storytelling", "description": "Take turns telling a short made-up story using a smooth, gentle voice throughout — notice together how it feels different from shouting.", "conditions": ["voice"], "goals": ["general"]},

    # --- Oral motor ---
    {"id": 41, "title": "Bubble blowing", "description": "Blow bubbles together, encouraging a steady stream of air through rounded lips — great for breath support and lip control.", "conditions": ["oral-motor"], "goals": ["breath-support"]},
    {"id": 42, "title": "Straw drinking practice", "description": "Practice drinking thicker liquids (like a smoothie) through a straw to build lip seal and tongue control.", "conditions": ["oral-motor"], "goals": ["lip-strength"]},
    {"id": 43, "title": "Silly face warm-up", "description": "Make a sequence of silly faces together — big smile, fish lips, puffed cheeks — as a fun 2-minute oral motor warm-up before practice.", "conditions": ["oral-motor"], "goals": ["general"]},
    {"id": 44, "title": "Lick the lollipop (imaginary)", "description": "Practice moving just the tongue tip up, down, left, and right without moving the jaw, pretending to lick an imaginary lollipop in each direction.", "conditions": ["oral-motor"], "goals": ["tongue-control"]},
    {"id": 45, "title": "Whistle practice", "description": "Practice (or work toward) whistling together — the lip rounding and steady airflow support both articulation and breath control.", "conditions": ["oral-motor"], "goals": ["breath-support"]},

    # --- Social / pragmatic language ---
    {"id": 46, "title": "Greeting practice", "description": "Role-play greeting a family member or a stuffed animal — 'hi, how are you?' — practicing eye contact and a clear voice.", "conditions": ["language"], "goals": ["social"]},
    {"id": 47, "title": "Turn-taking board game", "description": "Play any simple board or card game together, narrating turns out loud ('my turn... your turn') to build conversational turn-taking.", "conditions": ["language"], "goals": ["social"]},
    {"id": 48, "title": "Feelings check-in", "description": "At the end of the day, ask your child to name one feeling word about their day and why — expands both vocabulary and emotional language.", "conditions": ["language"], "goals": ["social", "vocabulary"]},
    {"id": 49, "title": "Phone call practice", "description": "Practice a short pretend phone call (with a toy phone or a real call to a relative) — this builds comfort with back-and-forth conversation.", "conditions": ["language"], "goals": ["social"]},
    {"id": 50, "title": "Asking for help", "description": "Practice a simple phrase for asking for help ('can you help me, please?') during a task that's a little bit tricky, like opening a jar.", "conditions": ["language"], "goals": ["social"]},
]


def filter_ideas(condition: str | None = None, goal: str | None = None):
    results = IDEAS
    if condition:
        results = [i for i in results if condition in i["conditions"]]
    if goal:
        results = [i for i in results if goal in i["goals"] or "general" in i["goals"]]
    return results

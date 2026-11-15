# Mock TOEIC Test 1 — content spec

One complete, ORIGINAL TOEIC Listening & Reading practice test for a Korean learner targeting 850+.
Part 1 is intentionally omitted. Question numbers follow the official numbering (7–200).
Never copy or paraphrase real ETS items. Fictional companies/people/places only; no real brands.

Difficulty: match a real recent TOEIC (post-2016 format). Mix easy/medium/hard roughly 25/45/30.
Distractors must be plausible and follow real TOEIC trap patterns (similar sound, word repetition,
right topic wrong detail, wrong tense/person, off-scope). Exactly one defensible answer per item.
Spread correct answers evenly across letters within each part (no long runs, no letter > 35%).

All Korean (`ko`, `exp`) is natural Korean. `exp` explains why the answer is right AND briefly why
the main trap is wrong, 1–3 sentences, and may quote the decisive line.

Validate every file you write by parsing it with Python (`python -I -c ...`) and checking counts,
numbering, answer letters, and the field rules below. Fix and re-validate until clean.

## Common question object
```json
{ "no": 32, "q": "Where most likely are the speakers?", "options": ["...","...","...","..."],
  "answer": "B", "exp": "한국어 해설", "ko": "질문 한국어 번역" }
```
`options` has 4 strings (Part 2 has 3). `answer` is "A"–"D" ("A"–"C" for Part 2).
Options are plain text with no "(A)" prefixes.

## Speakers (Parts 2–4)
Each speaker is `{ "id": "W1", "gender": "F" | "M", "accent": "US" | "GB" }`. Use roughly 65% US, 35% GB.

## content/p2.json — Part 2 (Q7–31, 25 items)
Array of 25:
```json
{ "no": 7, "speakers": [{"id":"W1","gender":"F","accent":"US"},{"id":"M1","gender":"M","accent":"GB"}],
  "prompt": "When is the new printer being delivered?", "promptKo": "새 프린터는 언제 배송되나요?",
  "options": ["...","...","..."], "optionsKo": ["...","...","..."], "answer": "C", "exp": "..." }
```
The first speaker says the prompt, the second says all three options. Mix: ~5 WH-question types each,
yes/no, choice (A or B), suggestion/request, statement, negative/tag questions. At least 8 correct answers
must be indirect responses (e.g. "I just started here last week."). Prompts 4–15 words, options 3–12 words.

## content/p3.json — Part 3 (Q32–70, 13 sets × 3 questions)
Array of 13:
```json
{ "nos": [32,33,34], "speakers": [...2 or 3...],
  "lines": [{"s":"W1","t":"..."}, {"s":"M1","t":"..."}],
  "linesKo": ["...", "..."],
  "graphic": null,
  "questions": [ <common question object> × 3 ] }
```
- 6–10 lines, 110–170 words per conversation; workplace/business/daily-service settings.
- Two sets have three speakers (e.g. W1, M1, M2). Two questions across the part are "What does the man mean
  when he says, '...'?" (implied meaning) and the quoted words must appear exactly in a line.
- The last three sets (Q62–70) each have a graphic and one question that says "Look at the graphic."
  `graphic`: `{ "title": "...", "columns": ["...","..."], "rows": [["...","..."], ...] }` (a schedule,
  price list, floor directory, coupon, etc.; 2–4 columns, 3–6 rows; plain text cells).
  The graphic question must require combining the conversation with the graphic.
- Typical question order: first question is about the beginning (topic/place/job), the third about the end
  (next action/request).

## content/p4.json — Part 4 (Q71–100, 10 sets × 3 questions)
Same shape as Part 3 but `speakers` has exactly one speaker and `lines` is a talk split into 4–7 natural
chunks (paragraph-sized). 120–180 words per talk. Mix: telephone message, announcement, radio broadcast,
tour, meeting excerpt, advertisement, talk/introduction, news report. Two implied-meaning questions
("What does the speaker imply when she says, '...'?"). The last two sets (Q95–100) have graphics.

## content/p5.json — Part 5 (Q101–130, 30 items)
Array of 30 common question objects, where `q` is the sentence with the blank written as `-------`
(seven hyphens). ~45% vocabulary (incl. collocations, prepositions/conjunctions), ~55% grammar
(word form/part of speech, verb tense/voice/agreement, pronouns, relative clauses, comparatives,
participles). `ko` is the full Korean translation with the answer filled in.

## content/p6.json — Part 6 (Q131–146, 4 passages × 4 questions)
Array of 4:
```json
{ "nos": [131,132,133,134], "type": "e-mail" | "notice" | "article" | "letter" | "memo" | "advertisement",
  "header": ["To: ...", "From: ...", "Date: ...", "Subject: ..."] or [],
  "title": "optional heading or \"\"",
  "body": "Paragraph text with blanks as {{131}} ... \n\n separates paragraphs",
  "bodyKo": "Korean translation of the completed passage",
  "questions": [ <common question object with q = ""> × 4 ] }
```
Exactly one question per passage is sentence insertion: its 4 options are full sentences.
Others are word/phrase blanks, at least one per passage needing context beyond the sentence.

## content/p7s.json — Part 7 single passages (Q147–175, 10 sets)
Set sizes in order: 2,2,2,2,3,3,3,4,4,4.
```json
{ "nos": [147,148], "docs": [ <doc> ], "questions": [ ... ] }
```
`<doc>`: `{ "type": "e-mail|notice|article|advertisement|form|text-message-chain|online-chat|letter|web-page|memo|invoice|review",
  "header": [...], "title": "...", "body": "...", "bodyKo": "..." }`.
For `text-message-chain` and `online-chat`, put messages in `"messages": [{"name":"Lena Ortiz","time":"10:14 A.M.","t":"..."}]`
(with `"messagesKo": [...]`) instead of `body`/`bodyKo`, and include one implied-meaning question
("At 10:16 A.M., what does Mr. X most likely mean when he writes, '...'?").
Exactly two sets contain a sentence-position question: the body contains the markers [1] [2] [3] [4] and the
question is `In which of the positions marked [1], [2], [3], and [4] does the following sentence best belong?\n"..."`
with options "[1]","[2]","[3]","[4]". Include NOT/true, inference, synonym ("The word \"x\" in paragraph 1, line 2,
is closest in meaning to") question types across the part. Passage lengths 90–300 words, longer for 4-question sets.

## content/p7m.json — Part 7 multiple passages (Q176–200, 5 sets × 5 questions)
Q176–180 and Q181–185 are double passages (2 docs); Q186–190, 191–195, 196–200 are triple (3 docs).
Same shape as p7s sets. Each set needs at least one question that requires combining information from two docs.
Each doc 80–220 words.

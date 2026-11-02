import { UPLOAD_EXAMPLE } from "./questionUpload";

/**
 * Instructions for an AI (Jacob's and Rayan's Claude) writing questions to
 * upload (2026-11-02). Copied or downloaded from the Upload questions
 * window, so it is always the version the app reads. It is the generator's
 * own rules (resurface-backend lib/prompt.js), the giveaways found in the
 * bank on 2026-11-02, the knowledge-library note format, and the JSON.
 */
export const UPLOAD_GUIDE = `# Writing questions for Resurface

You are writing single-best-answer (SBA) questions for Resurface, a revision app for ARU MBChB medical students. They will be uploaded into a deck and answered by students revising for the real exam, so they must look and feel like the university's own papers. Return ONLY a JSON file in the format at the end, nothing else.

## 1. Grounding
- Every question must be answerable from the material you are given (lecture slides, notes or Anki cards). The correct answer must appear in it.
- Wrong options come from the same material: the other structures, enzymes, cells, drugs or terms the lecture mentions.
- Spread the questions across the material in proportion to how much of it each topic takes. Do not ask about a passing mention.
- If the material is Anki cards, use only what is on the cards. Do not add "classic exam" facts from outside them.

## 2. The question (stem)
- 10 to 35 words: up to three short sentences of context, then ONE direct question ending in "?". A clinical scenario may reach 50 words.
- Mix the shapes: a direct question, a fact then a question, a short scenario then a question. Never two scenarios in a row.
- Ask one thing. Lead-ins like "Which of the following…", "What is the most likely…", "What is the most appropriate…".
- Never give the answer away: the answer must not appear in the stem, and the stem must not state the fact it asks for.
- At most one in ten may be "Which is NOT…".

## 3. The five options
- Exactly five. Terse noun phrases, usually 1 to 4 words; never full sentences (except a "which statement is correct" question, where all five are one-clause statements of similar length).
- All five are the same kind of thing as the answer: five enzymes, five drugs, five nerves.
- The correct option must NOT stand out. Students learn to spot these, so avoid every one:
  - It must not be the longest or the most detailed. Keep all five within a few words of each other.
  - Same format for all five: if one is a number, all are numbers in the same style ("Aged 40 and over", not "Aged > 40"); if one has an abbreviation in brackets, all do or none do; if one is "X and Y", the others are too or none are.
  - It must not be the only option repeating a distinctive word from the stem.
  - No option may be contained in another ("Hypothyroidism" and "Primary hypothyroidism").
  - No "always", "never", "only", "exclusively" in the wrong options.
  - No "all of the above", "none of the above", "both A and B".
- Every wrong option must be tempting to a half-prepared student: the neighbouring structure, the related enzyme, the right drug in the wrong situation, the common misconception. Never something absurd or from a different category, such as "a layer of skeletal muscle" for an adrenal question.
- Do not worry about order; the app shuffles the options for each student.

## 4. Explanations
- "exp": two sentences on why the correct answer is right, teaching the mechanism, not just restating it.
- "why": one sentence per option on why that wrong option is wrong, in the same order as "options", with an empty string "" for the correct one.

## 5. The topic note (knowledge library)
Each question can carry the note shown under its explanation: a short revision sheet for its topic.
- One note per topic in the lecture. Questions on the same topic carry the SAME note: copy the title and body exactly.
- "title": a short name for the topic.
- "body" is plain text with a little formatting:
  - It opens with one or two plain sentences saying what the topic is.
  - Then sections: a heading on its own line wrapped in double asterisks (**Heading**), followed by points, each on its own line starting with "- ".
  - Exactly ONE line in the whole note is wrapped in ==double equals==: the single most important fact.
  - It ends with a section headed **Where marks are lost**: two or three traps students fall into on this topic.
  - Short lines, plain UK English, only facts from the material.
  - Separate sections with a blank line.
- "hl": the one or two lines of the note that answer THIS question, copied word for word from the body (without the == marks and without the leading "- "). This is what gets highlighted for this question, so it differs between questions sharing a note. Never put an "=" character in an hl line.

## 6. Style
UK spelling, SI units, British drug names (paracetamol, adrenaline, furosemide).

## 7. Before you return, check every question
- The answer is in the material and is genuinely the single best answer.
- Five options, same kind, similar length and format, none a giveaway, every wrong one plausible.
- "correct" is copied character for character from one of the options.
- "why" has five entries with "" at the correct one.
- If it has a topic note: one ==highlight==, ends with Where marks are lost, and every hl line appears in the body word for word.

## 8. The file
Return one JSON object shaped exactly like this example (one question shown; include as many as asked for):

${JSON.stringify(UPLOAD_EXAMPLE, null, 2)}
`;

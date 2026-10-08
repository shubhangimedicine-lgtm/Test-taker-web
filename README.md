# Test-taker-web
Help make timed test blocks out of pdfs for private users

## NBME question blocks
Open `index.html` in a browser (no build step).

- Questions are split into blocks of 20 (the last block is shorter).
- Each question gets 75 seconds. Choose either a pooled block timer (75 s × questions) or a strict per-question timer that auto-advances.
- The answer key and the % score are shown only after the test is finished.
- Progress is saved in the browser (`localStorage`).

Question data lives in `questions.js`; figures are in `img/`.

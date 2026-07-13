# Addictive Writing blind review

A local-first review workspace for manually comparing 48 paired outputs across 24 creation, rewrite, review, and outline tasks.

The deployed private workspace is available at [addictive-writing-review.marcogworms.chatgpt.site](https://addictive-writing-review.marcogworms.chatgpt.site).

The interface keeps treatment labels hidden until you reveal them, assigns A/B sides consistently for each browser and case, and saves preferences, reason tags, notes, and display settings in browser storage.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` and `npm run build` automatically copy `../comparison/results.json` to `public/results.json`. You can also run `npm run sync:results` directly after generating a new comparison.

## Validate

```bash
npm test
```

The review can be exported as JSON or CSV from the top toolbar. No review data leaves the browser.

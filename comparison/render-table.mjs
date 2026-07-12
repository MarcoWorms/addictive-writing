#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs(argv) {
  const options = { input: null, output: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input") options.input = resolve(argv[++i]);
    else if (argv[i] === "--output") options.output = resolve(argv[++i]);
    else if (argv[i] === "--help" || argv[i] === "-h") {
      process.stdout.write("Usage: node comparison/render-table.mjs --input results.json --output TABLE.md\n");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!options.input || !options.output) throw new Error("--input and --output are required");
  return options;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function details(summary, text) {
  return `<details><summary>${escapeHtml(summary)}</summary><pre>${escapeHtml(text)}</pre></details>`;
}

function render(result) {
  const lines = [
    "# Manual side-by-side comparison",
    "",
    "Every row shows the raw output from two fresh threads. The visible user prompt is byte-identical in both conditions. The only difference is that the **With skill** condition also receives the `addictive-writing` skill input.",
    "",
    "No model judged these outputs. There are no scores, winners, or editorial selections. Expand the cells, choose the version you prefer, and write your own notes.",
    "",
    `- Model: \`${result.configuration.verifiedModel}\``,
    `- Reasoning effort: \`${result.configuration.requestedEffort}\``,
    `- Cases: ${result.cases.length}`,
    `- Skill SHA-256: \`${result.hashes.skillSha256}\``,
    `- Corpus SHA-256: \`${result.hashes.corpusSha256}\``,
    `- Generated: ${result.completedAt}`,
    "",
    "<table>",
    "<thead>",
    "<tr>",
    "<th># / case</th>",
    "<th>Size</th>",
    "<th>Category</th>",
    "<th>Exact prompt</th>",
    "<th>Without skill</th>",
    "<th>With skill</th>",
    "<th>Your pick</th>",
    "<th>Your notes</th>",
    "</tr>",
    "</thead>",
    "<tbody>",
  ];

  result.cases.forEach((testCase, index) => {
    lines.push(
      "<tr>",
      `<td><strong>${index + 1}. ${escapeHtml(testCase.title)}</strong><br><code>${escapeHtml(testCase.id)}</code></td>`,
      `<td>${escapeHtml(testCase.sizeTier.replaceAll("_", " "))}<br>${testCase.sourceWordCount} source words</td>`,
      `<td>${escapeHtml(testCase.category.replaceAll("_", " "))}</td>`,
      `<td>${details(`Show prompt · ${testCase.promptWordCount} words · ${testCase.promptSha256.slice(0, 12)}`, testCase.prompt)}</td>`,
      `<td>${details(`Show output · ${testCase.withoutSkill.outputWordCount} words`, testCase.withoutSkill.output)}</td>`,
      `<td>${details(`Show output · ${testCase.withSkill.outputWordCount} words`, testCase.withSkill.output)}</td>`,
      "<td>□ Without skill<br>□ With skill<br>□ Tie</td>",
      "<td>&nbsp;<br><br><br></td>",
      "</tr>",
    );
  });

  lines.push(
    "</tbody>",
    "</table>",
    "",
    "The complete machine-readable prompts, metadata, condition order, prompt hashes, and outputs are in [`results.json`](results.json). The fixed source corpus is in [`corpus.json`](corpus.json).",
    "",
  );
  return lines.join("\n");
}

const options = parseArgs(process.argv.slice(2));
const result = JSON.parse(await readFile(options.input, "utf8"));
await writeFile(options.output, `${render(result)}\n`, "utf8");

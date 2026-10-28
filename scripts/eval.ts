/**
 * Offline evaluation - measures the parts of the system that can be measured without
 * spending API credits, and writes evals/results.json.
 *
 *  1. Retrieval: does the right passage come back? (hit@k, MRR) for dense-only,
 *     BM25-only and hybrid search, plus whether off-topic questions are flagged as
 *     low confidence.
 *  2. Guardrails: are messages that need a person routed to one (and only those),
 *     and is PII redacted?
 *
 * Usage: npm run eval            (add --sweep to try different fusion weights)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkInput, type Route } from "../lib/engine/guardrails";
import { search, type SearchMode } from "../lib/rag/retriever";

interface RetrievalCase { q: string; expect?: string[]; offTopic?: boolean }
interface RoutingCase { text: string; route: Route; pii?: string[] }

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function evalRetrieval(cases: RetrievalCase[], mode: SearchMode, weights?: { dense: number; bm25: number }) {
  const answerable = cases.filter((c) => !c.offTopic);
  const offTopic = cases.filter((c) => c.offTopic);
  let hit1 = 0, hit3 = 0, hit5 = 0, mrr = 0, covered = 0, rejected = 0;
  const misses: { q: string; expect: string[]; got: string[] }[] = [];

  for (const c of answerable) {
    const result = await search(c.q, { k: 5, mode, weights });
    const ids = result.hits.map((h) => h.chunk.id);
    const rank = ids.findIndex((id) => c.expect!.includes(id)) + 1;
    if (rank === 1) hit1++;
    if (rank >= 1 && rank <= 3) hit3++;
    if (rank >= 1) { hit5++; mrr += 1 / rank; }
    if (result.confidence !== "low") covered++;
    if (rank === 0 || rank > 3) misses.push({ q: c.q, expect: c.expect!, got: ids.slice(0, 3) });
  }
  for (const c of offTopic) {
    const result = await search(c.q, { k: 5, mode, weights });
    if (result.confidence === "low") rejected++;
  }
  const n = answerable.length;
  return {
    mode,
    weights,
    questions: n,
    hitAt1: hit1 / n,
    hitAt3: hit3 / n,
    hitAt5: hit5 / n,
    mrr: mrr / n,
    answerableWithConfidence: covered / n,
    offTopicFlaggedLow: offTopic.length ? rejected / offTopic.length : null,
    misses,
  };
}

function evalRouting(cases: RoutingCase[]) {
  const isEscalation = (r: Route) => r === "human" || r === "complaint" || r === "hardship";
  let correct = 0, tp = 0, fp = 0, fn = 0, piiCorrect = 0, piiCases = 0;
  const errors: { text: string; expected: Route; got: Route }[] = [];
  for (const c of cases) {
    const result = checkInput(c.text);
    if (result.route === c.route) correct++;
    else errors.push({ text: c.text, expected: c.route, got: result.route });
    if (isEscalation(c.route) && isEscalation(result.route)) tp++;
    if (!isEscalation(c.route) && isEscalation(result.route)) fp++;
    if (isEscalation(c.route) && !isEscalation(result.route)) fn++;
    if (c.pii) {
      piiCases++;
      const got = result.redactions.map((r) => r.kind).sort().join(",");
      if (got === [...c.pii].sort().join(",")) piiCorrect++;
      else errors.push({ text: c.text, expected: `pii:${c.pii.join(",") || "none"}` as Route, got: `pii:${got || "none"}` as Route });
    }
  }
  return {
    cases: cases.length,
    routeAccuracy: correct / cases.length,
    escalationPrecision: tp / Math.max(1, tp + fp),
    escalationRecall: tp / Math.max(1, tp + fn),
    piiAccuracy: piiCases ? piiCorrect / piiCases : null,
    errors,
  };
}

async function main() {
  const root = process.cwd();
  const retrieval = JSON.parse(await readFile(path.join(root, "evals", "retrieval.json"), "utf8")).cases as RetrievalCase[];
  const routing = JSON.parse(await readFile(path.join(root, "evals", "routing.json"), "utf8")).cases as RoutingCase[];

  if (process.argv.includes("--sweep")) {
    for (const bm25 of [0, 0.3, 0.5, 0.6, 0.8, 1]) {
      const r = await evalRetrieval(retrieval, "hybrid", { dense: 1, bm25 });
      console.log(`bm25 weight ${bm25.toFixed(1)}: hit@1 ${pct(r.hitAt1)}  hit@3 ${pct(r.hitAt3)}  MRR ${r.mrr.toFixed(3)}`);
    }
    return;
  }

  const modes: SearchMode[] = ["dense", "bm25", "hybrid"];
  const results = [];
  for (const mode of modes) results.push(await evalRetrieval(retrieval, mode));

  console.log("\nRetrieval (" + results[0].questions + " answerable questions, " + retrieval.filter((c) => c.offTopic).length + " off-topic)");
  console.log("mode     hit@1    hit@3    hit@5    MRR     off-topic flagged");
  for (const r of results) {
    console.log(
      `${r.mode.padEnd(8)} ${pct(r.hitAt1).padEnd(8)} ${pct(r.hitAt3).padEnd(8)} ${pct(r.hitAt5).padEnd(8)} ${r.mrr.toFixed(3).padEnd(7)} ${r.offTopicFlaggedLow === null ? "-" : pct(r.offTopicFlaggedLow)}`,
    );
  }
  const hybrid = results.find((r) => r.mode === "hybrid")!;
  if (hybrid.misses.length) {
    console.log("\nHybrid misses (expected passage not in top 3):");
    for (const m of hybrid.misses) console.log(`  - "${m.q}"\n      expected ${m.expect.join(" | ")}\n      got      ${m.got.join(" | ")}`);
  }

  const routingResult = evalRouting(routing);
  console.log(`\nGuardrails (${routingResult.cases} messages)`);
  console.log(`  route accuracy        ${pct(routingResult.routeAccuracy)}`);
  console.log(`  escalation precision  ${pct(routingResult.escalationPrecision)}`);
  console.log(`  escalation recall     ${pct(routingResult.escalationRecall)}`);
  console.log(`  PII redaction         ${routingResult.piiAccuracy === null ? "-" : pct(routingResult.piiAccuracy)}`);
  for (const e of routingResult.errors) console.log(`  x "${e.text}" expected ${e.expected} got ${e.got}`);

  await writeFile(
    path.join(root, "evals", "results.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), retrieval: results, guardrails: routingResult }, null, 2) + "\n",
  );
  console.log("\nWrote evals/results.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

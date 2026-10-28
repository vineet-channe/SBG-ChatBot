/**
 * Downloads the sentence-embedding model used for retrieval (all-MiniLM-L6-v2, ONNX)
 * and lays it out the way Transformers.js expects:
 *
 *   models/all-MiniLM-L6-v2/
 *     config.json, tokenizer.json, tokenizer_config.json, special_tokens_map.json
 *     onnx/model.onnx
 *
 * Source: the public mirror Chroma uses for its default embedding function.
 * The archive is verified against a pinned SHA-256 before anything is extracted.
 *
 * Usage: npm run setup
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extract } from "tar";

const MODEL_NAME = "all-MiniLM-L6-v2";
const ARCHIVE_URL = "https://chroma-onnx-models.s3.amazonaws.com/all-MiniLM-L6-v2/onnx.tar.gz";
const ARCHIVE_SHA256 = "913d7300ceae3b2dbc2c50d1de4baacab4be7b9380491c27fab7418616a16ec3";
const TOKENIZER_FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"];

const modelDir = path.join(process.cwd(), "models", MODEL_NAME);

async function main() {
  if (existsSync(path.join(modelDir, "onnx", "model.onnx"))) {
    console.log(`Model already present at ${path.relative(process.cwd(), modelDir)} - nothing to do.`);
    return;
  }

  console.log(`Downloading ${MODEL_NAME} (~83 MB)...`);
  const res = await fetch(ARCHIVE_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const archive = Buffer.from(await res.arrayBuffer());

  const digest = createHash("sha256").update(archive).digest("hex");
  if (digest !== ARCHIVE_SHA256) {
    throw new Error(`Checksum mismatch: expected ${ARCHIVE_SHA256}, got ${digest}. Refusing to install.`);
  }
  console.log("Checksum verified.");

  const work = await mkdtemp(path.join(tmpdir(), "sterling-model-"));
  try {
    const archivePath = path.join(work, "onnx.tar.gz");
    await writeFile(archivePath, archive);
    await extract({ file: archivePath, cwd: work });

    const extracted = path.join(work, "onnx");
    await mkdir(path.join(modelDir, "onnx"), { recursive: true });
    for (const file of TOKENIZER_FILES) {
      await copyFile(path.join(extracted, file), path.join(modelDir, file));
    }
    // copy rather than rename: the temp dir may live on a different filesystem
    await copyFile(path.join(extracted, "model.onnx"), path.join(modelDir, "onnx", "model.onnx"));

    // Sanity check: the config must describe a BERT encoder with 384-dim hidden states.
    const config = JSON.parse(await readFile(path.join(modelDir, "config.json"), "utf8"));
    if (config.hidden_size !== 384) throw new Error(`Unexpected hidden_size ${config.hidden_size}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }

  console.log(`Installed to ${path.relative(process.cwd(), modelDir)}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

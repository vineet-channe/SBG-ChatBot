import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't generate an AGENTS.md file in the repo.
  agentRules: false,
  // Keep the dev-mode badge out of demo recordings.
  devIndicators: false,
  // Native ONNX Runtime bindings (used for local embeddings) must be loaded by Node at
  // runtime rather than bundled.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  // The knowledge index and model files are read from disk at runtime.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/kb-index.json", "./models/**/*"],
    "/api/health": ["./data/kb-index.json"],
  },
};

export default nextConfig;

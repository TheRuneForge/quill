import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./docs-site.mjs", import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "quill-docs-site-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "zensical.toml"), 'repo_url = "https://github.com/TheRuneForge/quill"\n');
  writeFileSync(join(root, "README.md"), "# Home\n");
  writeFileSync(join(root, "docs", "architecture.md"), "# Architecture\n");
  return root;
}

function run(root, args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
}

test("docs site renders to its dedicated output directory", (t) => {
  const root = fixture(t);
  const result = run(root, []);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(root, "site-docs", "index.md"), "utf8"), "# Home\n");
  assert.equal(readFileSync(join(root, "site-docs", "architecture.md"), "utf8"), "# Architecture\n");
});

test("wiki output cannot traverse outside the working directory", (t) => {
  const root = fixture(t);
  const outside = join(dirname(root), `${basename(root)}-outside`);
  mkdirSync(outside, { recursive: true });
  const sentinel = join(outside, "keep.txt");
  writeFileSync(sentinel, "keep");
  t.after(() => rmSync(outside, { recursive: true, force: true }));

  const result = run(root, ["--wiki", `../${basename(root)}-outside`]);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(sentinel, "utf8"), "keep");
});

test("CSP scan cannot traverse outside the working directory", (t) => {
  const root = fixture(t);
  const result = run(root, ["--csp-hashes", "../"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scan directory/);
});

test("output cannot follow a symbolic link", (t) => {
  const root = fixture(t);
  const outside = join(dirname(root), `${basename(root)}-linked`);
  mkdirSync(outside, { recursive: true });
  const sentinel = join(outside, "keep.txt");
  writeFileSync(sentinel, "keep");
  symlinkSync(outside, join(root, "linked-output"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));

  const result = run(root, ["--wiki", "linked-output"]);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(sentinel, "utf8"), "keep");
});

test("wiki output cannot replace a protected source directory", (t) => {
  const root = fixture(t);
  const sourcePage = join(root, "docs", "architecture.md");
  const result = run(root, ["--wiki", "docs"]);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(sourcePage, "utf8"), "# Architecture\n");
});

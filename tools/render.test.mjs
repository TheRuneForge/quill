import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sourceScript = fileURLToPath(new URL("./render.mjs", import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "quill-render-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "tools"), { recursive: true });
  copyFileSync(sourceScript, join(root, "tools", "render.mjs"));
  writeFileSync(join(root, "cloudflare.example.env"), "TOKEN=\n");
  writeFileSync(join(root, "site.txt"), "token=__TOKEN__\n");
  const prefix = basename(root);
  const values = join(dirname(root), `${prefix}-values.env`);
  const secret = join(dirname(root), `${prefix}-secret.txt`);
  const output = join(dirname(root), `${prefix}-output`);
  t.after(() => {
    rmSync(values, { force: true });
    rmSync(secret, { force: true });
    rmSync(output, { recursive: true, force: true });
  });
  writeFileSync(secret, "secret-value\n");
  return { root, values, secret, output };
}

function run(root, values, output) {
  return spawnSync(process.execPath, [join(root, "tools", "render.mjs"), values, output], {
    cwd: root,
    encoding: "utf8",
  });
}

test("render reads an explicitly referenced values file inside an approved root", (t) => {
  const { root, values, secret, output } = fixture(t);
  writeFileSync(values, `TOKEN=@${secret}\n`);
  const result = run(root, values, output);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(output, "site.txt"), "utf8"), "token=secret-value\n");
});

test("render rejects a referenced file outside approved roots before replacing output", (t) => {
  const { root, values, output } = fixture(t);
  writeFileSync(values, "TOKEN=@../../etc/passwd\n");
  mkdirSync(output, { recursive: true });
  const sentinel = join(output, "keep.txt");
  writeFileSync(sentinel, "keep");

  const result = run(root, values, output);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(sentinel, "utf8"), "keep");
});

test("render rejects a values file outside approved roots", (t) => {
  const { root, output } = fixture(t);
  const result = run(root, "/etc/passwd", output);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(output), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertSourceMatch } from "./compact-source.ts";

const source = await readFile(new URL("../public/send-ux-polish.js", import.meta.url), "utf8");

test("send UX polish script parses", () => {
  // codeql[js/code-injection] -- source is a checked-in application asset parsed without executing user-supplied input.
  assert.doesNotThrow(() => new Function(source));
});

test("notices have readable auto-dismiss durations", () => {
  assertSourceMatch(source, /info:8000/);
  assertSourceMatch(source, /success:8000/);
  assertSourceMatch(source, /warning:12000/);
  assertSourceMatch(source, /error:12000/);
  assertSourceMatch(source, /setTimeout\(clearStoredNotice,remaining\)/);
});

test("compose and review explain signature handling", () => {
  assertSourceMatch(source, /Mail-appens vanliga signatur läggs inte till automatiskt vid utskick/);
  assertSourceMatch(source, /Ingen extra signatur från Mail-appen läggs till/);
  assertSourceMatch(source, /dataset\.signatureNote=kind/);
});

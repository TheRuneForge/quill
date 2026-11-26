// node:test reporter that writes each test run's JUnit report to its own file
// in NODE_TEST_JUNIT_DIR, so CI can upload the results to Mergify Test Engine.
// CI loads it through NODE_OPTIONS next to the spec reporter.
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { junit } from "node:test/reporters";

export default async function* junitPerRun(source) {
  const dir = process.env.NODE_TEST_JUNIT_DIR;
  if (!dir) throw new Error("NODE_TEST_JUNIT_DIR is not set");
  mkdirSync(dir, { recursive: true });
  await pipeline(source, junit, createWriteStream(join(dir, `junit-${process.pid}.xml`)));
}

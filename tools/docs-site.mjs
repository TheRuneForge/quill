#!/usr/bin/env node
// Assembles the documentation from README.md, docker/README.md and docs/:
//
//   node tools/docs-site.mjs && zensical build    # the site, in site-docs/
//   node tools/docs-site.mjs --wiki <dir>         # the GitHub wiki, in <dir>
//   node tools/docs-site.mjs --csp-hashes <dir>   # CSP hashes of the built site
//
// README.md becomes the start page and docker/README.md the Docker page; docs/
// is included as it is, except docs/agents/, which is written for coding agents.
// docs/eng/ is the English mirror: eng/index.md mirrors README.md, eng/docker.md
// mirrors docker/README.md and the other pages keep the Swedish file names.
// Links between those files are rewritten to the pages they become, and links
// to anything else in the repo point to the file on GitHub, so every link works
// on the site and in the wiki. The repo address is repo_url in zensical.toml,
// and the page titles and their order come from nav there. The README line that
// links to the site itself ("**Dokumentation:** ...") is left out.
//
// The wiki is a one-way mirror: its pages are flat (Home, Docker and one page
// per nav title), with _Sidebar.md for the menu and _Footer.md saying where to
// make changes. .github/workflows/wiki.yml writes it on every push to main.
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";


const isWithin = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

const assertWithin = (path, root, label, allowRoot = false) => {
  const rel = relative(root, path);
  if ((rel === "" && !allowRoot) || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} must be within the current working directory`);
  }
};

const findExistingAncestor = (absolute, root, label, allowRoot = false) => {
  assertWithin(absolute, root, label, allowRoot);
  let existing = absolute;
  const missing = [];
  while (true) {
    try {
      return { canonicalExisting: realpathSync.native(existing), missing };
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      missing.unshift(basename(existing));
      existing = parent;
    }
  }
};

const resolveWithin = (root, candidate, label, allowRoot = false) => {
  if (candidate.split(/[\\/]/).includes("..")) {
    throw new Error(`${label} must not contain parent-directory segments`);
  }
  const absolute = resolve(root, candidate);
  assertWithin(absolute, root, label, allowRoot);
  let current = root;
  for (const component of relative(root, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, component);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(`${label} must not traverse symbolic links`);
      }
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      break;
    }
  }
  const { canonicalExisting, missing } = findExistingAncestor(absolute, root, label, allowRoot);
  const canonicalRoot = realpathSync.native(root);
  const canonical = resolve(canonicalExisting, ...missing);
  assertWithin(canonical, canonicalRoot, label, allowRoot);
  if (relative(absolute, canonical) !== "") {
    throw new Error(`${label} must not traverse symbolic links`);
  }
  return canonical;
};

// --csp-hashes: print the CSP sources ('sha256-...') that allow the inline
// scripts in the built HTML under <dir>, for a Content-Security-Policy that
// does not allow inline scripts in general.
// codeql[js/user-controlled-bypass] -- This argument selects a documented read-only CLI mode; it does not bypass a security check.
if (process.argv[2] === "--csp-hashes") {
  const root = realpathSync.native(process.cwd());
  const scanArg = process.argv[3];
  if (!scanArg?.trim()) throw new Error("scan directory is required");
  const scanRoot = resolveWithin(root, scanArg, "scan directory", true);
  const hashes = new Set();
  const scan = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // codeql[js/path-injection] -- dir is the validated scan root or a child returned by readdirSync.
      const path = posix.join(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (entry.isFile() && path.endsWith(".html")) {
        for (const [, code] of readFileSync(path, "utf8").matchAll(
          /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g,
        )) {
          if (code) hashes.add(`'sha256-${createHash("sha256").update(code).digest("base64")}'`);
        }
      }
    }
  };
  scan(scanRoot);
  console.log([...hashes].sort().join(" "));
  process.exit(0);
}

const wiki = process.argv[2] === "--wiki";
const outArg = wiki ? process.argv[3] : "site-docs";
if (!outArg?.trim()) throw new Error("usage: node tools/docs-site.mjs [--wiki <dir>]");
if (outArg.includes("\0")) throw new Error("output directory contains an invalid null byte");
const root = realpathSync.native(process.cwd());
const out = resolveWithin(root, outArg, "output directory");
if (existsSync(out) && !statSync(out).isDirectory()) {
  throw new Error("output path must be a directory");
}
const protectedRoots = [
  ".git", ".github", "app", "kontakter", "docker", "docs", "migrations",
  "node_modules", "scripts", "tools",
].flatMap((name) => {
  const absolute = resolve(root, name);
  return existsSync(absolute) ? [absolute, realpathSync.native(absolute)] : [absolute];
});
if (protectedRoots.some((path) => out === path || isWithin(out, path) || isWithin(path, out))) {
  throw new Error("output directory must not overlap source directories");
}
const config = readFileSync("zensical.toml", "utf8");
const repoUrl = config.match(/^repo_url\s*=\s*"([^"]+)"/m)?.[1];
if (!repoUrl) throw new Error("repo_url is missing in zensical.toml");

// Site path -> title, from nav entries like { "Arkitektur" = "architecture.md" }.
const titles = new Map(
  [...config.matchAll(/\{\s*"([^"]+)"\s*=\s*"([^"]+\.md)"\s*\}/g)].map(([, t, f]) => [f, t]),
);
titles.set("index.md", "Home");

// Repo path -> path on the site.
const pages = new Map();
for (const [src, dst] of [
  ["README.md", "index.md"],
  ["docker/README.md", "docker.md"],
]) {
  if (existsSync(src)) pages.set(src, dst);
}
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // codeql[js/path-injection] -- dir is the checked-in docs tree; symlinks and non-files are skipped.
    const path = posix.join(dir, entry.name);
    if (path === "docs/agents" || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) pages.set(path, path.slice("docs/".length));
  }
};
if (existsSync("docs")) walk("docs");

// Wiki page names are flat: the nav title with spaces as hyphens. The English
// mirror in docs/eng/ gets an "English-" prefix so its pages never collide with
// the Swedish ones (both have a Home and a Docker page, for example).
const wikiName = (page) =>
  (page.startsWith("eng/") ? "English-" : "") +
  (titles.get(page) ?? posix.basename(page, ".md")).replace(/[\s/]+/g, "-");
const onWiki = (page) => page.endsWith(".md");

const link = (src, dst, target) => {
  if (/^([a-z]+:|#|\/)/i.test(target)) return target;
  const [path, anchor] = target.split("#", 2);
  const suffix = anchor === undefined ? "" : `#${anchor}`;
  const resolved = posix.normalize(posix.join(posix.dirname(src), path)).replace(/\/$/, "");
  const page = pages.get(resolved);
  if (page && !wiki) return posix.relative(posix.dirname(dst), page) + suffix;
  if (page && onWiki(page)) return wikiName(page) + suffix;
  return `${repoUrl}/blob/main/${resolved}${suffix}`;
};

const rewrite = (src, dst, text) => {
  let fenced = false;
  return text
    .split("\n")
    .filter((line) => !(src === "README.md" && line.startsWith("**Dokumentation:**")))
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      return line.replace(
        /(\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g,
        (_, open, target, close) => open + link(src, dst, target) + close,
      );
    })
    .join("\n");
};

// codeql[js/path-injection] -- out has been canonicalized and confined to the repo root above.
rmSync(out, { recursive: true, force: true });
// codeql[js/path-injection] -- out has been canonicalized and confined to the repo root above.
mkdirSync(out, { recursive: true });
let count = 0;
for (const [src, dst] of pages) {
  if (wiki && !onWiki(dst)) continue;
  // codeql[js/path-injection] -- out is validated; dst is derived from the checked-in docs tree.
  const target = posix.join(out, wiki ? `${wikiName(dst)}.md` : dst);
  // codeql[js/path-injection] -- target is beneath the validated output directory.
  mkdirSync(posix.dirname(target), { recursive: true });
  if (src.endsWith(".md")) {
    // codeql[js/path-injection] -- target is beneath the validated output directory.
    writeFileSync(target, rewrite(src, dst, readFileSync(src, "utf8")));
  } else {
    // codeql[js/path-injection] -- target is beneath the validated output directory.
    cpSync(src, target);
  }
  count++;
}
if (wiki) {
  const menu = [...titles.keys()]
    .filter((page) => [...pages.values()].includes(page))
    .map((page) => {
      const title = page === "index.md" ? "Start" : titles.get(page);
      return `- [${page.startsWith("eng/") ? `English: ${title}` : title}](${wikiName(page)})`;
    });
  // codeql[js/path-injection] -- out is the validated output directory.
  writeFileSync(
    posix.join(out, "_Sidebar.md"),
    [...menu, `- [Källkod på GitHub](${repoUrl}#readme)`, ""].join("\n"),
  );
  // codeql[js/path-injection] -- out is the validated output directory.
  writeFileSync(
    posix.join(out, "_Footer.md"),
    `Wikin speglas automatiskt från [repot](${repoUrl}) (\`README.md\`, \`docker/README.md\` och \`docs/\`) vid varje merge till \`main\`. Ändra där; ändringar här skrivs över.\n`,
  );
}
console.log(`${out}/: ${count} pages`);

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const decoder = new TextDecoder("utf-8", { fatal: true });
const sourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx|css)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
};

const files = [
  "index.html",
  "supabase/staging/seed.sql",
  ...await sourceFiles("src"),
  ...await sourceFiles("supabase/functions/_shared"),
  ...await sourceFiles("supabase/functions/generate-report"),
];
for (const file of files) {
  const content = decoder.decode(await readFile(file));
  if (/\uFFFD|Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]/u.test(content)) {
    throw new Error(`Possible broken UTF-8 text in ${file}`);
  }
}

const html = decoder.decode(await readFile("index.html"));
if (!/<meta\s+charset=["']utf-8["']/i.test(html)) throw new Error("index.html must declare UTF-8");

const seed = decoder.decode(await readFile("supabase/staging/seed.sql"));
for (const sample of ["Fictício", "Homologação", "Município", "Organização"]) {
  if (!seed.includes(sample)) throw new Error(`Missing accented validation sample: ${sample}`);
}

process.stdout.write(`UTF-8 source check passed (${files.length} files and four accented samples).\n`);

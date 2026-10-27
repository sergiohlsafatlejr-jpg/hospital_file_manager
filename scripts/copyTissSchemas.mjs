import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../server/tiss/schemas", import.meta.url));
const destination = fileURLToPath(new URL("../dist/tiss/schemas", import.meta.url));

await rm(destination, { recursive: true, force: true });
await mkdir(fileURLToPath(new URL("../dist/tiss", import.meta.url)), { recursive: true });
await cp(source, destination, { recursive: true });

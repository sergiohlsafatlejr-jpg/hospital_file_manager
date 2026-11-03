# Extra runtime binaries required by the file-backed PDF contract reader.
# util-linux supplies prlimit; no Chromium/OCR engine is activated here.
FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils util-linux python3 python3-pandas python3-openpyxl \
    && test -x /usr/bin/pdfinfo \
    && test -x /usr/bin/pdftotext \
    && test -x /usr/bin/prlimit \
    && python3 -c "import pandas, openpyxl" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm install -g corepack@latest \
    && corepack pnpm install --frozen-lockfile \
    && corepack pnpm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

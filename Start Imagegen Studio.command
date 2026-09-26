#!/bin/zsh -l
set -e
cd -- "${0:A:h}"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print 'Install Node.js 22.12 or newer, then open this launcher again.'
  read '?Press Enter to close.'
  exit 1
fi
studio_url="http://127.0.0.1:${PORT:-4310}"
if curl --silent --fail --max-time 2 "$studio_url/api/health" >/dev/null 2>&1; then
  open "$studio_url"
  exit 0
fi
if [[ ! -d node_modules ]]; then npm ci; fi
if [[ ! -f dist/index.html ]]; then npm run build; fi
STUDIO_OPEN=1 npm start

// -----------------------------------------------------------------------------
// The phone id this installation registers with the cloud, like a vendor app
// installed once: generated at the first start, kept in /data (the only
// writable place of the container). When /data cannot be written, a new id is
// used for this run only.
// -----------------------------------------------------------------------------

import { randomUUID as nodeRandomUUID } from 'node:crypto';
import { promises as nodeFs } from 'node:fs';
import { join } from 'node:path';

const FILE = 'agua-iot.json';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadAppId({
  dir = '/data',
  fs = nodeFs,
  randomUUID = nodeRandomUUID,
  logger,
} = {}) {
  const path = join(dir, FILE);
  try {
    const saved = JSON.parse(await fs.readFile(path, 'utf8'));
    if (UUID.test(saved?.app_id ?? '')) {
      return saved.app_id;
    }
  } catch {
    // First start, or an unreadable file: a new id is generated.
  }
  const appId = randomUUID();
  try {
    await fs.writeFile(path, `${JSON.stringify({ app_id: appId })}\n`, 'utf8');
  } catch (err) {
    logger?.warn?.(`Cannot keep the app id in ${dir} (${err.code ?? err.message})`);
  }
  return appId;
}

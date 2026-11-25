import { createApp } from './src/app.js';
import { ensureSeeded } from './src/content.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

await ensureSeeded();
const app = createApp();
app.listen(port, host, () => {
  console.log(`St. Mary of the Assumption website running at http://${host}:${port}`);
});

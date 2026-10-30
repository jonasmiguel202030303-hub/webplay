import { query } from './backend/src/config/db.js';
const rows = await query('SELECT id, tenant_id, name, base_url FROM source_servers WHERE deleted_at IS NULL');
console.log(rows);
process.exit(0);

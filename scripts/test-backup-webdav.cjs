/**
 * Test WebDAV connection using .env settings.
 */
const {
  loadEnvFromRoot,
  getWebdavConfig,
  testWebdavConnection,
} = require("./db-backup-mirror.cjs");

loadEnvFromRoot();
const config = getWebdavConfig();
if (!config) {
  console.error("DB_BACKUP_WEBDAV_URL, DB_BACKUP_WEBDAV_USER, and DB_BACKUP_WEBDAV_PASS are required.");
  process.exit(2);
}

testWebdavConnection(config)
  .then(() => {
    console.log(`WebDAV OK: ${config.baseUrl}`);
    console.log(`User: ${config.user}`);
  })
  .catch((error) => {
    console.error("WebDAV failed:", error.message || error);
    process.exit(1);
  });

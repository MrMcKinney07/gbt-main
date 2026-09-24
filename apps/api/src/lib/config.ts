import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var ${name}`);
  }
  return v;
}

export const config = {
  databaseUrl: required("DATABASE_URL", "postgres://gbt_app:gbt_app_dev_only@localhost:5432/gbt"),
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",

  jwtAccessSecret: required("JWT_ACCESS_SECRET", "dev-access-secret-change-me"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me"),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? "7d",

  watchdog: {
    pollIntervalSeconds: Number(process.env.WATCHDOG_POLL_INTERVAL_SECONDS ?? 10),
    idleWarningSeconds: Number(process.env.WATCHDOG_IDLE_WARNING_SECONDS ?? 60),
    wellnessCheckDelaySeconds: Number(process.env.WATCHDOG_WELLNESS_CHECK_DELAY_SECONDS ?? 30),
    escalationDelaySeconds: Number(process.env.WATCHDOG_ESCALATION_DELAY_SECONDS ?? 60),
    movementRadiusThresholdM: Number(process.env.WATCHDOG_MOVEMENT_RADIUS_THRESHOLD_M ?? 40),
  },

  photoStorageDir: process.env.PHOTO_STORAGE_DIR ?? ".data/photos",
};

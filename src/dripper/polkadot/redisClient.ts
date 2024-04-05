import { createClient, RedisClientType } from "redis";

import { logger } from "../../logger";

let client: RedisClientType;

export default function getClient() {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  if (!client) {
    client = createClient();
    client.on("error", (err: any) => logger.error("Redis Client Error", err));
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return client;
}

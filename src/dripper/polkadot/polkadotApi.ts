import "@polkadot/api-augment";
import { ApiPromise, initialize } from "avail-js-sdk";

import { logger } from "../../logger";

let apiInstance: ApiPromise | null = null;
const Endpoint = process.env.WS_URL || "wss://rpc-goldberg.sandbox.avail.tools";
export const getApiInstance = async () => {
  if (apiInstance) {
    if (apiInstance.isConnected) {
      logger.info("Existing API instance is connected");
      return apiInstance;
    } else {
      logger.info("API instance is not connected");
      apiInstance = await initialize(Endpoint);
      return apiInstance;
    }
  } else {
    logger.info("Initializing new API instance");
    apiInstance = await initialize(Endpoint);
    return apiInstance;
  }
};
export const AvailApi = async () => await initialize(Endpoint);
export const disApi = async (api: ApiPromise) => {
  if (api.isConnected) {
    logger.info("Disconnecting new API instance");
    await api.disconnect();
  }
};

export default AvailApi;

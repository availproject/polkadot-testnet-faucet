import "@polkadot/api-augment";
import { ApiPromise, initialize } from "avail-js-sdk";

let apiInstance: ApiPromise | null = null;
const Endpoint = process.env.WS_URL || "wss://rpc-goldberg.sandbox.avail.tools";
export const getApiInstance = async () => {
  if (apiInstance) {
    if (apiInstance.isConnected) {
      console.log("Existing API instance is connected");
      return apiInstance;
    } else {
      console.log("API instance is not connected");
      apiInstance = await initialize(Endpoint);
      return apiInstance;
    }
  } else {
    console.log("Initializing new API instance");
    apiInstance = await initialize(Endpoint);
    return apiInstance;
  }
};
export const AvailApi = async () => await initialize(Endpoint);
export const disApi = async (api: ApiPromise) => {
  if (api.isConnected) {
    console.log("Disconnecting new API instance");
    await api.disconnect();
  }
};

export default AvailApi;

import "@polkadot/api-augment";
import { Keyring } from "@polkadot/keyring";
import { KeyringPair } from "@polkadot/keyring/types";
import { waitReady } from "@polkadot/wasm-crypto";
import BN from "bn.js";

import { config } from "../../config";
import { isDripSuccessResponse } from "../../guards";
import { logger } from "../../logger";
import { getNetworkData } from "../../networkData";
import { DripResponse } from "../../types";
import { getApiInstance } from "./polkadotApi";
import getClient from "./redisClient";
import { formatAmount } from "./utils";

const mnemonic = config.Get("FAUCET_ACCOUNT_MNEMONIC");
const backup_mnemonic = config.Get("FAUCET_BACKUP_ACCOUNT_MNEMONIC");
const balancePollIntervalMs = 60000; // 1 minute

const networkName = config.Get("NETWORK");
const networkData = getNetworkData(networkName);
// const client = createClient();

// client.on("error", (err) => console.log("Redis Client Error", err));
const client = getClient();

const rpcTimeout = (service: string) => {
  const timeout = 50000;
  return setTimeout(() => {
    // log an error in console and in prometheus if the timeout is reached
    logger.error(`⭕ Oops, ${service} took more than ${timeout}ms to answer`);
  }, timeout);
};

export class PolkadotActions {
  account: KeyringPair | undefined;
  backup_account: KeyringPair | undefined;
  #faucetBalance: bigint | undefined;
  isReady: Promise<void>;

  constructor() {
    logger.info("🚰 Plip plop - Creating the faucets's account");
    let makeReady: () => void;

    this.isReady = new Promise((resolve) => {
      makeReady = resolve;
    });

    try {
      const keyring = new Keyring({ type: "sr25519" });

      waitReady().then(() => {
        this.account = keyring.addFromMnemonic(mnemonic);
        this.backup_account = keyring.addFromMnemonic(backup_mnemonic);

        // We do want the following to just start and run
        // TODO: Adding a subscription would be better but the server supports on http for now
        const updateFaucetBalance = (log = false) =>
          this.updateFaucetBalance().then(() => {
            if (log) logger.info("Fetched faucet balance 💰");
            setTimeout(updateFaucetBalance, balancePollIntervalMs);
          });
        updateFaucetBalance(true).then(makeReady);
      });
    } catch (error) {
      logger.error(error);
    }
  }

  /**
   * This function checks the current balance and updates the `faucetBalance` property.
   */
  private async updateFaucetBalance() {
    if (!this.account?.address) {
      logger.warn("Account address wasn't initialized yet");
      return;
    }

    try {
      const polkadotApi = await getApiInstance();
      await polkadotApi.isReady;
      const { data: balance } = await polkadotApi.query.system.account(this.account.address);
      this.#faucetBalance = balance.free.toBigInt();
    } catch (e) {
      logger.error(e);
    }
  }

  public getFaucetBalance(): bigint | undefined {
    return this.#faucetBalance;
  }

  public async getAccountBalance(address: string): Promise<number> {
    const polkadotApi = await getApiInstance();
    await polkadotApi.isReady;
    const { data } = await polkadotApi.query.system.account(address);

    const { free: balanceFree } = data;
    return balanceFree
      .toBn()
      .div(new BN(10).pow(new BN(networkData.decimals)))
      .toNumber();
  }

  public async isAccountOverBalanceCap(address: string): Promise<boolean> {
    return (await this.getAccountBalance(address)) > networkData.balanceCap;
  }

  async sendTokens(address: string, amount: bigint): Promise<DripResponse> {
    await client.connect();
    let dripTimeout: ReturnType<typeof rpcTimeout> | null = null;
    let result: DripResponse;
    const faucetBalance = this.getFaucetBalance();

    try {
      if (!this.account) throw new Error("account not ready");

      if (typeof faucetBalance !== "undefined" && amount >= faucetBalance) {
        const formattedAmount = formatAmount(amount);
        const formattedBalance = formatAmount(faucetBalance);

        throw new Error(
          `Can't send ${formattedAmount} ${networkData.currency}s, as balance is only ${formattedBalance} ${networkData.currency}s.`,
        );
      }

      // start a counter and log a timeout error if we didn't get an answer in time
      dripTimeout = rpcTimeout("drip");
      logger.info("💸 sending tokens");
      const polkadotApi = await getApiInstance();
      const options = { app_id: 0, nonce: -1 };
      await polkadotApi.isReady;
      const transfer = polkadotApi.tx.balances.transferKeepAlive(address, amount);
      let res: string = "";
      // eslint-disable-next-line unused-imports/no-unused-vars-ts
      try {
        const hash = await transfer.signAndSend(this.account, options);
        res = hash.toHex();
      } catch (e) {
        try {
          logger.warn("❕❕ First try failed, retrying with backup", e);
          if (this.backup_account) {
            const api = await getApiInstance();
            await api.isReady;
            try {
              const tx = api.tx.balances.transferKeepAlive(address, amount);
              const hash = await tx.signAndSend(this.backup_account, options);
              res = hash.toHex();
            } catch (err) {
              logger.error("⭕ Backup Failed, incrementing nonce", err);
              try {
                const nonce = await api.query.system.accountNextIndex(this.backup_account);
                const tx = api.tx.balances.transferKeepAlive(address, amount);
                const opt = { app_id: 0, nonce: nonce };
                const hash = await tx.signAndSend(this.backup_account, opt);
                res = hash.toHex();
              } catch (error) {
                logger.error("⭕ An error occured when second try tokens, sending it to batch", error);
                try {
                  const acc = this.account;
                  client.SADD("TransactionQueue", JSON.stringify(address));
                  const key = "TransactionQueue";
                  const len = await client.SCARD("TransactionQueue");
                  const vec = [];
                  if (len > 20) {
                    const transactions = await client.SRANDMEMBER_COUNT(key, 20);
                    for (const addr of transactions) {
                      const add = JSON.parse(addr);
                      const tf = api.tx.balances.transferKeepAlive(add, amount);
                      vec.push(tf);
                      await client.SREM(key, addr);
                    }
                    const hash = await api.tx.utility.batch(vec).signAndSend(acc, options);
                    res = hash.toHex();
                  }
                } catch (c) {
                  logger.error("⭕ An error occured when sending tokens", c);
                }
              }
            }
          }
        } catch {
          logger.error("⭕ Token transfer Failed 🙁", e);
        }
      }
      client.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 20000));
      result = { hash: res };
    } catch (e) {
      result = { error: (e as Error).message || "An error occured when sending tokens" };
      logger.error("⭕ An error occured when sending tokens", e);
    }

    // we got and answer reset the timeout
    if (dripTimeout) clearTimeout(dripTimeout);

    if (isDripSuccessResponse(result)) {
      await this.updateFaucetBalance().then(() => logger.info("Refreshed the faucet balance 💰"));
    }

    return result;
  }

  async getBalance(): Promise<string> {
    try {
      if (!this.account) {
        throw new Error("account not ready");
      }

      logger.info("💰 checking faucet balance");

      // start a counter and log a timeout error if we didn't get an answer in time
      const balanceTimeout = rpcTimeout("balance");
      const polkadotApi = await getApiInstance();
      await polkadotApi.isReady;
      const { data: balances } = await polkadotApi.query.system.account(this.account.address);

      // we got and answer reset the timeout
      clearTimeout(balanceTimeout);
      return balances.free.toString();
    } catch (e) {
      logger.error("⭕ An error occured when querying the balance", e);
      return "0";
    }
  }
}

export default new PolkadotActions();

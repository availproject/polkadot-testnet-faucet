import { isDripSuccessResponse } from "src/guards";
import { logger } from "src/logger";
import { counters } from "src/metrics";
import { DripRequestType, DripResponse } from "src/types";

import { hasDrippedToday, saveDrip } from "./dripperStorage";
import type { PolkadotActions } from "./polkadot/PolkadotActions";
import { Recaptcha } from "./Recaptcha";

export class DripRequestHandler {
  constructor(
    private actions: PolkadotActions,
    private recaptcha: Recaptcha,
  ) {}

  async handleRequest(
    opts:
      | ({ external: true; recaptcha: string } & Omit<DripRequestType, "sender">)
      | ({ external: false; sender: string } & Omit<DripRequestType, "recaptcha">),
  ): Promise<DripResponse> {
    const { external, address: addr, amount } = opts;
    counters.totalRequests.inc();

    if (external && !(await this.recaptcha.validate(opts.recaptcha)))
      return { error: "Captcha validation was unsuccessful" };
    const isAllowed = !(await hasDrippedToday(external ? { addr } : { username: opts.sender, addr }));
    const isAccountOverBalanceCap = await this.actions.isAccountOverBalanceCap(addr);

    if (!isAllowed) {
      return { error: `Requester has reached their daily quota. Only request once per day.` };
    } else if (isAllowed && isAccountOverBalanceCap) {
      return { error: `Requester's balance is over the faucet's balance cap` };
    } else {
      const sendTokensResult = await this.actions.sendTokens(addr, amount);

      // hash is null if something wrong happened
      if (isDripSuccessResponse(sendTokensResult)) {
        counters.successfulRequests.inc();
        saveDrip(external ? { addr } : { username: opts.sender, addr }).catch((e) => {
          logger.error(e);
        });
      }

      return sendTokensResult;
    }
  }
}

let instance: DripRequestHandler | undefined;
export const getDripRequestHandlerInstance = (polkadotActions: PolkadotActions) => {
  if (!instance) {
    const recaptchaService = new Recaptcha();
    instance = new DripRequestHandler(polkadotActions, recaptchaService);
  }
  return instance;
};

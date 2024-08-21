import { EthContext } from "@sentio/sdk/eth";
import { GlobalState } from "./schema/store.js";
import { storeGet, storeUpsert } from "./store_utils.js";
import { LTokenContext } from "./types/eth/ltoken.js";

const GLOBAL_STATE_ID = "latest";

export async function getGlobalState(ctx: LTokenContext) {
  return (
    (await storeGet(ctx, GlobalState, GLOBAL_STATE_ID)) ??
    new GlobalState({
      id: GLOBAL_STATE_ID,
      totalPositiveNetBalance: 0n,
      totalSupply: await ctx.contract.totalSupply(),
      totalBorrow: await ctx.contract.totalBorrow(),
    })
  );
}

export async function setGlobalState(ctx: EthContext, state: GlobalState) {
  state.id = GLOBAL_STATE_ID;
  return storeUpsert(ctx, state);
}

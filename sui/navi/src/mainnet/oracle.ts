import { SuiWrappedObjectProcessor } from "@sentio/sdk/sui";
import { ChainId } from "@sentio/chain";
import { BUILTIN_TYPES } from "@sentio/sdk/move";
import { oracle } from "../types/sui/0xca441b44943c16be0e6e23c5a955bb971537ea3289ae8016fbf33fffe1fd210f.js";
import { COIN } from "./utils.js";

const priceOracle =
  "0xc0601facd3b98d1e82905e660bf9f5998097dedcf86ed802cf485865e3e3667c";

export function OracleProcessor() {
  SuiWrappedObjectProcessor.bind({
    network: ChainId.SUI_MAINNET,
    objectId: priceOracle,
    startCheckpoint: 7800000n,
  }).onTimeInterval(
    async (objects, ctx) => {
      const decodedObjects = await ctx.coder.getDynamicFields(
        objects,
        BUILTIN_TYPES.U8_TYPE,
        oracle.Price.type()
      );

      decodedObjects.forEach((entry) => {
        const name = entry.name.toString();
        const priceObject = entry.value as any;
        const value = priceObject.value;
        const decimal = priceObject.decimal;
        const result = value.asBigDecimal().div(Math.pow(10, Number(decimal)));
        const coin_symbol = COIN[Number(name)];
        if (!coin_symbol) {
          coin_symbol == name;
        }
        try {
          ctx.meter
            .Gauge("oracle")
            .record(result, { id: name, name, coin_symbol });
        } catch (e) {
          console.log("Oracle Error: ", e, " Entry: ", entry);
        }
      });
    },
    10,
    10,
    "",
    { owned: true }
  );
}

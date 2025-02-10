import { SuiAddressProcessor } from "@sentio/sdk/sui";
import { ChainId } from "@sentio/chain";
import { COIN_MAP } from "./utils.js";

const addresses = [
  "0x497e20c4e0189d37aae771b9e60155941a35ec59485ce2b02e30a30a0b5e3ecb", // liquidation bot
  "0x4fddd999b437025d52ffd1046633f03db66c64c4524231ec8d0b2f8976f20062",
];

export function AddressProcessor() {
  for (let address of addresses) {
    SuiAddressProcessor.bind({
      address: address,
      network: ChainId.SUI_MAINNET,
      startCheckpoint: 7800000n,
      // startCheckpoint: 24814000n
    }).onTimeInterval(async (self, ctx) => {
      try {
        const result = await getBalance(address);
        const balances = result.result as BalanceBody[];

        for (let coin of Object.keys(COIN_MAP)) {
          const data = balances.find((balance) => {
            return balance.coinType == coin;
          });
          let totalBalance = "0";
          let coinObjectCount = 0;
          if (data) {
            totalBalance = data.totalBalance;
            coinObjectCount = data.coinObjectCount;
          }
          // const totalBalance = data ? data.totalBalance : "0";
          ctx.meter.Gauge("totalBalanceForAddress").record(totalBalance, {
            env: "mainnet",
            address,
            coin,
            coin_symbol: COIN_MAP[coin],
          });
          ctx.meter.Gauge("coinObjectCountForAddress").record(coinObjectCount, {
            env: "mainnet",
            address,
            coin,
            coin_symbol: COIN_MAP[coin],
          });
        }
      } catch (e) {
        console.log(e);
        console.log(JSON.stringify(self));
      }
    });
  }
}

interface BalanceBody {
  coinType: string;
  coinObjectCount: number;
  totalBalance: string;
  lockedBalance: {};
}

async function getBalance(address: string) {
  var myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");

  var raw = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "suix_getAllBalances",
    params: [address],
  });

  const response = await fetch("https://explorer-rpc.mainnet.sui.io", {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow",
  });
  return await response.json();
}

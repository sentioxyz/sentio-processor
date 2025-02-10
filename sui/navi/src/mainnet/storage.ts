import { BigDecimal } from "@sentio/sdk";
import { SuiObjectProcessor } from "@sentio/sdk/sui";
import { ChainId } from "@sentio/chain";
import { DECIMAL_RAY, COIN, DEFAULT_COIN_DECIMAL } from "./utils.js";

const reserves = [
  "0xab644b5fd11aa11e930d1c7bc903ef609a9feaf9ffe1b23532ad8441854fbfaf", // Reserve For SUI
  "0xeb3903f7748ace73429bd52a70fff278aac1725d3b58afa781f25ce3450ac203", // Reserve For USDC
  "0xb8c5eab02a0202f638958cc79a69a2d30055565caad1684b3c8bbca3bddcb322", // Reserve For USDT
  "0xafecf4b57899d377cc8c9de75854c68925d9f512d0c47150ca52a0d3a442b735", // Reserve For WETH
  "0x66a807c06212537fe46aa6719a00e4fa1e85a932d0b53ce7c4b1041983645133", // Reserve For CETUS
  "0xd4fd7e094af9819b06ea3136c13a6ae8da184016b78cf19773ac26d2095793e2", // Reserve For VoloSui
  "0x0c9f7a6ca561dc566bd75744bcc71a6af1dc3caf7bd32c099cd640bb5f3bb0e3", // Reserve For haSUI
  "0x2e13b2f1f714c0c5fa72264f147ef7632b48ec2501f810c07df3ccb59d6fdc81", // Reserve For NAVX
  "0x8b4d81f004e4e9faf4540951a896b6d96e42598a270e6375f598b99742db767e", // Reserve For WBTC
  "0x918889c6a9d9b93108531d4d59a4ebb9cc4d41689798ffc1d4aed6e1ae816ec0", // Reserve For AUSD
  "0x4c8a2c72a22ae8da803a8519798d312c86e74a9e0d6ec0eec2bfcf7e4b3fef5e", // Reserve For Native USDC
  "0x376faea6dfbffab9ea808474cb751d91222b6d664f38c0f1d23de442a8edb1ce", // Reserve For Native ETH
  "0xddeb55afe4860995d755fddb0b1dfb8f8011ca08edb66e43c867a21bd6e0551a", // Reserve For USDY
  "0x03f405f4d5ed2688b8b7ab4cfbf3e0a8572622a737d615db829342131f3586f2", // Reserve For NS
  "0x9634f9f7f8ea7236e2ad5bfbecdce9673c811a34cf8c3741edfbcaf5d9409100", // Reserve For stBTC
  "0x0b30fe8f42a4fda168c38d734e42a36a77b3d4dd6669069b1cbe53a0c3905ba8", // Reserve For Deep
  "0xf1737d6c6c1fffdf145c440a9fc676de0e6d0ffbacaab5fa002d30653f235a8e", // Reserve For FDUSD
  "0xcc993cdfc8fcf421115bb4b2c2247abbfecff35bcab777bb368b4b829d39b073", // Reserve For BLUE
  "0xe1182350b6756e664f824aa1448f5fc741ddc868168dbe09ed3a6e79b7bf249c", // Reserve For BUCK
  "0x2abb6f2b007fef1e59133b027f53eca568f3af79e310e6f16d4b37bc09664a50", // Reserve For nUSDT
  "0x9a91a751ff83ef1eb940066a60900d479cbd39c6eaccdd203632c97dedd10ce9", // Reserve For stSUi
  "0xb6a8441d447dd5b7cd45ef874728a700cd05366c331f9cc1e37a4665f0929c2b", // Reserve For suiBTC
];

export function ProtocolProcessor() {
  for (let i = 0; i < reserves.length; i++) {
    SuiObjectProcessor.bind({
      objectId: reserves[i],
      network: ChainId.SUI_MAINNET,
      startCheckpoint: 7800000n,
    }).onTimeInterval(
      async (self, _, ctx) => {
        try {
          const value = (self.fields as any).value.fields;

          const type = String(value.coin_type);
          const id = String(value.id);
          const ltv = BigDecimal(value.ltv).div(Math.pow(10, DECIMAL_RAY));
          const coin_symbol = COIN[i];

          if (coin_symbol == undefined) {
            console.log("Coin Symbol Mismatched, reserved ID", i);
          }

          const totalSupply = BigDecimal(
            value.supply_balance.fields.total_supply
          ).div(Math.pow(10, DEFAULT_COIN_DECIMAL));

          const totalBorrow = BigDecimal(
            value.borrow_balance.fields.total_supply
          ).div(Math.pow(10, DEFAULT_COIN_DECIMAL));

          const currentSupplyIndex = BigDecimal(value.current_supply_index).div(
            Math.pow(10, DECIMAL_RAY)
          );
          const currentBorrowIndex = BigDecimal(value.current_borrow_index).div(
            Math.pow(10, DECIMAL_RAY)
          );
          //add
          const supplyCapCelling = BigDecimal(value.supply_cap_ceiling).div(
            Math.pow(10, DECIMAL_RAY)
          );
          const borrowCapCeiling = BigDecimal(value.borrow_cap_ceiling).div(
            Math.pow(10, DECIMAL_RAY)
          );
          const treasuryBalance = BigDecimal(value.treasury_balance).div(
            Math.pow(10, DEFAULT_COIN_DECIMAL)
          );
          const currentBorrowRate = BigDecimal(value.current_borrow_rate).div(
            Math.pow(10, DECIMAL_RAY)
          );
          const currentSupplyRate = BigDecimal(value.current_supply_rate).div(
            Math.pow(10, DECIMAL_RAY)
          );

          // const supply rate
          // const borrow rate

          ctx.meter
            .Gauge("total_supply")
            .record(totalSupply, { env: "mainnet", id, type, coin_symbol });
          ctx.meter
            .Gauge("total_borrow")
            .record(totalBorrow, { env: "mainnet", id, type, coin_symbol });

          ctx.meter.Gauge("currentSupplyIndex").record(currentSupplyIndex, {
            env: "mainnet",
            id,
            type,
            coin_symbol,
          });
          ctx.meter.Gauge("currentBorrowIndex").record(currentBorrowIndex, {
            env: "mainnet",
            id,
            type,
            coin_symbol,
          });

          ctx.meter.Gauge("supplyCapCeiling").record(supplyCapCelling, {
            env: "mainnet",
            id,
            type,
            coin_symbol,
          });
          ctx.meter.Gauge("borrowCapCeiling").record(borrowCapCeiling, {
            env: "mainnet",
            id,
            type,
            coin_symbol,
          });

          // supply rate
          // borrow rate
          ctx.meter.Gauge("currentBorrowRate").record(currentBorrowRate, {
            env: "mainnet",
            id,
            type,
            coin_symbol,
          });
          ctx.meter.Gauge("currentSupplyRate").record(currentSupplyRate, {
            env: "mainnet",
            id,
            type,
            coin_symbol,
          });

          ctx.meter
            .Gauge("ltv")
            .record(ltv, { env: "mainnet", id, type, coin_symbol });
          ctx.meter
            .Gauge("treasuryBalance")
            .record(treasuryBalance, { env: "mainnet", id, type, coin_symbol });

          ctx.eventLogger.emit("indexNumberEvent", {
            token: coin_symbol,
            total_supply: totalSupply,
            total_borrow: totalBorrow,
            currentSupplyIndex: currentSupplyIndex,
            currentBorrowIndex: currentBorrowIndex,
            supplyCapCeiling: supplyCapCelling,
            borrowCapCeiling: borrowCapCeiling,
            currentBorrowRate: currentBorrowRate,
            currentSupplyRate: currentSupplyRate,
            ltv: ltv,
            treasuryBalance: treasuryBalance,
            env: "mainnet",
          });
        } catch (e) {
          console.log(e);
          console.log(JSON.stringify(self));
        }
      },
      10,
      10
    );
  }
}

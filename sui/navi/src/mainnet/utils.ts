import { CoinMap } from "./interfaces.js";

export const COIN = [
  "SUI",
  "wUSDC",
  "wUSDT",
  "WETH",
  "CETUS",
  "VoloSui",
  "HASUI",
  "NAVX",
  "WBTC",
  "AUSD",
  "nUSDC",
  "nbETH",
  "USDY",
  "NS",
  "stBTC",
  "DEEP",
  "FDUSD",
  "BLUE",
  "BUCK",
  "nUSDT",
  "stSUI",
  "suiBTC",
];

export const DECIMAL_RAY = 27;
export const DEFAULT_COIN_DECIMAL = 9;

export const DECIMAL_MAP: Record<number, number> = {
  0: 9,
  1: 6,
  2: 6,
  3: 8,
  4: 9,
  5: 9,
  6: 9,
  7: 9,
  8: 8,
  9: 6,
  10: 6,
  11: 8,
  12: 6,
  13: 6,
  14: 8,
  15: 6,
  16: 6,
  17: 9,
  18: 9,
  19: 6,
  20: 9,
  21: 8,
};

export const COIN_MAP: CoinMap = {
  "0x2::sui::SUI": "SUI",
  "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN":
    "wUSDC",
  "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN":
    "USDT",
  "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN":
    "WETH",
};

export const SYMBOL_MAP: Record<number, string> = {
  0: "SUI",
  1: "wUSDC",
  2: "wUSDT",
  3: "wETH",
  4: "CETUS",
  5: "vSui",
  6: "haSui",
  7: "NAVX",
  8: "wBTC",
  9: "AUSD",
  10: "nUSDC",
  11: "nbETH",
  12: "USDY",
  13: "NS",
  14: "stBTC",
  15: "DEEP",
  16: "FDUSD",
  17: "BLUE",
  18: "BUCK",
  19: "nUSDT",
  20: "stSUI",
  21: "suiBTC",
};

export function SymbolMatcher(objectType: string) {
  const regex = /<([^>]+)>/;
  const matches = objectType.match(regex);
  if (matches && matches.length > 1) {
    return matches[1];
  } else {
    return "unknown";
  }
}

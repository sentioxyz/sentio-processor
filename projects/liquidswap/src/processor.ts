import { liquidity_pool } from './types/aptos/liquidswap'
import { AccountEventTracker, aptos, Counter, Gauge } from "@sentio/sdk";
import {
  caculateValueInUsd,
  delay,
  getCoinInfo,
  getPrice,
  requestCoinInfo,
  scaleDown,
  whiteListed,
  CORE_TOKENS, getRandomInt
} from "./utils";
import { aggregator, coin, optional_aggregator } from "@sentio/sdk/lib/builtin/aptos/0x1";
import { AptosClient } from "aptos-sdk";

import { BigDecimal } from "@sentio/sdk/lib/core/big-decimal";

import { TypedMoveResource } from "@sentio/sdk/lib/aptos/types";
import CoinInfo = coin.CoinInfo;

const commonOptions = { sparse:  true }
const totalValue = new Gauge("total_value", commonOptions)
// const totalAmount = new Gauge("total_amount", commonOptions)

const tvlAll = new Gauge("tvl_all", commonOptions)
const tvlByPool = new Gauge("tvl_by_pool", commonOptions)
const tvlByPoolNew = new Gauge("tvl_by_pool_new", commonOptions)
const tvl = new Gauge("tvl", commonOptions)
// const amountCounter = new Gauge("amount", commonOptions)
// const volumeByPool = new Gauge("vol_by_pool", commonOptions)
const volume = new Gauge("vol", commonOptions)
const priceGauge = new Gauge("price", commonOptions)
const priceGaugeNew = new Gauge("price_new", commonOptions)
const fee = new Gauge("fee", commonOptions)
const feeAcc = new Counter("fee_acc", commonOptions)

const inputUsd = [100, 1000, 10000, 100000]
const priceImpact = new Gauge('price_impact', commonOptions)

// const eventCounter = new Counter("num_event", commonOptions)

const accountTracker = AccountEventTracker.register("users")
const lpTracker = AccountEventTracker.register("lp")

// const POOL_TYPE = "0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12::liquidity_pool::LiquidityPool"
//
// const ALL_POOLS = new Set<string>()
// let poolVersion = Long.ZERO

// const tmpFile = path.resolve(os.tmpdir(), "sentio", "cache", "sets")

// interface SavedPools {
//   version: string
//   pools: string[]
// }
//
// function savePool(version: Long, types: string[]) {
//   poolVersion = version
//   const value = types.join(", ")
//   if (!ALL_POOLS.has(value)) {
//     ALL_POOLS.add(value)
//     const data: SavedPools  = { version: poolVersion.toString(), pools: Array.from(ALL_POOLS)}
//     const json = JSON.stringify(data)
//     fs.mkdirSync(path.resolve(tmpFile, ".."), { recursive: true})
//     fs.writeFileSync(tmpFile , json)
//   }
// }
//
// function readPool(version: Long) {
//   if (ALL_POOLS.size !== 0) {
//     return
//   }
//   if (!fs.existsSync(tmpFile)) {
//     return
//   }
//   const json: SavedPools = JSON.parse(fs.readFileSync(tmpFile, "utf-8"))
//   const poolVersion = Long.fromString(json.version)
//   if (version.lte(poolVersion)) {
//     return
//   }
//   console.log("loading pools", json.pools.length)
//
//   for (const x of json.pools) {
//     ALL_POOLS.add(x)
//   }
//   console.log(json)
// }

liquidity_pool.bind({startVersion: 299999})
  .onEventPoolCreatedEvent(async (evt, ctx) => {
    ctx.meter.Counter("num_pools").add(1)
    lpTracker.trackEvent(ctx, { distinctId: ctx.transaction.sender })
    // ctx.logger.info("PoolCreated", { user: ctx.transaction.sender })

    ctx.logger.info("", {user: "-", value: 0.0001})

    // readPool(ctx.version)
    //
    // savePool(ctx.version, evt.type_arguments)

    await syncPools(ctx)
  })
  .onEventLiquidityAddedEvent(async (evt, ctx) => {
    ctx.meter.Counter("event_liquidity_add").add(1)
    lpTracker.trackEvent(ctx, { distinctId: ctx.transaction.sender })
    await syncPools(ctx)
  })
  .onEventLiquidityRemovedEvent(async (evt, ctx) => {
    ctx.meter.Counter("event_liquidity_removed").add(1)
    accountTracker.trackEvent(ctx, { distinctId: ctx.transaction.sender })
    await syncPools(ctx)
  })
  .onEventSwapEvent(async (evt, ctx) => {
    const value = await recordTradingVolume(ctx,
        evt.type_arguments[0], evt.type_arguments[1],
        evt.data_typed.x_in + evt.data_typed.x_out,
        evt.data_typed.y_in + evt.data_typed.y_out,
        getCurve(evt.type_arguments[2]))

    const coinXInfo = getCoinInfo(evt.type_arguments[0])
    const coinYInfo = getCoinInfo(evt.type_arguments[1])

    ctx.logger.info(`${ctx.transaction.sender} Swap ${coinXInfo.symbol} for ${coinYInfo.symbol}`, {user: ctx.transaction.sender, value: value.toNumber()})

    ctx.meter.Counter("event_swap_by_bridge").add(1, { bridge: coinXInfo.bridge })
    ctx.meter.Counter("event_swap_by_bridge").add(1, { bridge: coinYInfo.bridge })

    accountTracker.trackEvent(ctx, { distinctId: ctx.transaction.sender })

    await syncPools(ctx)
  })
  .onEventFlashloanEvent(async (evt, ctx) => {
    const coinXInfo = getCoinInfo(evt.type_arguments[0])
    const coinYInfo = getCoinInfo(evt.type_arguments[1])
    ctx.meter.Counter("event_flashloan_by_bridge").add(1, { bridge: coinXInfo.bridge })
    ctx.meter.Counter("event_flashloan_by_bridge").add(1, { bridge: coinYInfo.bridge })

    accountTracker.trackEvent(ctx, { distinctId: ctx.transaction.sender })
    await syncPools(ctx)
  })

async function recordTradingVolume(ctx: aptos.AptosContext, coinx: string, coiny: string, coinXAmount: bigint, coinYAmount: bigint, curve?: string): Promise<BigDecimal> {
  const whitelistx = whiteListed(coinx)
  const whitelisty = whiteListed(coiny)
  const coinXInfo = getCoinInfo(coinx)
  const coinYInfo = getCoinInfo(coiny)
  const timestamp = ctx.transaction.timestamp
  let result = BigDecimal(0.0)

  if (!whitelistx || !whitelisty) {
    return result
  }

  const pair = getPair(coinx, coiny)

  const baseLabels: Record<string, string> = { pair }
  if (curve) {
    baseLabels.curve = curve
  }

  if (whitelistx) {
    const value = await caculateValueInUsd(coinXAmount, coinXInfo, timestamp)
    result = value

    volume.record(ctx, value, { ...baseLabels, coin: coinXInfo.symbol, bridge: coinXInfo.bridge, type: coinXInfo.token_type.type})
  }
  if (whitelisty) {
    const value = await caculateValueInUsd(coinYAmount, coinYInfo, timestamp)
    result = value

    volume.record(ctx, value, { ...baseLabels, coin: coinYInfo.symbol, bridge: coinYInfo.bridge, type: coinYInfo.token_type.type})
  }

  fee.record(ctx, result.multipliedBy(0.0025), baseLabels)
  feeAcc.add(ctx, result.multipliedBy(0.0025), baseLabels)

  return result
}

// async function addFor(ctx: aptos.AptosContext, type: string, amount: bigint, timestamp: string, pool: string) {
//   const coin = await getCoinInfo(type)
//   if (coin) {
//     const value = await caculateValueInUsd(amount, coin, timestamp)
//     valueCounter.record(ctx, value, {coin: coin.symbol, pool: pool})
//     amountCounter.record(ctx, scaleDown(amount, coin.decimals), {coin: coin.symbol, pool: pool})
//   }
// }

// async function subFor(ctx: aptos.AptosContext, type: string, amount: bigint, timestamp: string, pool: string) {
//   const coin = await getCoinInfo(type)
//   const value = await caculateValueInUsd(amount, coin, timestamp)
//   valueCounter.sub(ctx, value, { coin: coin.symbol, pool: pool })
//   amountCounter.sub(ctx, scaleDown(amount, coin.decimals), { coin: coin.symbol, pool: pool })
// }

// TODO pool name should consider not just use symbol name
function getPair(coinx: string, coiny: string): string {
  const coinXInfo = getCoinInfo(coinx)
  const coinYInfo = getCoinInfo(coiny)
  if (coinXInfo.symbol.localeCompare(coinYInfo.symbol) > 0) {
    return `${coinYInfo.symbol}-${coinXInfo.symbol}`
  }
  return `${coinXInfo.symbol}-${coinYInfo.symbol}`
}

function getCurve(type: string) {
  if (type.includes("0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12::curves::Stable")) {
    return "Stable"
  } else {
    return "Uncorrelated"
  }
}

const recorded = new Set<bigint>()

const SKIP_POOL = false

const minLocked = 1e4
let priceInUsd: Map<string, BigDecimal> = new Map<string, BigDecimal>()

function calcPrice(coin: string, pools: TypedMoveResource<liquidity_pool.LiquidityPool<any, any, any>>[]) {
  const coinInfo = getCoinInfo(coin)
  if (coinInfo.symbol == 'USDC') {
    return BigDecimal(1)
  }
  let maxLocked = BigDecimal(0)
  let maxFrom = ""
  let res = undefined
  for (const pool of pools) {
    const curve = getCurve(pool.type_arguments[2])
    if (curve == 'Stable') {
      continue
    }

    if (pool.type_arguments[0] == coin) {
      const coinAmount = scaleDown(pool.data_typed.coin_x_reserve.value, coinInfo.decimals)
      const pairedCoinInfo = getCoinInfo(pool.type_arguments[1])
      const pairedCoinPriceInUsd = priceInUsd.get(pool.type_arguments[1])
      const pairedCoinAmount = scaleDown(pool.data_typed.coin_y_reserve.value, pairedCoinInfo.decimals)
      if (!pairedCoinPriceInUsd) {
        continue
      }

      const locked = pairedCoinAmount.multipliedBy(pairedCoinPriceInUsd)
      if (locked.gt(maxLocked) && locked.gt(minLocked)) {
        maxLocked = locked
        maxFrom = getPair(pool.type_arguments[0], pool.type_arguments[1])
        res = pairedCoinAmount.multipliedBy(pairedCoinPriceInUsd).div(coinAmount)
      }

    } else if (pool.type_arguments[1] == coin) {
      const coinAmount = scaleDown(pool.data_typed.coin_y_reserve.value, coinInfo.decimals)
      const pairedCoinInfo = getCoinInfo(pool.type_arguments[0])
      const pairedCoinPriceInUsd = priceInUsd.get(pool.type_arguments[0])
      const pairedCoinAmount = scaleDown(pool.data_typed.coin_x_reserve.value, pairedCoinInfo.decimals)
      if (!pairedCoinPriceInUsd) {
        continue
      }

      const locked = pairedCoinAmount.multipliedBy(pairedCoinPriceInUsd)
      if (locked.gt(maxLocked) && locked.gt(minLocked)) {
        maxLocked = locked
        maxFrom = getPair(pool.type_arguments[0], pool.type_arguments[1])
        res = pairedCoinAmount.multipliedBy(pairedCoinPriceInUsd).div(coinAmount)
      }
    }
  }
  if (res) {
    console.log(`got price of coin[${coinInfo.symbol}] at [${res}] from pair[${maxFrom}]`)
  } else {
    console.log(`failed to get price of coin[${coinInfo.symbol}]`)
  }
  return res
}

async function syncPools(ctx: aptos.AptosContext) {
  if (SKIP_POOL) {
    return
  }

  // folowing line is hack to run once every 100000 version
  const version = BigInt(ctx.version.toString())
  const bucket = version / 100000n;
  if (recorded.has(bucket)) {
    return
  }
  recorded.add(bucket)

  const normalClient = new AptosClient("https://aptos-mainnet.nodereal.io/v1/0c58c879d41e4eab8fd2fc0406848c2b")
  const patchClient = new AptosClient("https://aptos-mainnet.pontem.network/v1")

  let pools: TypedMoveResource<liquidity_pool.LiquidityPool<any, any, any>>[]

  // if (version <= 13100000n) {
    let resources = undefined
    while (!resources) {
      try {
        let client = normalClient
        if (version > 13100000n) {
          client = patchClient
        }
        resources = await client.getAccountResources('0x5a97986a9d031c4567e15b797be516910cfcb4156312482efc6a19c0a30c948', {ledgerVersion: version})
      } catch (e) {
        console.log("rpc error, retrying", e)
        await delay(1000)
      }
    }
    pools = aptos.TYPE_REGISTRY.filterAndDecodeResources<liquidity_pool.LiquidityPool<any, any, any>>("0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12::liquidity_pool::LiquidityPool", resources)
  // } else {
  //   await Promise.all(Array.from(ALL_POOLS).map(async p =>  {
  //     const coinx = p.split(", ")[0]
  //     const coiny = p.split(", ")[1]
  //     const whitelistx = whiteListed(coinx)
  //     const whitelisty = whiteListed(coiny)
  //     if (!whitelistx && !whitelisty) {
  //       return []
  //     }
  //     let resources = undefined
  //     while (!resources) {
  //       try {
  //         console.log("rpc call", `${POOL_TYPE}<${p}>`)
  //         resources = await client.getAccountResource('0x5a97986a9d031c4567e15b797be516910cfcb4156312482efc6a19c0a30c948',
  //             `${POOL_TYPE}<${p}>`,
  //             {ledgerVersion: version})
  //         const decoded = aptos.TYPE_REGISTRY.decodeResource<liquidity_pool.LiquidityPool<any, any, any>>(resources)
  //         if (decoded) {
  //           pools.push(decoded)
  //         }
  //       } catch (e) {
  //         console.log("rpc error, retrying", e)
  //         await delay(1000)
  //       }
  //     }
  //     return resources
  //   }))
  // }

  const volumeByCoin = new Map<string, BigDecimal>()
  const timestamp = ctx.transaction.timestamp

  console.log("num of pools: ", pools.length, ctx.version.toString())

  function debug(coin: string) {
    const coinInfo = getCoinInfo(coin)
    if (!["WETH", "zWETH", "APT", "tAPT"].includes(coinInfo.symbol)) {
      return
    }
    console.log("!!! debug", coinInfo.symbol, ", version:", ctx.version.toString())
    for (const pool of pools) {
      if (pool.type_arguments[0] == coin || pool.type_arguments[1] == coin) {
        const coinXInfo = getCoinInfo(pool.type_arguments[0])
        const coinYInfo = getCoinInfo(pool.type_arguments[1])
        console.log(`pool[${getPair(pool.type_arguments[0], pool.type_arguments[1])}] value: ${
          scaleDown(pool.data_typed.coin_x_reserve.value, coinXInfo.decimals)}, ${
          scaleDown(pool.data_typed.coin_y_reserve.value, coinYInfo.decimals)
        }`)
      }
    }
  }

  let tvlAllValue = BigDecimal(0)
  const updated = new Set<string>()
  for (const pool of pools) {
    // savePool(ctx.version, pool.type_arguments)
    const coinx = pool.type_arguments[0]
    const coiny = pool.type_arguments[1]
    const whitelistx = whiteListed(coinx)
    const whitelisty = whiteListed(coiny)
    const coinXInfo = getCoinInfo(coinx)
    const coinYInfo = getCoinInfo(coiny)
    let priceX = BigDecimal(0)
    let priceY = BigDecimal(0)
    if (whitelistx && !updated.has(coinx)) {
      updated.add(coinx)
      priceX = calcPrice(coinx, pools)?? BigDecimal(0)
      if (priceX.eq(BigDecimal(0))) {
        debug(coinx)
      } else {
        priceInUsd.set(coinx, priceX)
        priceGaugeNew.record(ctx, priceX, {coin: coinXInfo.symbol})
      }
    }
    if (whitelisty && !updated.has(coiny)) {
      updated.add(coiny)
      priceY = calcPrice(coiny, pools)?? BigDecimal(0)
      if (priceY.eq(BigDecimal(0))) {
        debug(coiny)
      } else {
        priceInUsd.set(coiny, priceY)
        priceGaugeNew.record(ctx, priceY, {coin: coinYInfo.symbol})
      }
    }
    if (priceX.eq(BigDecimal(0))) {
      priceX = priceInUsd.get(coinx)?? BigDecimal(0)
    }
    if (priceY.eq(BigDecimal(0))) {
      priceY = priceInUsd.get(coiny)?? BigDecimal(0)
    }

    if (!whitelistx && !whitelisty) {
      continue
    }

    const pair = getPair(coinx, coiny)
    const curve = getCurve(pool.type_arguments[2])

    const coinx_amount = pool.data_typed.coin_x_reserve.value
    const coiny_amount = pool.data_typed.coin_y_reserve.value

    let poolValue = BigDecimal(0)
    let poolValueNew = BigDecimal(0)
    if (whitelistx) {
      const value = await caculateValueInUsd(coinx_amount, coinXInfo, timestamp)
      poolValue = poolValue.plus(value)
      const valueNew = scaleDown(coinx_amount, coinXInfo.decimals).multipliedBy(priceX)
      poolValueNew = poolValueNew.plus(valueNew)
      // tvlTotal.record(ctx, value, { pool: poolName, type: coinXInfo.token_type.type })

      let coinXTotal = volumeByCoin.get(coinXInfo.token_type.type)
      if (!coinXTotal) {
        coinXTotal = value
      } else {
        coinXTotal = coinXTotal.plus(value)
      }
      volumeByCoin.set(coinXInfo.token_type.type, coinXTotal)

      if (!whitelisty) {
        poolValue = poolValue.plus(value)
        poolValueNew = poolValueNew.plus(valueNew)
        // tvlTotal.record(ctx, value, { pool: poolName, type: coinYInfo.token_type.type})
      }
    }
    if (whitelisty) {
      const value = await caculateValueInUsd(coiny_amount, coinYInfo, timestamp)
      poolValue = poolValue.plus(value)
      const valueNew = scaleDown(coiny_amount, coinYInfo.decimals).multipliedBy(priceY)
      poolValueNew = poolValueNew.plus(valueNew)
      // tvlTotal.record(ctx, value, { pool: poolName, type: coinYInfo.token_type.type })

      let coinYTotal = volumeByCoin.get(coinYInfo.token_type.type)
      if (!coinYTotal) {
        coinYTotal = value
      } else {
        coinYTotal = coinYTotal.plus(value)
      }
      volumeByCoin.set(coinYInfo.token_type.type, coinYTotal)

      if (!whitelistx) {
        poolValue = poolValue.plus(value)
        poolValueNew = poolValueNew.plus(valueNew)
      }
    }
    if (poolValue.isGreaterThan(0)) {
      tvlByPool.record(ctx, poolValue, {pair, curve})
      tvlByPoolNew.record(ctx, poolValueNew, {pair, curve})

      if (curve == "Uncorrelated") {
        const priceX = await getPrice(coinXInfo.token_type.type, timestamp)
        const priceY = await getPrice(coinYInfo.token_type.type, timestamp)
        if (priceX != 0 && priceY != 0) {
          const nX = scaleDown(coinx_amount, coinXInfo.decimals)
          const nY = scaleDown(coiny_amount, coinYInfo.decimals)
          const fee = scaleDown(pool.data_typed.fee, 4)
          const feeFactor = fee.div(BigDecimal(1).minus(fee))

          for (const k of inputUsd) {
            // impactX = fee / (1 - fee) + inX / nX
            const inX = BigDecimal(k).div(priceX)
            const impactX = feeFactor.plus(inX.div(nX))
            priceImpact.record(ctx, impactX, {
              pair, curve,
              fee: fee.toString(),
              inputUsd: k.toString(),
              direction: 'X to Y'
            })

            const inY = BigDecimal(k).div(priceY)
            const impactY = feeFactor.plus(inY.div(nY))
            priceImpact.record(ctx, impactY, {
              pair, curve,
              fee: fee.toString(),
              inputUsd: k.toString(),
              direction: 'Y to X'
            })
          }
        }
      }
    }
    tvlAllValue = tvlAllValue.plus(poolValue)
  }

  tvlAll.record(ctx, tvlAllValue)

  for (const [k, v] of volumeByCoin) {
    const coinInfo = CORE_TOKENS.get(k)
    if (!coinInfo) {
      throw Error("unexpected coin " + k)
    }
    const price = await getPrice(coinInfo.token_type.type, timestamp)
    priceGauge.record(ctx, price, { coin: coinInfo.symbol })
    if (v.isGreaterThan(0)) {
      tvl.record(ctx, v, {coin: coinInfo.symbol, bridge: coinInfo.bridge, type: coinInfo.token_type.type})
    }
  }

  const allPromises = Array.from(CORE_TOKENS.entries()).map(async ([k,v]) => {
    const price = await getPrice(v.token_type.type, timestamp)

    let coinInfo: CoinInfo<any> | undefined
    try {
      coinInfo = await requestCoinInfo(k, version)
    } catch (e) {
      return
    }

    const aggOption = (coinInfo.supply.vec as optional_aggregator.OptionalAggregator[])[0]
    let amount
    if (aggOption.integer.vec.length) {
      const intValue = (aggOption.integer.vec[0] as optional_aggregator.Integer)
      amount = intValue.value
    } else {
      const agg = (aggOption.aggregator.vec[0] as aggregator.Aggregator)
      let aggString: any
      while (!aggString) {
        try {
          aggString = await normalClient.getTableItem(agg.handle, {
            key: agg.key,
            key_type: "address",
            value_type: "u128"
          }, {ledgerVersion: version})
        } catch (e) {
          if (e.status === 429) {
            await delay(1000 + getRandomInt(1000))
          } else {
            throw e
          }
        }
      }
      amount = BigInt(aggString)
    }

    // totalAmount.record(ctx, scaleDown(amount, extedCoinInfo.decimals), { coin: extedCoinInfo.symbol, bridge: extedCoinInfo.bridge })
    const value = scaleDown(amount, v.decimals).multipliedBy(price)
    if (value.isGreaterThan(0)) {
      totalValue.record(ctx, value, {coin: v.symbol, bridge: v.bridge, type: v.token_type.type})
    }
  })

  await Promise.all(allPromises)
}
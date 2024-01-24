import { SuiObjectProcessor, SuiContext, SuiObjectContext } from "@sentio/sdk/sui"
import { getPriceByType, token } from "@sentio/sdk/utils"
import * as constant from './constant.js'
import { SuiNetwork } from "@sentio/sdk/sui"
// import { pool } from "../types/sui/testnet/clmm.js"

//get coin address without suffix
export function getCoinObjectAddress(type: string) {
    let coin_a_address = ""
    let coin_b_address = ""
    const regex = /0x[a-fA-F0-9]+:/g
    const matches = type.match(regex)
    if (matches && matches.length >= 2) {
        coin_a_address = matches[1].slice(0, -1)
        coin_b_address = matches[2].slice(0, -1)
    }
    return [coin_a_address, coin_b_address]
}

//get full coin address with suffix
export function getCoinFullAddress(type: string) {
    let coin_a_address = ""
    let coin_b_address = ""
    const regex_a = /<[^,]+,/g;
    const regex_b = /0x[^\s>]+>/g;
    const matches_a = type.match(regex_a)
    const matches_b = type.match(regex_b)
    if (matches_a) {
        coin_a_address = matches_a[0].slice(1, -1)
    }
    if (matches_b) {
        coin_b_address = matches_b[0].slice(0, -1)
    }
    return [coin_a_address, coin_b_address]
}

interface poolInfo {
    symbol_a: string,
    symbol_b: string,
    decimal_a: number,
    decimal_b: number,
    pairName: string,
    type: string
}


let poolInfoMap = new Map<string, Promise<poolInfo>>()
let IDOPoolInfoMap = new Map<string, Promise<poolInfo>>()
let coinInfoMap = new Map<string, Promise<token.TokenInfo>>()

export async function buildCoinInfo(ctx: SuiContext | SuiObjectContext, coinAddress: string): Promise<token.TokenInfo> {
    let [symbol, name, decimal] = ["unk", "unk", 0]
    try {
        const metadata = await ctx.client.getCoinMetadata({ coinType: coinAddress })
        //@ts-ignore
        symbol = metadata.symbol
        //@ts-ignore
        decimal = metadata.decimals
        //@ts-ignore
        name = metadata.name
        console.log(`build coin metadata ${symbol} ${decimal} ${name}`)
    }
    catch (e) {
        console.log(`${e.message} get coin metadata error ${coinAddress}`)
    }

    return {
        symbol,
        name,
        decimal
    }
}

export const getOrCreateCoin = async function (ctx: SuiContext | SuiObjectContext, coinAddress: string): Promise<token.TokenInfo> {
    let coinInfo = coinInfoMap.get(coinAddress)
    if (!coinInfo) {
        coinInfo = buildCoinInfo(ctx, coinAddress)
        coinInfoMap.set(coinAddress, coinInfo)
        // console.log("set coinInfoMap for " + coinAddress)
        let i = 0
        let msg = `set coinInfoMap for ${(await coinInfo).name}`
        for (const key of coinInfoMap.keys()) {
            const coinInfo = await coinInfoMap.get(key)
            msg += `\n${i}:${coinInfo?.name},${coinInfo?.decimal} `
            i++
        }
        console.log(msg)
    }
    return coinInfo
}

export async function buildPoolInfo(ctx: SuiContext | SuiObjectContext, pool: string): Promise<poolInfo> {
    let [symbol_a, symbol_b, decimal_a, decimal_b, pairName, type, fee_label] = ["", "", 0, 0, "", "", "", "NaN"]
    try {
        const obj = await ctx.client.getObject({ id: pool, options: { showType: true, showContent: true } })
        //@ts-ignore
        type = obj.data.type
        //@ts-ignore
        if (obj.data.content.fields.fee_rate) {
            //@ts-ignore
            fee_label = (Number(obj.data.content.fields.fee_rate) / 10000).toFixed(2) + "%"
        }
        else {
            console.log(`no fee label ${pool}`)
        }
        let [coin_a_full_address, coin_b_full_address] = ["", ""]
        if (type) {
            [coin_a_full_address, coin_b_full_address] = getCoinFullAddress(type)
        }
        const coinInfo_a = await getOrCreateCoin(ctx, coin_a_full_address)
        const coinInfo_b = await getOrCreateCoin(ctx, coin_b_full_address)
        symbol_a = coinInfo_a.symbol
        symbol_b = coinInfo_b.symbol
        decimal_a = coinInfo_a.decimal
        decimal_b = coinInfo_b.decimal
        pairName = symbol_a + "-" + symbol_b + " " + fee_label
        console.log(`build pool ${pairName}`)
    } catch (e) {
        console.log(`${e.message} get pool object error ${pool}`)
    }
    return {
        symbol_a,
        symbol_b,
        decimal_a,
        decimal_b,
        pairName,
        type
    }
}

export const getOrCreatePool = async function (ctx: SuiContext | SuiObjectContext, pool: string): Promise<poolInfo> {
    let infoPromise = poolInfoMap.get(pool)
    if (!infoPromise) {
        infoPromise = buildPoolInfo(ctx, pool)
        poolInfoMap.set(pool, infoPromise)
        // console.log("set poolInfoMap for " + pool)
        let i = 0
        let msg = `set poolInfoMap for ${(await infoPromise).pairName}`
        for (const key of poolInfoMap.keys()) {
            const poolInfo = await poolInfoMap.get(key)
            msg += `\n${i}:${poolInfo?.pairName} `
            i++
        }
        console.log(msg)
    }
    return infoPromise
}

export async function buildIDOPoolInfo(ctx: SuiContext | SuiObjectContext, pool: string): Promise<poolInfo> {
    let [symbol_a, symbol_b, decimal_a, decimal_b, pairName, type] = ["", "", 0, 0, "", "", ""]
    try {
        const obj = await ctx.client.getObject({ id: pool, options: { showType: true, showContent: true } })
        //@ts-ignore
        type = obj.data.type

        let [coin_a_full_address, coin_b_full_address] = ["", ""]
        if (type) {
            [coin_a_full_address, coin_b_full_address] = getCoinFullAddress(type)
        }
        const coinInfo_a = await getOrCreateCoin(ctx, coin_a_full_address)
        const coinInfo_b = await getOrCreateCoin(ctx, coin_b_full_address)
        symbol_a = coinInfo_a.symbol
        symbol_b = coinInfo_b.symbol
        decimal_a = coinInfo_a.decimal
        decimal_b = coinInfo_b.decimal
        pairName = symbol_a + "-" + symbol_b + " IDO"
        console.log(`build IDO pool ${pairName}`)
    } catch (e) {
        console.log(`${e.message} get IDO pool object error ${pool}`)
    }
    return {
        symbol_a,
        symbol_b,
        decimal_a,
        decimal_b,
        pairName,
        type
    }
}
export const getOrCreatIDOPool = async function (ctx: SuiContext | SuiObjectContext, pool: string): Promise<poolInfo> {
    let infoPromise = IDOPoolInfoMap.get(pool)
    if (!infoPromise) {
        infoPromise = buildIDOPoolInfo(ctx, pool)
        IDOPoolInfoMap.set(pool, infoPromise)
        // console.log("set poolInfoMap for " + pool)
        // let i = 0
        let msg = `set IDO PoolInfoMap for ${(await infoPromise).pairName}`
        // for (const key of IDOPoolInfoMap.keys()) {
        //     const poolInfo = await IDOPoolInfoMap.get(key)
        //     msg += `\n${i}:${poolInfo?.pairName} `
        //     i++
        // }
        console.log(msg)
    }
    return infoPromise
}



export async function getPoolPrice(ctx: SuiContext | SuiObjectContext, pool: string) {
    const obj = await ctx.client.getObject({ id: pool, options: { showType: true, showContent: true } })
    //@ts-ignore
    const current_sqrt_price = Number(obj.data.content.fields.current_sqrt_price)
    if (!current_sqrt_price) { console.log(`get pool price error at ${ctx}`) }
    const poolInfo = await getOrCreatePool(ctx, pool)
    const pairName = poolInfo.pairName
    const coin_b2a_price = 1 / (Number(current_sqrt_price) ** 2) * (2 ** 128) * 10 ** (poolInfo.decimal_b - poolInfo.decimal_a)
    const coin_a2b_price = 1 / coin_b2a_price
    ctx.meter.Gauge("a2b_price").record(coin_a2b_price, { pairName })
    ctx.meter.Gauge("b2a_price").record(coin_b2a_price, { pairName })
    return coin_a2b_price
}


// export async function calculateValue_USD(ctx: SuiContext | SuiObjectContext, pool: string, amount_a: number, amount_b: number, date: Date) {
//     const poolInfo = await getOrCreatePool(ctx, pool)
//     const [coin_a_full_address, coin_b_full_address] = getCoinFullAddress(poolInfo.type)
//     const price_a = await getPriceByType(SuiNetwork.MAIN_NET, coin_a_full_address, date)
//     const price_b = await getPriceByType(SuiNetwork.MAIN_NET, coin_b_full_address, date)

//     const coin_a2b_price = await getPoolPrice(ctx, pool)

//     let [value_a, value_b] = [0, 0]
//     if (price_a) {
//         value_a = amount_a * price_a
//         value_b = amount_b / coin_a2b_price * price_a
//     }
//     else if (price_b) {
//         value_a = amount_a * coin_a2b_price * price_b
//         value_b = amount_b * price_b
//     }
//     else {
//         console.log(`price not in sui coinlist, calculate value failed at ${ctx}`)
//     }

//     return value_a + value_b
// }

export async function calculateValue_USD(ctx: SuiContext | SuiObjectContext, pool: string, amount_a: number, amount_b: number, date: Date) {
    let [value_a, value_b] = [0, 0]
    try {
        const poolInfo = await getOrCreatePool(ctx, pool)
        const [coin_a_full_address, coin_b_full_address] = getCoinFullAddress(poolInfo.type)
        const price_a = await getPriceByType(SuiNetwork.MAIN_NET, coin_a_full_address, date)
        const price_b = await getPriceByType(SuiNetwork.MAIN_NET, coin_b_full_address, date)
        const coin_a2b_price = await getPoolPrice(ctx, pool)

        if (price_a) {
            value_a = amount_a * price_a
            //handle the case of low liquidity
            if (price_b) {
                value_b = amount_b * price_b
            }
            else {
                value_b = amount_b / coin_a2b_price * price_a
            }
        }
        else if (price_b) {
            value_a = amount_a * coin_a2b_price * price_b
            value_b = amount_b * price_b
        }
        else {
            console.log(`price not in sui coinlist, calculate value failed at coin_a: ${coin_a_full_address},coin_b: ${coin_b_full_address} at at ${pool} ${amount_a} ${amount_b}`)
        }
    }
    catch (e) {
        console.log(` calculate value error ${e.message} at ${pool} ${amount_a} ${amount_b}`)
    }
    return [value_a, value_b]
}

export async function calculateFee_USD(ctx: SuiContext | SuiObjectContext, pool: string, amount: number, atob: Boolean, date: Date) {
    let vol = 0

    try {
        const poolInfo = await getOrCreatePool(ctx, pool)
        const [coin_a_full_address, coin_b_full_address] = getCoinFullAddress(poolInfo.type)
        const price_a = await getPriceByType(SuiNetwork.MAIN_NET, coin_a_full_address, date)
        const price_b = await getPriceByType(SuiNetwork.MAIN_NET, coin_b_full_address, date)
        const coin_a2b_price = await getPoolPrice(ctx, pool)

        if (!price_a && !price_b) {
            console.log(`price not in sui coinlist, calculate fee failed at coin_a: ${coin_a_full_address},coin_b: ${coin_b_full_address} at ${pool}`)
            return 0
        }

        if (atob) {
            if (price_a) vol = amount * price_a
            else if (price_b) vol = amount * coin_a2b_price * price_b
        }
        else {
            if (price_b) vol = amount * price_b
            else if (price_a) vol = amount / coin_a2b_price * price_a
        }
    }
    catch (e) {
        console.log(`calculate fee error ${e.message} at at ${pool} ${amount}`)
    }

    return vol
}
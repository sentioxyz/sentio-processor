import { SuiContext, SuiNetwork } from "@sentio/sdk/sui";
import * as aggregator from "./types/sui/0x88dfe5e893bc9fa984d121e4d0d5b2e873dc70ae430cf5b3228ae6cb199cb32b.js";
import { slippage } from "./types/sui/0x5b7d732adeb3140a2dbf2becd1e9dbe56cee0e3687379bcfe7df4357ea664313.js";
import { SuiCoinList } from "@sentio/sdk/sui/ext";
import { getPriceBySymbol, getPriceByType, token } from "@sentio/sdk/utils";

let coinInfoMap = new Map<string, Promise<token.TokenInfo>>();

let processedTxs = new Set<string>();

const referralIdToUsernameMap: Record<string, string> = {
    "1873161113": "NaviAG",
    "2463850496": "Navi",
    "9951543296": "naviTgBot",
    "3258838016": "w6g2000",
    "1000648704": "Binh",
    "7289584128": "sudo",
    "7723906048": "Jesus",
    "4697169920": "Mayan",
    "6541220672": "Wave",
};

export function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildCoinInfo(ctx: SuiContext, coinAddress: string): Promise<token.TokenInfo> {
    let [symbol, name, decimal] = ["unk", "unk", 0];

    let retryCounter = 0;
    while (retryCounter++ <= 50) {
        try {
            const metadata = await ctx.client.getCoinMetadata({ coinType: coinAddress });
            if (metadata == null) {
                break;
            }

            symbol = metadata.symbol;
            decimal = metadata.decimals;
            name = metadata.name;
            console.log(`build coin metadata ${symbol} ${decimal} ${name}`);
        } catch (e) {
            console.log(`${e.message} get coin metadata error ${coinAddress}, retry: ${retryCounter}`);
            await delay(10000);
            continue;
        }
        break;
    }

    return {
        symbol,
        name,
        decimal
    };
}

export const getOrCreateCoin = async function (ctx: SuiContext, coinAddress: string): Promise<token.TokenInfo> {
    console.log("coinAddress", coinAddress);
    let coinInfo = coinInfoMap.get(coinAddress);
    if (!coinInfo) {
        coinInfo = buildCoinInfo(ctx, coinAddress);
        coinInfoMap.set(coinAddress, coinInfo);
        let i = 0;
        let msg = `set coinInfoMap for ${(await coinInfo).name}`;
        for (const key of coinInfoMap.keys()) {
            const coinInfo = await coinInfoMap.get(key);
            msg += `\n${i}:${coinInfo?.name},${coinInfo?.decimal} `;
            i++;
        }
        console.log(msg);
    }
    return coinInfo;
}

const updateSymbol = (coin: token.TokenInfo, coinAddress: string) => {
    let symbol = coin.symbol;

    if (coinAddress == '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC') {
        symbol = 'nUSDC';
    }
    else if (coinAddress == '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN') {
        symbol = 'wUSDC';
    }
    else if (coinAddress == '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH') {
        symbol = 'suiETH';
    }
    else if (coinAddress == '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN') {
        symbol = 'wETH';
    }

    return symbol;
}

async function getCoinPrice(ctx: SuiContext, coinAddress: string): Promise<number> {
    let price = await getPriceByType(SuiNetwork.MAIN_NET, coinAddress, ctx.timestamp) || 0;

    if (price === 0) {
        try {
            const response = await fetch(`https://aggregator-api-stage-d18441a1781f.naviprotocol.io/coins/price?coinType=${coinAddress}`);
            const data = await response.json();
            if (data.data.list.length > 0) {
                price = data.data.list[0].value || 0;
            } else {
                console.error(`No price data available for coinAddress: ${coinAddress}`);
            }
        } catch (error) {
            console.error(`Error fetching price for coinAddress: ${coinAddress}`, error);
        }
    }
    console.log(`getCoinPrice: ${coinAddress}, price:${price}`);
    return price;
}

async function swapEventHandler(event: aggregator.slippage.SwapEventInstance, ctx: SuiContext) {
    const txDigest = ctx.transaction.digest;

    
    if (processedTxs.has(txDigest)) {
        console.log(`Transaction ${txDigest} has already been processed. Skipping.`);
        return;
    }

    processedTxs.add(txDigest);
    console.log(`Processing transaction ${txDigest}`);

    const fromInfo = await getOrCreateCoin(ctx, event.type_arguments[0]);
    const toInfo = await getOrCreateCoin(ctx, event.type_arguments[1]);

    const fromPrice = await getCoinPrice(ctx, event.type_arguments[0]);
    const toPrice = await getCoinPrice(ctx, event.type_arguments[1]);

    let fromValue = fromPrice * Number(event.data_decoded.amount_in) / Math.pow(10, fromInfo.decimal);
    let toValue = toPrice * Number(event.data_decoded.amount_out) / Math.pow(10, toInfo.decimal);

    let usdGap = 0;

    usdGap = Math.abs(fromValue - toValue) / Math.min(fromValue, toValue);
    if (usdGap >= 0.5) {
        if (fromValue > toValue) {
            fromValue = toValue;
        } else {
            toValue = fromValue;
        }
    }

    ctx.eventLogger.emit("swapEvent", {
        user: event.sender,
        from: event.type_arguments[0],
        fromSymbol: updateSymbol(fromInfo, event.type_arguments[0]),
        target: event.type_arguments[1],
        targetSymbol: updateSymbol(toInfo, event.type_arguments[1]),
        amount_in: event.data_decoded.amount_in,
        amount_in_number: Number(event.data_decoded.amount_in) / Math.pow(10, fromInfo.decimal),
        amount_in_usd: fromValue,
        amount_out: event.data_decoded.amount_out,
        amount_out_number: Number(event.data_decoded.amount_out) / Math.pow(10, toInfo.decimal),
        amount_out_usd: toValue,
        min_amount_out: event.data_decoded.min_amount_out,
        referral_code: event.data_decoded.referral_code,
    });
    
    const balanceChanges = ctx.transaction.balanceChanges;
    if (balanceChanges) {
        for (let i = 0; i < balanceChanges.length; i++) {
            const amount = balanceChanges[i].amount;
            const coinType = balanceChanges[i].coinType;
            /** Owner of the balance change */
            const owner: any = balanceChanges[i].owner as any;
            const ownerAddress = owner.AddressOwner || owner.ObjectOwner;

            if (ownerAddress == "0xd56948cebf0a3309e13980126bcc8ef4d7733305cd7b412fa00167d57741984e") {
                console.log("test owner", ownerAddress);

                const events = ctx.transaction.events;
                console.log("test transactionId", ctx.transaction.digest);

                if (events) {
                    for (let j = 0; j < events.length; j++) { 
                        const txEvent = events[j];
                        if (txEvent.packageId == "0x88dfe5e893bc9fa984d121e4d0d5b2e873dc70ae430cf5b3228ae6cb199cb32b") {
                            ctx.eventLogger.emit("sponsorTX", {
                                suiGas: Math.abs(Number(amount)),
                                coinType,
                                owner: ownerAddress,
                                txHash: ctx.transaction.digest,
                                user: txEvent.sender,
                                eventType: txEvent.type,
                                eventId: txEvent.id,
                            });
                        }
                    }
                }
            }
        }
    }
    if (processedTxs.size > 10000) {
        const iterator = processedTxs.values();
        const first = iterator.next().value;
        processedTxs.delete(first);
    }
}

async function OnBehalfOfExSwapWithReferral(event: slippage.ExSwapWithReferralEventInstance, ctx: SuiContext) {
    const divisor = Math.pow(10, 9);
    const sender = event.data_decoded.swap_initializer_address;
    const receiver = event.data_decoded.receiver_address;
    const fromCoinPrice = event.data_decoded.from_coin_price;
    const fromCoinPriceNumber = Number(event.data_decoded.from_coin_price) / divisor;
    const fromCoinAmount = event.data_decoded.from_coin_amount; 
    const fromCoinAmountNumber = Number(event.data_decoded.from_coin_amount) / divisor; 
    const toCoinPrice = event.data_decoded.to_coin_price;
    const toCoinPriceNumber = Number(event.data_decoded.to_coin_price) / divisor;
    const toCoinAmount = event.data_decoded.to_coin_amount;
    const toCoinAmountNumber = Number(event.data_decoded.to_coin_amount)  / divisor;
    const rewardsAmount = event.data_decoded.reward_amount ;
    const rewardsAmountNumber =  Number(event.data_decoded.reward_amount) / divisor;
    const rewardsRatio = event.data_decoded.rewards_ratio;
    const referralId = event.data_decoded.referral_id;

    const referralIdStr = referralId.toString();
    const referralName = referralIdToUsernameMap[referralIdStr] || "Unknown";

    let fromValueInUSD = fromCoinPriceNumber * fromCoinAmountNumber;
    let toValueInUSD = toCoinPriceNumber * toCoinAmountNumber;

    let usdGap = 0;

    usdGap = Math.abs(fromValueInUSD - toValueInUSD) / Math.min(fromValueInUSD, toValueInUSD);
    if (usdGap >= 0.5) {
        if (fromValueInUSD > toValueInUSD) {
            fromValueInUSD = toValueInUSD;
        } else {
            toValueInUSD = fromValueInUSD;
        }
    }

    ctx.eventLogger.emit("swapReferralEvent", {
        sender,
        receiver,
        fromCoinPrice,
        fromCoinAmount,
        toCoinPrice,
        toCoinAmount,
        rewardsAmount,
        fromCoinPriceNumber,
        fromCoinAmountNumber,
        fromValueInUSD,
        toCoinPriceNumber,
        toCoinAmountNumber,
        toValueInUSD,
        rewardsAmountNumber,
        rewardsRatio,
        referralId,
        referralName,
    });
}

aggregator.slippage.bind({ startCheckpoint: 67080155n })
    .onEventSwapEvent(swapEventHandler, { resourceChanges: true });

slippage.bind({ startCheckpoint: 92365940n })
    .onEventExSwapWithReferralEvent(OnBehalfOfExSwapWithReferral, { resourceChanges: true });

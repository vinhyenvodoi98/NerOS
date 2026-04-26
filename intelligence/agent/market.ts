export interface MarketData {
  price: number;
  change24h: number;
  volume: number;
}

const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  WETH: "weth",
  USDC: "usd-coin",
  USDT: "tether",
  WBTC: "wrapped-bitcoin",
  DAI: "dai",
};

export async function getPrice(token: string): Promise<MarketData> {
  const id = COINGECKO_IDS[token.toUpperCase()];
  if (!id) throw new Error(`Unknown token: ${token}`);

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status}`);

  const data = await res.json() as Record<string, Record<string, number>>;
  const entry = data[id];
  if (!entry) throw new Error(`No data returned for ${token}`);

  return {
    price: entry["usd"],
    change24h: entry["usd_24h_change"],
    volume: entry["usd_24h_vol"],
  };
}

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

const priceCache = new Map<string, { data: MarketData; ts: number }>();
const CACHE_TTL_MS = 60_000;

export async function getPrice(token: string): Promise<MarketData> {
  const id = COINGECKO_IDS[token.toUpperCase()];
  if (!id) throw new Error(`Unknown token: ${token}`);

  const cached = priceCache.get(id);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
  let res = await fetch(url);
  // Retry up to 3× on rate-limit with exponential backoff (15s, 30s, 60s)
  for (let attempt = 0, wait = 15_000; res.status === 429 && attempt < 3; attempt++, wait *= 2) {
    console.error(`[market] CoinGecko 429 — waiting ${wait / 1000}s (attempt ${attempt + 1}/3)`);
    await new Promise((r) => setTimeout(r, wait));
    res = await fetch(url);
  }
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status}`);

  const data = await res.json() as Record<string, Record<string, number>>;
  const entry = data[id];
  if (!entry) throw new Error(`No data returned for ${token}`);

  const result: MarketData = {
    price: entry["usd"],
    change24h: entry["usd_24h_change"],
    volume: entry["usd_24h_vol"],
  };
  priceCache.set(id, { data: result, ts: Date.now() });
  return result;
}

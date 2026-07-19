import { createServerFn } from "@tanstack/react-start";

// ETH price + 24h change, as a fallback for Arbitrum's Blockscout /stats
// endpoint. Blockscout's own coin_price is usually populated for a real
// mainnet like Arbitrum, but coin_price_change_percentage is often null —
// CoinGecko (coin id "ethereum") fills in whatever Blockscout doesn't have.

export const getEthPrice = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true&include_market_cap=true";
    const resp = await fetch(url, { headers: { accept: "application/json" } });
    if (!resp.ok) return { ok: false as const };
    const json = (await resp.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number; usd_market_cap?: number } | undefined
    >;
    const q = json.ethereum;
    if (!q || typeof q.usd !== "number") return { ok: false as const };
    return {
      ok: true as const,
      usd: q.usd,
      change24h: typeof q.usd_24h_change === "number" ? q.usd_24h_change : null,
      marketCap: typeof q.usd_market_cap === "number" ? q.usd_market_cap : null,
    };
  } catch {
    return { ok: false as const };
  }
});

// 30-day daily price history, as a fallback for the Price chart when
// Arbitrum's own Blockscout instance returns empty chart_data.
export const getEthPriceHistory = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=30&interval=daily";
    const resp = await fetch(url, { headers: { accept: "application/json" } });
    if (!resp.ok) return { ok: false as const };
    const json = (await resp.json()) as { prices?: Array<[number, number]> };
    const prices = json.prices ?? [];
    const points = prices.map(([ts, price]) => ({
      date: new Date(ts).toISOString().slice(0, 10),
      closing_price: String(price),
    }));
    return { ok: true as const, points };
  } catch {
    return { ok: false as const };
  }
});

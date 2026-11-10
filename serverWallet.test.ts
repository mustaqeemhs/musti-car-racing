import { describe, expect, it } from "vitest";
import { friendlyWalletError, parseServerState } from "./serverWallet";

describe("server wallet", () => {
  const good = {
    balance: 1200, selected: "musti-gt", owned: ["musti-gt", "yamaha-r1", 5],
    upgrades: { "musti-gt": { engine: 2, topSpeed: -1, nitro: 0.5 } },
    progression: { bestScore: 10 },
    career: { unlocked: 3, best: { rookie: 1 } },
    dailyAvailable: true, fresh: false, isAnonymous: true, email: null,
  };

  it("reads a good wallet from the server", () => {
    const state = parseServerState(good)!;
    expect(state.balance).toBe(1200);
    expect(state.owned).toEqual(["musti-gt", "yamaha-r1"]);
    expect(state.upgrades["musti-gt"]).toEqual({ engine: 2 });
    expect(state.career).toEqual({ unlocked: 3, best: { rookie: 1 } });
    expect(state.dailyAvailable).toBe(true);
    expect(state.isAnonymous).toBe(true);
    expect(state.email).toBeNull();
  });

  it("rejects broken wallets", () => {
    expect(parseServerState(null)).toBeNull();
    expect(parseServerState({ ...good, balance: -5 })).toBeNull();
    expect(parseServerState({ ...good, balance: "100" })).toBeNull();
    expect(parseServerState({ ...good, owned: "nope" })).toBeNull();
  });

  it("explains errors in plain words", () => {
    expect(friendlyWalletError(new Error("TypeError: Failed to fetch"))).toMatch(/connection/i);
    expect(friendlyWalletError(new Error("Not enough Jaa'izah."))).toBe("Not enough Jaa'izah.");
    expect(friendlyWalletError(new Error("429 rate limit"))).toMatch(/wait a minute/i);
    expect(friendlyWalletError(new Error("You already own that vehicle."))).toBe("You already own that vehicle.");
    expect(friendlyWalletError(undefined)).toMatch(/try again/i);
  });
});

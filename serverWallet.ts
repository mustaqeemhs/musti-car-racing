/**
 * The player's wallet, garage, career and achievements live on the server (Supabase).
 * This file is the game's only door to them. The browser keeps a copy ("mirror") so the
 * game can still draw its screens, but the server is always the boss: after every change
 * the server's answer replaces the copy.
 */
import { getSupabaseClient } from "@/lib/supabase";
import { CAREER_KEY } from "./career";
import { FLEET_KEY } from "./fleet";
import { WALLET_KEY } from "./garageData";
import { normalizeProgression } from "./progression";

export type ServerPlayerState = {
  balance: number;
  selected: string;
  owned: string[];
  upgrades: Record<string, Record<string, number>>;
  progression: Record<string, unknown>;
  career: { unlocked: number; best: Record<string, number> };
  dailyAvailable: boolean;
  /** True for a brand-new account that has not been carried over from this device yet. */
  fresh: boolean;
  isAnonymous: boolean;
  email: string | null;
};

export type WalletStatus = "connecting" | "ready" | "offline";

const OWNER_KEY = "musti-wallet-owner-v1";
const PENDING_KEY = "musti-pending-settles-v1";

/* ---------- pure helpers (tested) ---------- */

export function parseServerState(raw: unknown): ServerPlayerState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const balance = value["balance"];
  const career = value["career"] as Record<string, unknown> | undefined;
  if (typeof balance !== "number" || !Number.isFinite(balance) || balance < 0) return null;
  if (typeof value["selected"] !== "string" || !Array.isArray(value["owned"])) return null;
  const upgrades: Record<string, Record<string, number>> = {};
  if (typeof value["upgrades"] === "object" && value["upgrades"] !== null) {
    for (const [id, levels] of Object.entries(value["upgrades"] as Record<string, unknown>)) {
      if (typeof levels !== "object" || levels === null) continue;
      const clean: Record<string, number> = {};
      for (const [category, level] of Object.entries(levels as Record<string, unknown>)) {
        if (typeof level === "number" && Number.isInteger(level) && level >= 0) clean[category] = level;
      }
      upgrades[id] = clean;
    }
  }
  const best: Record<string, number> = {};
  if (career && typeof career["best"] === "object" && career["best"] !== null) {
    for (const [tier, place] of Object.entries(career["best"] as Record<string, unknown>)) {
      if (typeof place === "number") best[tier] = place;
    }
  }
  return {
    balance,
    selected: value["selected"],
    owned: (value["owned"] as unknown[]).filter((id): id is string => typeof id === "string"),
    upgrades,
    progression:
      typeof value["progression"] === "object" && value["progression"] !== null
        ? (value["progression"] as Record<string, unknown>)
        : {},
    career: {
      unlocked: typeof career?.["unlocked"] === "number" ? (career["unlocked"] as number) : 1,
      best,
    },
    dailyAvailable: value["dailyAvailable"] === true,
    fresh: value["fresh"] === true,
    isAnonymous: value["isAnonymous"] === true,
    email: typeof value["email"] === "string" ? value["email"] : null,
  };
}

/** Turns a server or network error into a sentence a player understands. */
export function friendlyWalletError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/failed to fetch|network|load failed|timeout/i.test(message)) {
    return "No connection to the game server. Check your internet and try again.";
  }
  if (/not enough jaa/i.test(message)) return "Not enough Jaa'izah.";
  if (/rate limit|too many/i.test(message)) return "Too many tries. Please wait a minute and try again.";
  if (/sign in first|jwt|not authenticated/i.test(message)) return "Your session expired. Reload the page and try again.";
  return message || "Something went wrong. Please try again.";
}

/* ---------- state shared with the screens ---------- */

let currentState: ServerPlayerState | null = null;
let currentStatus: WalletStatus = "connecting";
let loading: Promise<ServerPlayerState> | null = null;
const listeners = new Set<(state: ServerPlayerState | null, status: WalletStatus) => void>();

function publish(): void {
  for (const listener of listeners) listener(currentState, currentStatus);
}

export function subscribePlayerState(
  listener: (state: ServerPlayerState | null, status: WalletStatus) => void,
): () => void {
  listeners.add(listener);
  listener(currentState, currentStatus);
  return () => {
    listeners.delete(listener);
  };
}

export const getPlayerState = () => currentState;
export const getWalletStatus = () => currentStatus;

/* ---------- the browser copy ---------- */

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function readJson(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function applyStateToLocal(state: ServerPlayerState, userId: string): void {
  try {
    const previous = readJson(WALLET_KEY) ?? {};
    const previousProgression = (previous["progression"] ?? {}) as Record<string, unknown>;
    const progression = normalizeProgression({
      ...state.progression,
      processedRaceIds: previousProgression["processedRaceIds"] ?? [],
      processedRewardEventIds: previousProgression["processedRewardEventIds"] ?? [],
    });
    localStorage.setItem(
      WALLET_KEY,
      JSON.stringify({
        ...previous,
        username: typeof previous["username"] === "string" ? previous["username"] : "Racer",
        balance: state.balance,
        lastDailyReward: state.dailyAvailable ? "" : todayKey(),
        progression,
        vehicleUpgrades: state.upgrades,
      }),
    );
    const selected = state.owned.includes(state.selected) ? state.selected : (state.owned[0] ?? state.selected);
    localStorage.setItem(FLEET_KEY, JSON.stringify({ owned: state.owned, selected, upgrades: state.upgrades }));
    localStorage.setItem(CAREER_KEY, JSON.stringify(state.career));
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    /* storage full or blocked: the game still works from memory */
  }
}

/* ---------- talking to the server ---------- */

async function currentUserId(): Promise<string> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (session) return session.user.id;
  const { data: anonymous, error } = await supabase.auth.signInAnonymously();
  if (error || !anonymous.session) {
    throw new Error(error?.message ?? "Could not start a guest account.");
  }
  return anonymous.session.user.id;
}

async function rpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc(name, args ?? {});
  if (error) throw new Error(error.message);
  return data;
}

function acceptState(raw: unknown, userId: string): ServerPlayerState {
  const state = parseServerState(raw);
  if (!state) throw new Error("The server sent an unreadable wallet.");
  currentState = state;
  currentStatus = "ready";
  applyStateToLocal(state, userId);
  publish();
  return state;
}

/** Signs in (as an invisible guest if needed), loads the wallet, and carries over old local progress once. */
export function loadPlayerState(): Promise<ServerPlayerState> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const userId = await currentUserId();
      let raw = await rpc("get_player_state");
      let state = parseServerState(raw);
      const wallet = readJson(WALLET_KEY);
      // First time on the server and this browser has progress from before: carry it over once.
      if (state?.fresh && wallet && !localStorage.getItem(OWNER_KEY)) {
        const fleet = readJson(FLEET_KEY);
        const career = readJson(CAREER_KEY);
        raw = await rpc("import_local_player", {
          p_balance: typeof wallet["balance"] === "number" ? Math.floor(wallet["balance"]) : 0,
          p_owned: Array.isArray(fleet?.["owned"]) ? fleet["owned"] : [],
          p_upgrades: (fleet?.["upgrades"] as object | undefined) ?? {},
          p_progression: (wallet["progression"] as object | undefined) ?? {},
          p_selected: typeof fleet?.["selected"] === "string" ? fleet["selected"] : "musti-gt",
          p_career: career ?? {},
        });
        state = parseServerState(raw);
      }
      return acceptState(raw, userId);
    } catch (error) {
      currentStatus = "offline";
      publish();
      throw error;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Re-reads the wallet (after an online race, for example). Never throws. */
export async function refreshPlayerState(): Promise<void> {
  try {
    const userId = await currentUserId();
    acceptState(await rpc("get_player_state"), userId);
  } catch {
    /* keep showing the last known wallet */
  }
}

async function change(name: string, args: Record<string, unknown>): Promise<ServerPlayerState> {
  const userId = await currentUserId();
  return acceptState(await rpc(name, args), userId);
}

export const buyVehicleServer = (vehicleId: string) => change("buy_vehicle", { p_vehicle_id: vehicleId });
export const selectVehicleServer = (vehicleId: string) => change("select_vehicle", { p_vehicle_id: vehicleId });
export const claimDailyServer = () => change("claim_daily_reward", {});
export const buyUpgradeServer = (vehicleId: string, category: string, expectedLevel: number) =>
  change("buy_upgrade", { p_vehicle_id: vehicleId, p_category: category, p_expected_level: expectedLevel });

/* ---------- races ---------- */

type RaceStats = { score: number; distance: number; time: number; coins: number; nearMisses: number };
type PendingJob =
  | { type: "race"; raceId: string; stats: RaceStats }
  | { type: "career"; raceId: string; tier: string; place: number; time: number };

function readPending(): PendingJob[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as PendingJob[]).slice(-20) : [];
  } catch {
    return [];
  }
}

function writePending(jobs: PendingJob[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(jobs.slice(-20)));
  } catch {
    /* ignore */
  }
}

/** Tells the server a race has started, so it knows how much real time passes. Never throws. */
export async function beginRaceServer(raceId: string, kind: "solo" | "career" | "online", tier: string | null): Promise<boolean> {
  try {
    await currentUserId();
    await rpc("begin_race", { p_race_id: raceId, p_kind: kind, p_tier: tier });
    return true;
  } catch {
    return false;
  }
}

async function runJob(job: PendingJob): Promise<unknown> {
  if (job.type === "race") {
    return rpc("settle_race", {
      p_race_id: job.raceId,
      p_score: Math.floor(job.stats.score),
      p_distance: job.stats.distance,
      p_time: job.stats.time,
      p_coins: Math.floor(job.stats.coins),
      p_near_misses: Math.floor(job.stats.nearMisses),
    });
  }
  return rpc("settle_career", { p_race_id: job.raceId, p_tier: job.tier, p_place: job.place, p_time: job.time });
}

/** Sends what happened in a race. If the connection is down the result is kept and sent later. */
async function settle(job: PendingJob): Promise<Record<string, unknown> | null> {
  try {
    const userId = await currentUserId();
    const result = (await runJob(job)) as Record<string, unknown> | null;
    if (result && typeof result === "object") acceptState(result["state"], userId);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unknown_race|not believable|still locked/i.test(message)) return null; // will never be accepted
    writePending([...readPending(), job]);
    return null;
  }
}

export async function settleRaceServer(raceId: string, stats: RaceStats) {
  const result = await settle({ type: "race", raceId, stats });
  return result
    ? {
        earned: Number(result["earned"] ?? 0),
        unlockedNow: Array.isArray(result["unlockedNow"]) ? (result["unlockedNow"] as string[]) : [],
      }
    : null;
}

export async function settleCareerServer(raceId: string, tier: string, place: number, time: number) {
  const result = await settle({ type: "career", raceId, tier, place, time });
  return result ? { prize: Number(result["prize"] ?? 0), unlockedNext: result["unlockedNext"] === true } : null;
}

/** Sends results that could not be sent earlier (for example because the phone was offline). */
export async function flushPendingSettles(): Promise<void> {
  const jobs = readPending();
  if (jobs.length === 0) return;
  writePending([]);
  for (const job of jobs) await settle(job);
}

/* ---------- accounts: save progress / log in / log out ---------- */

export type AuthMode = "save" | "login";

function authMessage(error: { message: string; status?: number }): string {
  if (error.status === 429 || /rate limit|too many/i.test(error.message)) return "Too many tries. Please wait a minute and try again.";
  if (/already|registered|exists/i.test(error.message)) return "That email already has an account. Use \"Log in\" instead.";
  if (/expired|invalid|token/i.test(error.message)) return "That code is wrong or has expired. Ask for a new one.";
  if (/smtp|email.*(send|provider)|error sending/i.test(error.message)) return "We could not send the email. Please try again in a minute.";
  if (/signups? not allowed|not found/i.test(error.message)) return "No account was found for that email.";
  return error.message || "Something went wrong. Please try again.";
}

/** Sends a 6-digit code. "save" adds the email to this device's account, "login" opens an existing account. */
export async function sendAccountCode(mode: AuthMode, email: string): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = getSupabaseClient();
    const clean = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, message: "Enter a valid email address." };
    if (mode === "save") {
      const { error } = await supabase.auth.updateUser({ email: clean });
      if (error) return { ok: false, message: authMessage(error) };
    } else {
      const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
      if (error) return { ok: false, message: authMessage(error) };
    }
    return { ok: true, message: `We sent a code to ${clean}.` };
  } catch (error) {
    return { ok: false, message: friendlyWalletError(error) };
  }
}

export async function verifyAccountCode(mode: AuthMode, email: string, code: string): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: mode === "save" ? "email_change" : "email",
    });
    if (error) return { ok: false, message: authMessage(error) };
    await refreshPlayerState();
    return { ok: true, message: mode === "save" ? "Your progress is saved to this email." : "Welcome back! Your progress is loaded." };
  } catch (error) {
    return { ok: false, message: friendlyWalletError(error) };
  }
}

/** Logs out and starts a fresh guest account on this device. */
export async function signOutToNewGuest(): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
  try {
    localStorage.removeItem(OWNER_KEY);
    localStorage.removeItem(WALLET_KEY);
    localStorage.removeItem(FLEET_KEY);
    localStorage.removeItem(CAREER_KEY);
  } catch {
    /* ignore */
  }
  currentState = null;
  currentStatus = "connecting";
  publish();
  await loadPlayerState();
}

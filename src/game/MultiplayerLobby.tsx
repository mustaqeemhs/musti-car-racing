import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { raceCountdownSeconds } from "./multiplayerState";
import { isValidUsername, normalizeUsername } from "./username";

type Room = {
  id: string;
  room_code: string;
  host_id: string;
  max_players: number;
  status: "waiting" | "racing";
  starts_at: string | null;
  is_public: boolean;
  created_at: string;
};

type Member = {
  userId: string;
  username: string;
  seat: number;
  ready: boolean;
};

type OpenRoom = Pick<Room, "id" | "room_code" | "host_id" | "max_players" | "created_at">;

export type MultiplayerRaceStart = {
  roomId: string;
  startAt: number;
  seat: number;
};

type MultiplayerLobbyProps = {
  onRaceStart: (start: MultiplayerRaceStart) => void;
  onBack: () => void;
};

export function MultiplayerLobby({ onRaceStart, onBack }: MultiplayerLobbyProps) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [configurationError, setConfigurationError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [profileUsername, setProfileUsername] = useState("");
  const [username, setUsername] = useState("musti");
  const [editingUsername, setEditingUsername] = useState(false);
  const [email, setEmail] = useState("");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [authMessage, setAuthMessage] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "reconnecting" | "offline"
  >("connecting");
  const [countdown, setCountdown] = useState<number | null>(null);
  const startedRoomRef = useRef("");
  const authRequestInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    try {
      const supabase = getSupabaseClient();
      setClient(supabase);
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (active) {
          setSession(nextSession);
        }
      });
      void supabase.auth.getSession().then(({ data: sessionData, error: sessionError }) => {
        if (!active) return;
        if (sessionError) {
          setError(sessionError.message);
          setConnection("offline");
        } else {
          setSession(sessionData.session);
          setConnection("connected");
        }
        setLoading(false);
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    } catch (caught) {
      setConfigurationError(
        caught instanceof Error ? caught.message : "Supabase configuration is unavailable.",
      );
      setConnection("offline");
      setLoading(false);
      return () => {
        active = false;
      };
    }
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!client || !session?.user.id) {
      setProfileUsername("");
      return;
    }

    let active = true;
    setLoading(true);
    void client
      .from("multiplayer_profiles")
      .select("username")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error: profileError }) => {
        if (!active) return;
        if (profileError) {
          setError(profileError.message);
          setConnection("offline");
        } else if (data?.username) {
          setProfileUsername(data.username);
          setUsername(data.username);
          setEditingUsername(false);
        } else {
          setProfileUsername("");
          setUsername("musti");
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [client, session?.user.id]);

  const refreshOpenRooms = useCallback(async () => {
    if (!client || !profileUsername) return;
    const { error: cleanupError } = await client.rpc("cleanup_expired_multiplayer_rooms");
    if (cleanupError) {
      setError(cleanupError.message);
      setConnection("offline");
      return;
    }
    const { data, error: roomsError } = await client
      .from("multiplayer_rooms")
      .select("id, room_code, host_id, max_players, created_at")
      .eq("status", "waiting")
      .eq("is_public", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    if (roomsError) {
      setError(roomsError.message);
      setConnection("offline");
      return;
    }
    setOpenRooms((data ?? []) as OpenRoom[]);
    setConnection("connected");
  }, [client, profileUsername]);

  const refreshRoom = useCallback(
    async (id: string) => {
      if (!client) return;
      const { data: roomData, error: roomError } = await client
        .from("multiplayer_rooms")
        .select("id, room_code, host_id, max_players, status, starts_at, is_public, created_at")
        .eq("id", id)
        .maybeSingle();
      if (roomError) {
        setError(roomError.message);
        setConnection("offline");
        return;
      }
      if (!roomData) {
        setRoom(null);
        setRoomId("");
        setMembers([]);
        setError("This room has closed or expired.");
        return;
      }

      const { data: memberRows, error: memberError } = await client
        .from("multiplayer_room_members")
        .select("user_id, seat, ready")
        .eq("room_id", id)
        .order("seat");
      if (memberError) {
        setError(memberError.message);
        setConnection("offline");
        return;
      }
      const userIds = (memberRows ?? []).map((member) => member.user_id);
      const { data: profiles, error: profilesError } = userIds.length
        ? await client.from("multiplayer_profiles").select("id, username").in("id", userIds)
        : { data: [], error: null };
      if (profilesError) {
        setError(profilesError.message);
        setConnection("offline");
        return;
      }
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));
      const nextMembers = (memberRows ?? []).map((member) => ({
        userId: member.user_id,
        username: names.get(member.user_id) ?? "Driver",
        seat: member.seat,
        ready: member.ready,
      }));

      setRoom(roomData as Room);
      setMembers(nextMembers);
      setConnection("connected");
    },
    [client],
  );

  useEffect(() => {
    if (!profileUsername) return;
    void refreshOpenRooms();
    const timer = window.setInterval(() => void refreshOpenRooms(), 15000);
    return () => window.clearInterval(timer);
  }, [profileUsername, refreshOpenRooms]);

  useEffect(() => {
    if (!client || !profileUsername || !session?.user.id) return;
    let active = true;
    void client
      .from("multiplayer_room_members")
      .select("room_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data, error: membershipError }) => {
        if (!active) return;
        if (membershipError) {
          setError(membershipError.message);
          setConnection("offline");
        } else if (data?.room_id) {
          setRoomId(data.room_id);
        }
      });
    return () => {
      active = false;
    };
  }, [client, profileUsername, session?.user.id]);

  useEffect(() => {
    if (!client || !roomId) return;
    let active = true;
    setConnection("connecting");
    void refreshRoom(roomId);
    const channel = client
      .channel(`multiplayer-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "multiplayer_rooms", filter: `id=eq.${roomId}` },
        () => void refreshRoom(roomId),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "multiplayer_room_members",
          filter: `room_id=eq.${roomId}`,
        },
        () => void refreshRoom(roomId),
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          setConnection("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("reconnecting");
        }
      });
    const poll = window.setInterval(() => void refreshRoom(roomId), 3000);
    const heartbeat = window.setInterval(() => {
      void client.rpc("touch_multiplayer_room", { p_room_id: roomId }).then(({ error }) => {
        if (!active || !error) return;
        setError(error.message);
        setConnection("reconnecting");
      });
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      void client.removeChannel(channel);
    };
  }, [client, refreshRoom, roomId]);

  const mine = members.find((member) => member.userId === session?.user.id);
  useEffect(() => {
    if (!room || room.status !== "racing" || !room.starts_at || !mine) {
      if (room?.status === "waiting") startedRoomRef.current = "";
      setCountdown(null);
      return;
    }
    const startAt = Date.parse(room.starts_at);
    if (!Number.isFinite(startAt)) {
      setError("The room returned an invalid race start time.");
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, startAt - Date.now());
      setCountdown(raceCountdownSeconds(startAt));
      if (remaining === 0 && startedRoomRef.current !== room.id) {
        startedRoomRef.current = room.id;
        onRaceStart({ roomId: room.id, startAt, seat: mine.seat });
      }
    };
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [mine, onRaceStart, room]);

  async function requestEmailCode() {
    if (!client || busy || authRequestInFlight.current || resendCooldown > 0) return;
    authRequestInFlight.current = true;
    setBusy(true);
    setError("");
    setAuthMessage("");
    let cooldownRequired = false;
    try {
      const { error: signInError } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (signInError) {
        setError(emailOtpErrorMessage(signInError, false));
        cooldownRequired = shouldCooldownAfterOtpError(signInError);
        return;
      }
      cooldownRequired = true;
      setEmailCodeSent(true);
      setEmailCode("");
      setAuthMessage(`A verification code was sent to ${email.trim()}.`);
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error("Unexpected error");
      setError(emailOtpErrorMessage(error, false));
      cooldownRequired = isOtpNetworkError(error);
    } finally {
      if (cooldownRequired) setResendCooldown(60);
      authRequestInFlight.current = false;
      setBusy(false);
    }
  }

  async function verifyEmailCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy || authRequestInFlight.current) return;
    authRequestInFlight.current = true;
    setBusy(true);
    setError("");
    setAuthMessage("");
    try {
      const { data, error: verifyError } = await client.auth.verifyOtp({
        email: email.trim(),
        token: emailCode.trim(),
        type: "email",
      });
      if (verifyError) {
        setError(emailOtpErrorMessage(verifyError, true));
        return;
      }
      if (!data.session) {
        setError("Email verification did not start a session. Request a new code and try again.");
        return;
      }
      setAuthMessage("Email verified. You are signed in securely.");
      setLoading(true);
      setSession(data.session);
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error("Unexpected error");
      setError(emailOtpErrorMessage(error, true));
    } finally {
      authRequestInFlight.current = false;
      setBusy(false);
    }
  }

  function shouldCooldownAfterOtpError(
    error: { message: string; status?: number | null | undefined; name?: string },
  ): boolean {
    return (
      error.status === 429 ||
      (typeof error.status === "number" && error.status >= 500) ||
      isOtpNetworkError(error)
    );
  }

  function isOtpNetworkError(
    error: { message: string; status?: number | null | undefined; name?: string },
  ): boolean {
    const message = error.message.toLowerCase();
    return (
      error.status === 0 ||
      error.name === "AuthRetryableFetchError" ||
      message.includes("network") ||
      message.includes("fetch")
    );
  }

  function emailOtpErrorMessage(
    error: { message: string; status?: number | null | undefined; name?: string },
    verifying: boolean,
  ): string {
    if (error.status === 429) {
      return "Supabase rate limit reached (HTTP 429). Wait before requesting another code; check the project's Auth rate limits and email-provider quota if this continues.";
    }
    const message = error.message.toLowerCase();
    if (error.status === 401 || error.status === 403) {
      return "Supabase rejected the project credentials. Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY belong to the same project and restart the app.";
    }
    if (error.status === 404) {
      return "Supabase Auth endpoint was not found. Check that VITE_SUPABASE_URL is the project's API URL.";
    }
    if (typeof error.status === "number" && error.status >= 500) {
      return "Supabase Auth or its email provider returned a server error. Check Supabase Auth logs, SMTP/provider configuration, and the email template before retrying.";
    }
    if (error.status === 0 || error.name === "AuthRetryableFetchError" || message.includes("network") || message.includes("fetch")) {
      return `Could not reach Supabase Auth while ${verifying ? "verifying the code" : "requesting a code"}. Check the Supabase project URL and network connectivity.`;
    }
    if (
      /unsupported provider|email provider.{0,24}(disabled|not enabled)|(disabled|not enabled).{0,24}email provider/.test(
        message,
      )
    ) {
      return "Email sign-in is disabled in this Supabase project. Enable the Email provider under Authentication → Providers, then retry.";
    }
    if (error.status === 400 && verifying) {
      return "That code is invalid or expired. Check the code and request a new one if needed.";
    }
    if (
      !verifying &&
      /smtp|template|provider|email delivery|sending email|email sending/.test(message)
    ) {
      return "Supabase rejected email delivery. Check that the Email provider is enabled, SMTP is configured, and the email template includes {{ .Token }}.";
    }
    if (error.status === 400 || error.status === 422) {
      return verifying
        ? "Supabase rejected the verification request. Check the email and code, then request a new code if needed."
        : "Supabase rejected the email request. Check the email address and Email provider configuration.";
    }
    return `Supabase Auth could not ${verifying ? "verify this code" : "send a verification code"}${typeof error.status === "number" ? ` (HTTP ${error.status})` : ""}. Check the project configuration and Auth logs.`;
  }

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const displayName = normalizeUsername(username);
    if (!isValidUsername(displayName)) {
      setError("Choose a username between 3 and 18 characters.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: usernameError } = await client.rpc("set_multiplayer_username", {
      p_username: displayName,
    });
    setBusy(false);
    if (usernameError) {
      setError(
        usernameError.code === "23505"
          ? "That username is already taken. Choose another username."
          : usernameError.message || "Could not save the online username.",
      );
      return;
    }
    if (!data?.username) {
      setError("The server did not confirm your username. Please try again.");
      return;
    }
    setProfileUsername(data.username);
    setUsername(data.username);
    setEditingUsername(false);
  }

  async function createRoom() {
    if (!client) return;
    setBusy(true);
    setError("");
    const { data, error: createError } = await client.rpc("create_multiplayer_room", {
      p_max_players: 4,
      p_is_public: true,
    });
    setBusy(false);
    if (createError) {
      setError(createError.message || "Could not create a room.");
      return;
    }
    if (!data?.id) {
      setError("The server did not return a room after creation.");
      return;
    }
    setRoomCode(data.room_code);
    setRoomId(data.id);
  }

  async function joinRoom(code: string) {
    if (!client) return;
    setBusy(true);
    setError("");
    const { data, error: joinError } = await client.rpc("join_multiplayer_room", {
      p_room_code: code.trim().toUpperCase(),
    });
    setBusy(false);
    if (joinError) {
      setError(joinError.message);
      return;
    }
    if (typeof data !== "string") {
      setError("The server did not return a room after joining.");
      return;
    }
    setRoomId(data);
  }

  async function toggleReady() {
    if (!client || !room || !mine) return;
    setBusy(true);
    setError("");
    const { error: readyError } = await client.rpc("set_multiplayer_ready", {
      p_room_id: room.id,
      p_ready: !mine.ready,
    });
    setBusy(false);
    if (readyError) {
      setError(readyError.message);
      return;
    }
    await refreshRoom(room.id);
  }

  async function startRace() {
    if (!client || !room) return;
    setBusy(true);
    setError("");
    const { error: startError } = await client.rpc("start_multiplayer_room", {
      p_room_id: room.id,
    });
    setBusy(false);
    if (startError) {
      setError(startError.message);
      return;
    }
    await refreshRoom(room.id);
  }

  async function leaveRoom() {
    if (!client || !room) return;
    setBusy(true);
    setError("");
    const { error: leaveError } = await client.rpc("leave_multiplayer_room", {
      p_room_id: room.id,
    });
    setBusy(false);
    if (leaveError) {
      setError(leaveError.message);
      return;
    }
    setRoomId("");
    setRoom(null);
    setMembers([]);
    startedRoomRef.current = "";
    await refreshOpenRooms();
  }

  if (configurationError) {
    return (
      <section className="multiplayer-panel">
        <p className="note note-warn" role="alert">
          {configurationError}
        </p>
        <p className="note">
          Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then apply the multiplayer
          migration.
        </p>
        <button className="cta" onClick={onBack}>
          BACK
        </button>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="multiplayer-panel">
        {authMessage && (
          <p className="note" role="status">
            {authMessage}
          </p>
        )}
        <p className="note" role="status">
          Connecting to online services…
        </p>
        <button className="cta" onClick={onBack}>
          BACK
        </button>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="multiplayer-panel">
        <p className="note">
          Online play requires a verified sign-in. Your guest wallet, vehicle ownership, upgrades,
          and achievements stay separate and are never uploaded or overwritten.
        </p>
        {!emailCodeSent ? (
          <form
            className="multiplayer-form"
            onSubmit={(event) => {
              event.preventDefault();
              void requestEmailCode();
            }}
          >
            <label className="field">
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <button
              className="btn-secondary"
              disabled={busy || resendCooldown > 0}
              type="submit"
            >
              {busy
                ? "SENDING CODE…"
                : resendCooldown > 0
                  ? `WAIT ${resendCooldown}s`
                  : "EMAIL ME A CODE"}
            </button>
          </form>
        ) : (
          <>
            <p className="note">Enter the verification code sent to {email.trim()}.</p>
            <form className="multiplayer-form" onSubmit={verifyEmailCode}>
              <label className="field">
                Email verification code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={emailCode}
                  onChange={(event) =>
                    setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                  required
                />
              </label>
              <button className="btn-secondary" disabled={busy || !emailCode.trim()} type="submit">
                {busy ? "VERIFYING…" : "VERIFY CODE"}
              </button>
            </form>
            <div className="multiplayer-actions">
              <button
                className="btn-secondary"
                disabled={busy || resendCooldown > 0}
                onClick={() => void requestEmailCode()}
                type="button"
              >
                {busy
                  ? "PLEASE WAIT…"
                  : resendCooldown > 0
                    ? `RESEND IN ${resendCooldown}s`
                    : "RESEND CODE"}
              </button>
              <button
                className="ghost-btn"
                disabled={busy}
                onClick={() => {
                  setEmailCodeSent(false);
                  setEmailCode("");
                  setError("");
                  setAuthMessage("");
                }}
                type="button"
              >
                CHANGE EMAIL
              </button>
            </div>
          </>
        )}
        {!emailCodeSent && resendCooldown > 0 && (
          <p className="note" role="status">
            Please wait {resendCooldown} seconds before requesting another code.
          </p>
        )}
        {authMessage && (
          <p className="note" role="status">
            {authMessage}
          </p>
        )}
        {error && (
          <p className="note note-warn" role="alert">
            {error}
          </p>
        )}
        <p className="note">
          The multiplayer identity uses Supabase Auth. It does not link or migrate your local guest
          save.
        </p>
        <button className="cta" onClick={onBack}>
          BACK
        </button>
      </section>
    );
  }

  if (!profileUsername || editingUsername) {
    return (
      <section className="multiplayer-panel">
        <p className="note">
          Choose a globally unique online username. Names are trimmed, repeated spaces are
          collapsed, and comparisons ignore capitalization.
        </p>
        <form className="multiplayer-form" onSubmit={saveUsername}>
          <label className="field">
            Online username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              maxLength={18}
              autoComplete="nickname"
              required
            />
          </label>
          <button className="btn-secondary" disabled={busy} type="submit">
            {busy ? "SAVING…" : "SAVE USERNAME"}
          </button>
          {profileUsername && (
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                setUsername(profileUsername);
                setEditingUsername(false);
                setError("");
              }}
              type="button"
            >
              CANCEL
            </button>
          )}
        </form>
        {error && (
          <p className="note note-warn" role="alert">
            {error}
          </p>
        )}
        <button className="cta" onClick={onBack}>
          BACK
        </button>
      </section>
    );
  }

  return (
    <section className="multiplayer-panel">
      <div className="multiplayer-status" role="status">
        <span className={`connection-dot connection-${connection}`} />
        {connection === "connected"
          ? "ONLINE"
          : connection === "reconnecting"
            ? "RECONNECTING…"
            : connection === "offline"
              ? "CONNECTION LOST"
              : "CONNECTING…"}
      </div>
      <p className="note">
        Online as <strong>{profileUsername}</strong> · guest wallet and progression remain local.
      </p>
      {!room ? (
        <>
          <div className="multiplayer-actions">
            <button className="btn-secondary" disabled={busy} onClick={() => void createRoom()}>
              {busy ? "PLEASE WAIT…" : "CREATE ROOM"}
            </button>
            <form
              className="multiplayer-join"
              onSubmit={(event) => {
                event.preventDefault();
                void joinRoom(roomCode);
              }}
            >
              <label className="field">
                Room code
                <input
                  className="code-input"
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  maxLength={12}
                  autoCapitalize="characters"
                  required
                />
              </label>
              <button className="btn-secondary" disabled={busy} type="submit">
                JOIN
              </button>
            </form>
          </div>
          <h3 className="hud-label mt-4">OPEN ROOMS</h3>
          {openRooms.length ? (
            <ul className="multiplayer-room-list">
              {openRooms.map((openRoom) => (
                <li key={openRoom.id}>
                  <span>
                    {openRoom.room_code} · {openRoom.max_players} players max
                  </span>
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => void joinRoom(openRoom.room_code)}
                  >
                    JOIN
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">No open rooms yet. Create one and share its code with friends.</p>
          )}
          <button className="ghost-btn" onClick={() => setEditingUsername(true)}>
            CHANGE USERNAME
          </button>
          <button className="cta" onClick={onBack}>
            BACK
          </button>
        </>
      ) : (
        <>
          {room && (
            <>
              <div className="multiplayer-room-heading">
                <div>
                  <span className="hud-label">ROOM CODE</span>
                  <strong>{room.room_code}</strong>
                </div>
                <div>
                  <span className="hud-label">STATUS</span>
                  <strong>{room.status === "waiting" ? "WAITING" : "RACE STARTING"}</strong>
                </div>
                <div>
                  <span className="hud-label">PLAYERS</span>
                  <strong>
                    {members.length} / {room.max_players}
                  </strong>
                </div>
              </div>
              <ul className="multiplayer-members">
                {members.map((member) => (
                  <li key={member.userId}>
                    <span>
                      {member.username}
                      {member.userId === room.host_id ? " · HOST" : ""}
                    </span>
                    <span>
                      {member.userId === session.user.id ? "YOU · " : ""}
                      {member.ready ? "READY" : "NOT READY"}
                    </span>
                  </li>
                ))}
              </ul>
              {room.status === "waiting" ? (
                <div className="multiplayer-actions">
                  <button
                    className="btn-secondary"
                    disabled={busy || !mine}
                    onClick={() => void toggleReady()}
                  >
                    {mine?.ready ? "NOT READY" : "READY"}
                  </button>
                  {room.host_id === session.user.id && (
                    <button
                      className="cta"
                      disabled={
                        busy || members.length < 2 || members.some((member) => !member.ready)
                      }
                      onClick={() => void startRace()}
                    >
                      START RACE
                    </button>
                  )}
                  <button className="ghost-btn" disabled={busy} onClick={() => void leaveRoom()}>
                    LEAVE ROOM
                  </button>
                </div>
              ) : (
                <div className="multiplayer-actions">
                  <p className="note" role="status">
                    {countdown === null
                      ? "Waiting for the shared race countdown…"
                      : `Race starts in ${countdown}…`}
                  </p>
                  <button className="ghost-btn" disabled={busy} onClick={() => void leaveRoom()}>
                    LEAVE ROOM
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p className="note note-warn" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

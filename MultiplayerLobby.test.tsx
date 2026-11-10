import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiplayerLobby } from "./MultiplayerLobby";

const { authMock, fromMock, getClientMock, maybeSingleMock } = vi.hoisted(() => {
  const authMock = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
  };
  const getClientMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: maybeSingleMock,
  };
  const fromMock = vi.fn(() => query);
  return { authMock, fromMock, getClientMock, maybeSingleMock };
});

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => getClientMock(),
}));

describe("MultiplayerLobby email-code authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientMock.mockReturnValue({ auth: authMock, from: fromMock });
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    authMock.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    authMock.signInWithOtp.mockResolvedValue({ error: null });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => cleanup());

  it("requests an email code without a redirect and verifies it in the same screen", async () => {
    const session = { user: { id: "authenticated-user" } };
    authMock.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    render(<MultiplayerLobby onRaceStart={vi.fn()} onBack={vi.fn()} vehicleId="musti-gt" paint="#ffffff" />);

    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "driver@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "EMAIL ME A CODE" }));

    await waitFor(() =>
      expect(authMock.signInWithOtp).toHaveBeenCalledWith({
        email: "driver@example.com",
        options: { shouldCreateUser: true },
      }),
    );
    expect(await screen.findByLabelText("Email verification code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /RESEND IN/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Email verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "VERIFY CODE" }));

    await waitFor(() =>
      expect(authMock.verifyOtp).toHaveBeenCalledWith({
        email: "driver@example.com",
        token: "123456",
        type: "email",
      }),
    );
    expect(await screen.findByLabelText("Online username")).toBeInTheDocument();
  });

  it("shows a sending state and makes only one request while the send is pending", async () => {
    let finishRequest: ((result: { error: null }) => void) | undefined;
    authMock.signInWithOtp.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );
    render(<MultiplayerLobby onRaceStart={vi.fn()} onBack={vi.fn()} vehicleId="musti-gt" paint="#ffffff" />);

    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "driver@example.com" },
    });
    const sendButton = screen.getByRole("button", { name: "EMAIL ME A CODE" });
    const form = sendButton.closest("form");
    if (!form) throw new Error("Email-code request form was not rendered");
    fireEvent.submit(form);

    expect(await screen.findByRole("button", { name: "SENDING CODE…" })).toBeDisabled();
    fireEvent.submit(form);
    expect(authMock.signInWithOtp).toHaveBeenCalledTimes(1);

    finishRequest?.({ error: null });
    expect(await screen.findByLabelText("Email verification code")).toBeInTheDocument();
  });

  it("shows invalid or expired code errors without leaving the verification form", async () => {
    authMock.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: "Token has expired or is invalid", status: 400 },
    });
    render(<MultiplayerLobby onRaceStart={vi.fn()} onBack={vi.fn()} vehicleId="musti-gt" paint="#ffffff" />);

    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "driver@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "EMAIL ME A CODE" }));
    const codeInput = await screen.findByLabelText("Email verification code");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "VERIFY CODE" }));

    expect(
      await screen.findByText(/That code is invalid or expired/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email verification code")).toBeInTheDocument();
  });

  it("distinguishes Supabase rate limits from network and configuration errors", async () => {
    authMock.signInWithOtp.mockResolvedValue({
      error: { message: "Email rate limit exceeded", status: 429 },
    });
    render(<MultiplayerLobby onRaceStart={vi.fn()} onBack={vi.fn()} vehicleId="musti-gt" paint="#ffffff" />);

    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "driver@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "EMAIL ME A CODE" }));

    expect(await screen.findByText(/Supabase rate limit reached \(HTTP 429\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /WAIT 60s/ })).toBeDisabled();
    expect(authMock.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("reports transport failures separately from invalid project credentials", async () => {
    authMock.signInWithOtp.mockRejectedValueOnce(
      Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError" }),
    );
    const { unmount } = render(
      <MultiplayerLobby onRaceStart={vi.fn()} onBack={vi.fn()} vehicleId="musti-gt" paint="#ffffff" />,
    );
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "driver@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "EMAIL ME A CODE" }));
    expect(await screen.findByText(/Could not reach Supabase Auth/)).toBeInTheDocument();
    unmount();

    authMock.signInWithOtp.mockResolvedValue({
      error: { message: "Invalid API key", status: 401 },
    });
    render(<MultiplayerLobby onRaceStart={vi.fn()} onBack={vi.fn()} vehicleId="musti-gt" paint="#ffffff" />);
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "driver@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "EMAIL ME A CODE" }));
    expect(await screen.findByText(/Supabase rejected the project credentials/)).toBeInTheDocument();
  });

  it("reports missing project configuration without attempting authentication", async () => {
    getClientMock.mockImplementationOnce(() => {
      throw new Error("Supabase is not configured. Check the environment variables.");
    });

    render(<MultiplayerLobby onRaceStart={vi.fn()} onBack={vi.fn()} vehicleId="musti-gt" paint="#ffffff" />);

    expect(
      await screen.findByText(/Supabase is not configured\. Check the environment variables\./),
    ).toBeInTheDocument();
    expect(authMock.signInWithOtp).not.toHaveBeenCalled();
  });

  it("reports disabled Email authentication and SMTP/provider failures distinctly", async () => {
    authMock.signInWithOtp.mockResolvedValueOnce({
      error: { message: "Unsupported provider: email", status: 422 },
    });
    const { unmount } = render(
      <MultiplayerLobby onRaceStart={vi.fn()} onBack={vi.fn()} vehicleId="musti-gt" paint="#ffffff" />,
    );
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "driver@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "EMAIL ME A CODE" }));
    expect(
      await screen.findByText(/Email sign-in is disabled in this Supabase project/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Email verification code")).not.toBeInTheDocument();
    unmount();

    authMock.signInWithOtp.mockResolvedValueOnce({
      error: { message: "SMTP provider rejected the message", status: 500 },
    });
    render(<MultiplayerLobby onRaceStart={vi.fn()} onBack={vi.fn()} vehicleId="musti-gt" paint="#ffffff" />);
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "driver@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "EMAIL ME A CODE" }));
    expect(await screen.findByText(/email provider returned a server error/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email verification code")).not.toBeInTheDocument();
  });
});

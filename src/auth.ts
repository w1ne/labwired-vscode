// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.
//
// Optional "Sign in to LabWired" via LabWired's own OAuth 2.1 authorization
// server (Clerk-backed). This is entirely opt-in and unlocks HOSTED features
// only — running the simulator locally is free and never touches this code.

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';

export const AUTH_ID = 'labwired';
export const AUTH_LABEL = 'LabWired';
export const SCOPES = ['email', 'offline_access', 'profile'];

const DEFAULT_API_URL = 'https://api.labwired.com';
// vscode://<publisher>.<extension name>/auth-callback
const REDIRECT_URI = 'vscode://w1ne.labwired-vscode/auth-callback';
const SECRET_KEY = 'labwired.auth.sessions';
const CLIENT_ID_KEY_PREFIX = 'labwired.oauth.clientId:';
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const REFRESH_SKEW_MS = 60 * 1000;

interface DiscoveryDoc {
    authorization_endpoint: string;
    token_endpoint: string;
    revocation_endpoint?: string;
    registration_endpoint: string;
}

interface StoredSession {
    session: vscode.AuthenticationSession;
    refreshToken?: string;
    expiresAt?: number; // epoch ms
}

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
}

interface HttpResult {
    status: number;
    body: string;
}

function apiUrl(): string {
    const configured = vscode.workspace.getConfiguration('labwired').get<string>('apiUrl');
    const trimmed = configured && configured.trim().length > 0 ? configured.trim() : DEFAULT_API_URL;
    return trimmed.replace(/\/+$/, '');
}

function base64url(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Low-level HTTP(S) request returning the raw body. No secrets are ever logged here.
function httpRequest(
    method: string,
    urlStr: string,
    headers: Record<string, string>,
    body?: string
): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
        let url: URL;
        try {
            url = new URL(urlStr);
        } catch (e) {
            reject(new Error(`Invalid URL: ${urlStr}`));
            return;
        }
        const transport = url.protocol === 'http:' ? http : https;
        const options: https.RequestOptions = {
            method,
            hostname: url.hostname,
            port: url.port || undefined,
            path: `${url.pathname}${url.search}`,
            headers: { 'User-Agent': 'labwired-vscode', ...headers },
        };
        const req = transport.request(options, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
                resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
            });
        });
        req.on('error', reject);
        if (body !== undefined) {
            req.write(body);
        }
        req.end();
    });
}

async function getJson<T>(method: string, urlStr: string, headers: Record<string, string>, body?: string): Promise<T> {
    const res = await httpRequest(method, urlStr, headers, body);
    if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status} for ${new URL(urlStr).pathname}`);
    }
    try {
        return JSON.parse(res.body) as T;
    } catch {
        throw new Error(`Malformed JSON from ${new URL(urlStr).pathname}`);
    }
}

let activeProvider: LabwiredAuthProvider | undefined;

export class LabwiredAuthProvider implements vscode.AuthenticationProvider {
    private readonly _onDidChangeSessions =
        new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    readonly onDidChangeSessions = this._onDidChangeSessions.event;

    // Discovery is cached per apiUrl for the extension-host lifetime.
    private discoveryCache = new Map<string, DiscoveryDoc>();

    // Pending authorize flows keyed by the OAuth `state` value.
    private pending = new Map<string, { resolve: (code: string) => void; reject: (err: Error) => void }>();

    readonly uriHandlerRegistration: vscode.Disposable;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly output: vscode.OutputChannel
    ) {
        this.uriHandlerRegistration = vscode.window.registerUriHandler({
            handleUri: (uri: vscode.Uri) => this.handleUri(uri),
        });
        activeProvider = this;
    }

    dispose(): void {
        this.uriHandlerRegistration.dispose();
        this._onDidChangeSessions.dispose();
        if (activeProvider === this) {
            activeProvider = undefined;
        }
    }

    private log(msg: string): void {
        this.output.appendLine(`LabWired [auth]: ${msg}`);
    }

    // --- vscode.AuthenticationProvider ---------------------------------------

    async getSessions(scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]> {
        const stored = await this.loadStored();
        if (!scopes || scopes.length === 0) {
            return stored.map((s) => s.session);
        }
        return stored
            .filter((s) => scopes.every((scope) => s.session.scopes.includes(scope)))
            .map((s) => s.session);
    }

    async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
        this.log('Signing in…');
        const base = apiUrl();
        const discovery = await this.getDiscovery(base);

        const redirectUri = (
            await vscode.env.asExternalUri(vscode.Uri.parse(REDIRECT_URI))
        ).toString(true);

        const clientId = await this.getClientId(base, discovery, redirectUri);

        // PKCE (S256)
        const codeVerifier = base64url(crypto.randomBytes(48));
        const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
        const state = base64url(crypto.randomBytes(24));

        const requestedScopes = scopes && scopes.length > 0 ? Array.from(scopes) : SCOPES;

        const authUrl = new URL(discovery.authorization_endpoint);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', requestedScopes.join(' '));
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        const codePromise = this.waitForCode(state);
        const opened = await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
        if (!opened) {
            this.pending.delete(state);
            throw new Error('Could not open the browser for sign-in.');
        }

        const code = await codePromise;

        // Token exchange
        const form = new URLSearchParams();
        form.set('grant_type', 'authorization_code');
        form.set('code', code);
        form.set('redirect_uri', redirectUri);
        form.set('client_id', clientId);
        form.set('code_verifier', codeVerifier);

        const token = await getJson<TokenResponse>(
            'POST',
            discovery.token_endpoint,
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            form.toString()
        );
        if (!token.access_token) {
            throw new Error('Token endpoint returned no access token.');
        }

        const account = await this.fetchAccount(base, token.access_token);
        const session: vscode.AuthenticationSession = {
            id: crypto.randomUUID(),
            accessToken: token.access_token,
            account,
            scopes: requestedScopes,
        };

        const record: StoredSession = {
            session,
            refreshToken: token.refresh_token,
            expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
        };
        // Single account: replace any prior sessions.
        await this.saveStored([record]);
        this.log(`Signed in as ${account.label}`);
        this._onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
        return session;
    }

    async removeSession(sessionId: string): Promise<void> {
        const stored = await this.loadStored();
        const target = stored.find((s) => s.session.id === sessionId);
        const remaining = stored.filter((s) => s.session.id !== sessionId);
        await this.saveStored(remaining);

        if (target) {
            // Best-effort token revocation; never fail sign-out if this fails.
            void this.revoke(target).catch((e) => this.log(`Revoke skipped: ${sanitize(e)}`));
            this.log('Signed out');
            this._onDidChangeSessions.fire({ added: [], removed: [target.session], changed: [] });
        }
    }

    // --- Helpers used by the extension / hosted features ---------------------

    // Returns a valid access token if signed in, refreshing when near expiry.
    // When silent and not signed in, returns undefined (never prompts).
    async getAccessToken(silent = true): Promise<string | undefined> {
        const stored = await this.loadStored();
        const record = stored[0];
        if (!record) {
            if (silent) {
                return undefined;
            }
            const session = await this.createSession(SCOPES);
            return session.accessToken;
        }

        const expiresAt = record.expiresAt;
        if (expiresAt === undefined || Date.now() < expiresAt - REFRESH_SKEW_MS) {
            return record.session.accessToken;
        }

        // Expired / near expiry: refresh if we can.
        if (!record.refreshToken) {
            return silent ? undefined : record.session.accessToken;
        }
        try {
            const refreshed = await this.refresh(record);
            return refreshed.session.accessToken;
        } catch (e) {
            this.log(`Token refresh failed: ${sanitize(e)}`);
            return undefined;
        }
    }

    // --- Internal ------------------------------------------------------------

    private handleUri(uri: vscode.Uri): void {
        const params = new URLSearchParams(uri.query);
        const state = params.get('state');
        const code = params.get('code');
        const error = params.get('error');
        if (!state) {
            return;
        }
        const waiter = this.pending.get(state);
        if (!waiter) {
            return;
        }
        this.pending.delete(state);
        if (error) {
            waiter.reject(new Error(`Authorization error: ${error}`));
            return;
        }
        if (!code) {
            waiter.reject(new Error('Authorization response missing code.'));
            return;
        }
        waiter.resolve(code);
    }

    private waitForCode(state: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pending.delete(state)) {
                    reject(new Error('Sign-in timed out.'));
                }
            }, AUTH_TIMEOUT_MS);
            this.pending.set(state, {
                resolve: (code) => {
                    clearTimeout(timer);
                    resolve(code);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
            });
        });
    }

    private async getDiscovery(base: string): Promise<DiscoveryDoc> {
        const cached = this.discoveryCache.get(base);
        if (cached) {
            return cached;
        }
        const doc = await getJson<DiscoveryDoc>(
            'GET',
            `${base}/.well-known/oauth-authorization-server`,
            { Accept: 'application/json' }
        );
        if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.registration_endpoint) {
            throw new Error('OAuth discovery document is missing required endpoints.');
        }
        this.discoveryCache.set(base, doc);
        return doc;
    }

    private async getClientId(base: string, discovery: DiscoveryDoc, redirectUri: string): Promise<string> {
        const key = `${CLIENT_ID_KEY_PREFIX}${base}`;
        const existing = this.context.globalState.get<string>(key);
        if (existing) {
            return existing;
        }
        const registration = await getJson<{ client_id: string }>(
            'POST',
            discovery.registration_endpoint,
            { 'Content-Type': 'application/json', Accept: 'application/json' },
            JSON.stringify({
                client_name: 'LabWired VS Code',
                redirect_uris: [redirectUri],
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
                scope: SCOPES.join(' '),
            })
        );
        if (!registration.client_id) {
            throw new Error('Dynamic client registration returned no client_id.');
        }
        await this.context.globalState.update(key, registration.client_id);
        return registration.client_id;
    }

    private async fetchAccount(base: string, accessToken: string): Promise<vscode.AuthenticationSessionAccountInformation> {
        try {
            const me = await getJson<any>('GET', `${base}/v1/auth/me`, {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            });
            const id = String(me?.id ?? me?.sub ?? me?.user_id ?? me?.userId ?? 'labwired-user');
            const label = String(me?.email ?? me?.primary_email ?? me?.name ?? id);
            return { id, label };
        } catch (e) {
            // Don't hard-fail sign-in if the identity call misbehaves.
            this.log(`Could not fetch account info: ${sanitize(e)}`);
            return { id: 'labwired-user', label: 'LabWired' };
        }
    }

    private async refresh(record: StoredSession): Promise<StoredSession> {
        const base = apiUrl();
        const discovery = await this.getDiscovery(base);
        const clientId =
            this.context.globalState.get<string>(`${CLIENT_ID_KEY_PREFIX}${base}`) ?? '';

        const form = new URLSearchParams();
        form.set('grant_type', 'refresh_token');
        form.set('refresh_token', record.refreshToken!);
        if (clientId) {
            form.set('client_id', clientId);
        }

        const token = await getJson<TokenResponse>(
            'POST',
            discovery.token_endpoint,
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            form.toString()
        );
        if (!token.access_token) {
            throw new Error('Refresh returned no access token.');
        }

        const updatedSession: vscode.AuthenticationSession = {
            ...record.session,
            accessToken: token.access_token,
        };
        const updated: StoredSession = {
            session: updatedSession,
            refreshToken: token.refresh_token ?? record.refreshToken,
            expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
        };

        const stored = await this.loadStored();
        const next = stored.map((s) => (s.session.id === record.session.id ? updated : s));
        await this.saveStored(next);
        this.log('Refreshed access token');
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [updatedSession] });
        return updated;
    }

    private async revoke(record: StoredSession): Promise<void> {
        const base = apiUrl();
        const discovery = await this.getDiscovery(base);
        if (!discovery.revocation_endpoint) {
            return;
        }
        const clientId =
            this.context.globalState.get<string>(`${CLIENT_ID_KEY_PREFIX}${base}`) ?? '';
        const token = record.refreshToken ?? record.session.accessToken;
        const form = new URLSearchParams();
        form.set('token', token);
        if (clientId) {
            form.set('client_id', clientId);
        }
        await httpRequest(
            'POST',
            discovery.revocation_endpoint,
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            form.toString()
        );
    }

    private async loadStored(): Promise<StoredSession[]> {
        const raw = await this.context.secrets.get(SECRET_KEY);
        if (!raw) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as StoredSession[]) : [];
        } catch {
            return [];
        }
    }

    private async saveStored(list: StoredSession[]): Promise<void> {
        if (list.length === 0) {
            await this.context.secrets.delete(SECRET_KEY);
            return;
        }
        await this.context.secrets.store(SECRET_KEY, JSON.stringify(list));
    }
}

// Strips anything token-shaped out of an error before it reaches a log line.
function sanitize(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.replace(/[A-Za-z0-9\-._~+/]{20,}={0,2}/g, '<redacted>');
}

// Silent access-token helper for future hosted features. Never prompts when silent.
export async function getAccessToken(silent = true): Promise<string | undefined> {
    if (!activeProvider) {
        return undefined;
    }
    return activeProvider.getAccessToken(silent);
}

"use strict";
// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.
//
// Optional "Sign in to LabWired" via LabWired's own OAuth 2.1 authorization
// server (Clerk-backed). This is entirely opt-in and unlocks HOSTED features
// only — running the simulator locally is free and never touches this code.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessToken = exports.LabwiredAuthProvider = exports.SCOPES = exports.AUTH_LABEL = exports.AUTH_ID = void 0;
const vscode = require("vscode");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
exports.AUTH_ID = 'labwired';
exports.AUTH_LABEL = 'LabWired';
exports.SCOPES = ['email', 'offline_access', 'profile'];
const DEFAULT_API_URL = 'https://api.labwired.com';
// vscode://<publisher>.<extension name>/auth-callback
const REDIRECT_URI = 'vscode://w1ne.labwired-vscode/auth-callback';
const SECRET_KEY = 'labwired.auth.sessions';
const CLIENT_ID_KEY_PREFIX = 'labwired.oauth.clientId:';
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const REFRESH_SKEW_MS = 60 * 1000;
function apiUrl() {
    const configured = vscode.workspace.getConfiguration('labwired').get('apiUrl');
    const trimmed = configured && configured.trim().length > 0 ? configured.trim() : DEFAULT_API_URL;
    return trimmed.replace(/\/+$/, '');
}
function base64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Low-level HTTP(S) request returning the raw body. No secrets are ever logged here.
function httpRequest(method, urlStr, headers, body) {
    return new Promise((resolve, reject) => {
        let url;
        try {
            url = new URL(urlStr);
        }
        catch (e) {
            reject(new Error(`Invalid URL: ${urlStr}`));
            return;
        }
        const transport = url.protocol === 'http:' ? http : https;
        const options = {
            method,
            hostname: url.hostname,
            port: url.port || undefined,
            path: `${url.pathname}${url.search}`,
            headers: Object.assign({ 'User-Agent': 'labwired-vscode' }, headers),
        };
        const req = transport.request(options, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                var _a;
                resolve({ status: (_a = res.statusCode) !== null && _a !== void 0 ? _a : 0, body: Buffer.concat(chunks).toString('utf8') });
            });
        });
        req.on('error', reject);
        if (body !== undefined) {
            req.write(body);
        }
        req.end();
    });
}
function getJson(method, urlStr, headers, body) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield httpRequest(method, urlStr, headers, body);
        if (res.status < 200 || res.status >= 300) {
            throw new Error(`HTTP ${res.status} for ${new URL(urlStr).pathname}`);
        }
        try {
            return JSON.parse(res.body);
        }
        catch (_a) {
            throw new Error(`Malformed JSON from ${new URL(urlStr).pathname}`);
        }
    });
}
let activeProvider;
class LabwiredAuthProvider {
    constructor(context, output) {
        this.context = context;
        this.output = output;
        this._onDidChangeSessions = new vscode.EventEmitter();
        this.onDidChangeSessions = this._onDidChangeSessions.event;
        // Discovery is cached per apiUrl for the extension-host lifetime.
        this.discoveryCache = new Map();
        // Pending authorize flows keyed by the OAuth `state` value.
        this.pending = new Map();
        this.uriHandlerRegistration = vscode.window.registerUriHandler({
            handleUri: (uri) => this.handleUri(uri),
        });
        activeProvider = this;
    }
    dispose() {
        this.uriHandlerRegistration.dispose();
        this._onDidChangeSessions.dispose();
        if (activeProvider === this) {
            activeProvider = undefined;
        }
    }
    log(msg) {
        this.output.appendLine(`LabWired [auth]: ${msg}`);
    }
    // --- vscode.AuthenticationProvider ---------------------------------------
    getSessions(scopes) {
        return __awaiter(this, void 0, void 0, function* () {
            const stored = yield this.loadStored();
            if (!scopes || scopes.length === 0) {
                return stored.map((s) => s.session);
            }
            return stored
                .filter((s) => scopes.every((scope) => s.session.scopes.includes(scope)))
                .map((s) => s.session);
        });
    }
    createSession(scopes) {
        return __awaiter(this, void 0, void 0, function* () {
            this.log('Signing in…');
            const base = apiUrl();
            const discovery = yield this.getDiscovery(base);
            const redirectUri = (yield vscode.env.asExternalUri(vscode.Uri.parse(REDIRECT_URI))).toString(true);
            const clientId = yield this.getClientId(base, discovery, redirectUri);
            // PKCE (S256)
            const codeVerifier = base64url(crypto.randomBytes(48));
            const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
            const state = base64url(crypto.randomBytes(24));
            const requestedScopes = scopes && scopes.length > 0 ? Array.from(scopes) : exports.SCOPES;
            const authUrl = new URL(discovery.authorization_endpoint);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('client_id', clientId);
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('scope', requestedScopes.join(' '));
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            const codePromise = this.waitForCode(state);
            const opened = yield vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
            if (!opened) {
                this.pending.delete(state);
                throw new Error('Could not open the browser for sign-in.');
            }
            const code = yield codePromise;
            // Token exchange
            const form = new URLSearchParams();
            form.set('grant_type', 'authorization_code');
            form.set('code', code);
            form.set('redirect_uri', redirectUri);
            form.set('client_id', clientId);
            form.set('code_verifier', codeVerifier);
            const token = yield getJson('POST', discovery.token_endpoint, { 'Content-Type': 'application/x-www-form-urlencoded' }, form.toString());
            if (!token.access_token) {
                throw new Error('Token endpoint returned no access token.');
            }
            const account = yield this.fetchAccount(base, token.access_token);
            const session = {
                id: crypto.randomUUID(),
                accessToken: token.access_token,
                account,
                scopes: requestedScopes,
            };
            const record = {
                session,
                refreshToken: token.refresh_token,
                expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
            };
            // Single account: replace any prior sessions.
            yield this.saveStored([record]);
            this.log(`Signed in as ${account.label}`);
            this._onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
            return session;
        });
    }
    removeSession(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const stored = yield this.loadStored();
            const target = stored.find((s) => s.session.id === sessionId);
            const remaining = stored.filter((s) => s.session.id !== sessionId);
            yield this.saveStored(remaining);
            if (target) {
                // Best-effort token revocation; never fail sign-out if this fails.
                void this.revoke(target).catch((e) => this.log(`Revoke skipped: ${sanitize(e)}`));
                this.log('Signed out');
                this._onDidChangeSessions.fire({ added: [], removed: [target.session], changed: [] });
            }
        });
    }
    // --- Helpers used by the extension / hosted features ---------------------
    // Returns a valid access token if signed in, refreshing when near expiry.
    // When silent and not signed in, returns undefined (never prompts).
    getAccessToken(silent = true) {
        return __awaiter(this, void 0, void 0, function* () {
            const stored = yield this.loadStored();
            const record = stored[0];
            if (!record) {
                if (silent) {
                    return undefined;
                }
                const session = yield this.createSession(exports.SCOPES);
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
                const refreshed = yield this.refresh(record);
                return refreshed.session.accessToken;
            }
            catch (e) {
                this.log(`Token refresh failed: ${sanitize(e)}`);
                return undefined;
            }
        });
    }
    // --- Internal ------------------------------------------------------------
    handleUri(uri) {
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
    waitForCode(state) {
        return new Promise((resolve, reject) => {
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
    getDiscovery(base) {
        return __awaiter(this, void 0, void 0, function* () {
            const cached = this.discoveryCache.get(base);
            if (cached) {
                return cached;
            }
            const doc = yield getJson('GET', `${base}/.well-known/oauth-authorization-server`, { Accept: 'application/json' });
            if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.registration_endpoint) {
                throw new Error('OAuth discovery document is missing required endpoints.');
            }
            this.discoveryCache.set(base, doc);
            return doc;
        });
    }
    getClientId(base, discovery, redirectUri) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = `${CLIENT_ID_KEY_PREFIX}${base}`;
            const existing = this.context.globalState.get(key);
            if (existing) {
                return existing;
            }
            const registration = yield getJson('POST', discovery.registration_endpoint, { 'Content-Type': 'application/json', Accept: 'application/json' }, JSON.stringify({
                client_name: 'LabWired VS Code',
                redirect_uris: [redirectUri],
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
                scope: exports.SCOPES.join(' '),
            }));
            if (!registration.client_id) {
                throw new Error('Dynamic client registration returned no client_id.');
            }
            yield this.context.globalState.update(key, registration.client_id);
            return registration.client_id;
        });
    }
    fetchAccount(base, accessToken) {
        var _a, _b, _c, _d, _e, _f, _g;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const me = yield getJson('GET', `${base}/v1/auth/me`, {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                });
                const id = String((_d = (_c = (_b = (_a = me === null || me === void 0 ? void 0 : me.id) !== null && _a !== void 0 ? _a : me === null || me === void 0 ? void 0 : me.sub) !== null && _b !== void 0 ? _b : me === null || me === void 0 ? void 0 : me.user_id) !== null && _c !== void 0 ? _c : me === null || me === void 0 ? void 0 : me.userId) !== null && _d !== void 0 ? _d : 'labwired-user');
                const label = String((_g = (_f = (_e = me === null || me === void 0 ? void 0 : me.email) !== null && _e !== void 0 ? _e : me === null || me === void 0 ? void 0 : me.primary_email) !== null && _f !== void 0 ? _f : me === null || me === void 0 ? void 0 : me.name) !== null && _g !== void 0 ? _g : id);
                return { id, label };
            }
            catch (e) {
                // Don't hard-fail sign-in if the identity call misbehaves.
                this.log(`Could not fetch account info: ${sanitize(e)}`);
                return { id: 'labwired-user', label: 'LabWired' };
            }
        });
    }
    refresh(record) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const base = apiUrl();
            const discovery = yield this.getDiscovery(base);
            const clientId = (_a = this.context.globalState.get(`${CLIENT_ID_KEY_PREFIX}${base}`)) !== null && _a !== void 0 ? _a : '';
            const form = new URLSearchParams();
            form.set('grant_type', 'refresh_token');
            form.set('refresh_token', record.refreshToken);
            if (clientId) {
                form.set('client_id', clientId);
            }
            const token = yield getJson('POST', discovery.token_endpoint, { 'Content-Type': 'application/x-www-form-urlencoded' }, form.toString());
            if (!token.access_token) {
                throw new Error('Refresh returned no access token.');
            }
            const updatedSession = Object.assign(Object.assign({}, record.session), { accessToken: token.access_token });
            const updated = {
                session: updatedSession,
                refreshToken: (_b = token.refresh_token) !== null && _b !== void 0 ? _b : record.refreshToken,
                expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
            };
            const stored = yield this.loadStored();
            const next = stored.map((s) => (s.session.id === record.session.id ? updated : s));
            yield this.saveStored(next);
            this.log('Refreshed access token');
            this._onDidChangeSessions.fire({ added: [], removed: [], changed: [updatedSession] });
            return updated;
        });
    }
    revoke(record) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const base = apiUrl();
            const discovery = yield this.getDiscovery(base);
            if (!discovery.revocation_endpoint) {
                return;
            }
            const clientId = (_a = this.context.globalState.get(`${CLIENT_ID_KEY_PREFIX}${base}`)) !== null && _a !== void 0 ? _a : '';
            const token = (_b = record.refreshToken) !== null && _b !== void 0 ? _b : record.session.accessToken;
            const form = new URLSearchParams();
            form.set('token', token);
            if (clientId) {
                form.set('client_id', clientId);
            }
            yield httpRequest('POST', discovery.revocation_endpoint, { 'Content-Type': 'application/x-www-form-urlencoded' }, form.toString());
        });
    }
    loadStored() {
        return __awaiter(this, void 0, void 0, function* () {
            const raw = yield this.context.secrets.get(SECRET_KEY);
            if (!raw) {
                return [];
            }
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            }
            catch (_a) {
                return [];
            }
        });
    }
    saveStored(list) {
        return __awaiter(this, void 0, void 0, function* () {
            if (list.length === 0) {
                yield this.context.secrets.delete(SECRET_KEY);
                return;
            }
            yield this.context.secrets.store(SECRET_KEY, JSON.stringify(list));
        });
    }
}
exports.LabwiredAuthProvider = LabwiredAuthProvider;
// Strips anything token-shaped out of an error before it reaches a log line.
function sanitize(e) {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.replace(/[A-Za-z0-9\-._~+/]{20,}={0,2}/g, '<redacted>');
}
// Silent access-token helper for future hosted features. Never prompts when silent.
function getAccessToken(silent = true) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!activeProvider) {
            return undefined;
        }
        return activeProvider.getAccessToken(silent);
    });
}
exports.getAccessToken = getAccessToken;
//# sourceMappingURL=auth.js.map
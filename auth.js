/* Mini AI Phase 2 — Auth adapter.
   Modes: 'local' (no login, current) | 'supabase' (when configured).
   Supabase keys go in server env or app config — NEVER hardcoded here. */
'use strict';

const Auth = {
  mode: 'local',  // 'local' | 'supabase'
  user: null,
  _supabaseUrl: '',
  _supabaseKey: '',

  // Call at startup. Reads config from window.MINIAI_CONFIG (set by deploy) or localStorage (dev).
  init() {
    const cfg = (window.MINIAI_CONFIG || {});
    this._supabaseUrl = cfg.supabaseUrl || localStorage.getItem('miniai_supabase_url') || '';
    this._supabaseKey = cfg.supabaseKey || localStorage.getItem('miniai_supabase_key') || '';
    if (this._supabaseUrl && this._supabaseKey) {
      this.mode = 'supabase';
      const saved = this._store.get('supabase_session', null);
      if (saved && saved.user) this.user = saved.user;
    } else {
      this.mode = 'local';
      this.user = { id: 'local', email: 'local user', mode: 'local' };
    }
    return this;
  },

  get _store() {
    return {
      get: (k, d) => { try { const v = localStorage.getItem('miniai_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
      set: (k, v) => { try { localStorage.setItem('miniai_' + k, JSON.stringify(v)); } catch {} },
      del: (k) => { try { localStorage.removeItem('miniai_' + k); } catch {} }
    };
  },

  isConfigured() { return this.mode === 'supabase'; },
  isLoggedIn() { return !!(this.user && (this.mode === 'local' || this.user.access_token)); },

  async _sb(path, method, body, token) {
    const res = await fetch(this._supabaseUrl + '/auth/v1' + path, {
      method, headers: {
        'Content-Type': 'application/json', 'apikey': this._supabaseKey,
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || data.error_description || ('Auth HTTP ' + res.status));
    return data;
  },

  async signUp(email, password) {
    if (!this.isConfigured()) throw new Error('Supabase configured nahi hai. README me setup steps hain.');
    const data = await this._sb('/signup', 'POST', { email, password });
    if (data.user) { this.user = { id: data.user.id, email: data.user.email, access_token: data.access_token }; this._store.set('supabase_session', this.user); }
    return this.user;
  },

  async signIn(email, password) {
    if (!this.isConfigured()) throw new Error('Supabase configured nahi hai. README me setup steps hain.');
    const data = await this._sb('/token?grant_type=password', 'POST', { email, password });
    this.user = { id: data.user.id, email: data.user.email, access_token: data.access_token };
    this._store.set('supabase_session', this.user);
    return this.user;
  },

  async signOut() {
    if (this.isConfigured() && this.user?.access_token) {
      try { await this._sb('/logout', 'POST', null, this.user.access_token); } catch {}
    }
    this.user = this.mode === 'local' ? { id: 'local', email: 'local user', mode: 'local' } : null;
    this._store.del('supabase_session');
  }
};

/* Mini AI Phase 2 — Plugin system core.
   Manifest format, registry (localStorage), validation, sandboxed execution.

   Plugin manifest:
   {
     "name": "calculator", "version": "1.0.0",
     "description": "...", "author": "...",
     "permissions": ["compute"],          // compute | network | storage
     "inputSchema": { "type": "object", "properties": {...}, "required": [...] },
     "outputSchema": { "type": "object", "properties": {...} },
     "code": "function run(input) { ... return {...}; }",  // must define run(input)
     "tests": [{ "input": {...}, "expect": {...} }]
   }

   Lifecycle: draft → validated → tested → approved → installed → enabled/disabled
   Execution: Web Worker sandbox, 5s timeout, no DOM, no secrets, no network (unless permission).
*/
'use strict';

const Plugins = {
  _store: {
    get(k, d) { try { const v = localStorage.getItem('miniai_plugin_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('miniai_plugin_' + k, JSON.stringify(v)); } catch {} }
  },

  list() { return this._store.get('registry', []); },
  _save(reg) { this._store.set('registry', reg); },

  get(name) { return this.list().find(p => p.name === name) || null; },

  /* ---------- Validation ---------- */
  validate(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== 'object') return ['Manifest object hona chahiye'];
    if (!manifest.name || !/^[a-z0-9_-]{2,40}$/.test(manifest.name)) errors.push('name: lowercase, 2-40 chars (a-z 0-9 _ -)');
    if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push('version: semver (e.g. 1.0.0)');
    if (!manifest.description || manifest.description.length < 10) errors.push('description: kam se kam 10 chars');
    if (!Array.isArray(manifest.permissions)) errors.push('permissions: array hona chahiye');
    else for (const p of manifest.permissions)
      if (!['compute', 'network', 'storage'].includes(p)) errors.push('permission galat: ' + p);
    if (!manifest.inputSchema || manifest.inputSchema.type !== 'object') errors.push('inputSchema: {type:"object",...} chahiye');
    if (!manifest.code || typeof manifest.code !== 'string' || !manifest.code.includes('function run'))
      errors.push('code me `function run(input)` hona chahiye');
    // Dangerous patterns — block karo
    const banned = ['eval(', 'Function(', 'importScripts', 'XMLHttpRequest', 'fetch(', 'WebSocket', 'localStorage', 'document', 'window', 'process', 'require('];
    if (manifest.permissions && !manifest.permissions.includes('network')) {
      for (const b of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'importScripts'])
        if (manifest.code.includes(b)) errors.push('network permission ke bina `' + b + '` allowed nahi');
    }
    for (const b of ['eval(', 'Function(', 'document', 'window.', 'process', 'require('])
      if (manifest.code.includes(b)) errors.push('banned pattern: `' + b + '`');
    return errors;
  },

  /* Validate input against JSON schema (simple subset) */
  validateInput(schema, input) {
    if (schema.type === 'object') {
      if (typeof input !== 'object' || input === null) return 'input object hona chahiye';
      for (const r of (schema.required || []))
        if (!(r in input)) return 'missing required field: ' + r;
      for (const [k, prop] of Object.entries(schema.properties || {})) {
        if (k in input && prop.type) {
          const t = typeof input[k];
          const want = prop.type === 'integer' ? 'number' : prop.type;
          if (t !== want) return `field ${k}: ${prop.type} chahiye, ${t} mila`;
          if (prop.type === 'integer' && !Number.isInteger(input[k])) return `field ${k}: integer chahiye`;
        }
      }
    }
    return null;
  },

  /* ---------- Sandboxed execution (Web Worker, 5s timeout) ---------- */
  async execute(name, input) {
    const plugin = this.get(name);
    if (!plugin) throw new Error('Plugin nahi mila: ' + name);
    if (plugin.status !== 'enabled') throw new Error('Plugin enabled nahi hai: ' + name);

    const schemaErr = this.validateInput(plugin.manifest.inputSchema, input);
    if (schemaErr) throw new Error('Input invalid: ' + schemaErr);

    return new Promise((resolve, reject) => {
      const workerSrc = `
        self.onmessage = function(e) {
          try {
            ${plugin.manifest.code}
            if (typeof run !== 'function') throw new Error('run(input) defined nahi hai');
            const out = run(e.data.input);
            self.postMessage({ ok: true, output: out });
          } catch (err) { self.postMessage({ ok: false, error: String(err.message || err) }); }
        };`;
      const blob = new Blob([workerSrc], { type: 'text/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Timeout: 5s se zyada laga')); }, 5000);
      worker.onmessage = e => {
        clearTimeout(timer); worker.terminate();
        if (e.data.ok) { this._log(name, input, e.data.output, null); resolve(e.data.output); }
        else { this._log(name, input, null, e.data.error); reject(new Error(e.data.error)); }
      };
      worker.onerror = e => { clearTimeout(timer); worker.terminate(); reject(new Error('Worker error')); };
      worker.postMessage({ input });
    });
  },

  /* ---------- Tests ---------- */
  _deepEqual(a, b, tol = 0.01) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= tol;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => this._deepEqual(x, b[i], tol));
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a), kb = Object.keys(b);
      return ka.length === kb.length && ka.every(k => this._deepEqual(a[k], b[k], tol));
    }
    return a === b;
  },
  async runTests(manifest) {
    const results = [];
    const tests = manifest.tests || [];
    if (!tests.length) return [{ name: 'no tests', status: 'NOT RUN', detail: 'Koi test defined nahi' }];
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      try {
        const out = await this._execCode(manifest.code, t.input, manifest.permissions || []);
        const pass = this._deepEqual(out, t.expect);
        results.push({ name: 'test ' + (i + 1), status: pass ? 'PASS' : 'FAIL',
          detail: pass ? 'OK' : ('expected ' + JSON.stringify(t.expect) + ', got ' + JSON.stringify(out)) });
      } catch (e) {
        results.push({ name: 'test ' + (i + 1), status: 'FAIL', detail: e.message });
      }
    }
    return results;
  },

  _execCode(code, input, permissions) {
    return new Promise((resolve, reject) => {
      const workerSrc = `self.onmessage=function(e){try{${code};const out=run(e.data.input);self.postMessage({ok:true,output:out});}catch(err){self.postMessage({ok:false,error:String(err.message||err)});}};`;
      const worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' })));
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Timeout 5s')); }, 5000);
      worker.onmessage = e => { clearTimeout(timer); worker.terminate(); e.data.ok ? resolve(e.data.output) : reject(new Error(e.data.error)); };
      worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Worker error')); };
      worker.postMessage({ input });
    });
  },

  /* ---------- Registry ops ---------- */
  installDraft(manifest) {
    const errors = this.validate(manifest);
    const reg = this.list().filter(p => p.name !== manifest.name);
    reg.push({ name: manifest.name, manifest, status: errors.length ? 'draft-invalid' : 'draft', errors, installedAt: Date.now() });
    this._save(reg);
    return errors;
  },
  async approve(name) {
    const reg = this.list(); const p = reg.find(x => x.name === name);
    if (!p) throw new Error('Plugin nahi mila');
    const errors = this.validate(p.manifest);
    if (errors.length) throw new Error('Validation failed: ' + errors.join('; '));
    const tests = await this.runTests(p.manifest);
    const failed = tests.filter(t => t.status === 'FAIL');
    if (failed.length) throw new Error('Tests failed: ' + failed.map(t => t.detail).join('; '));
    const passed = tests.filter(t => t.status === 'PASS');
    if (!passed.length) throw new Error('Kam se kam 1 test PASS hona chahiye (koi test run nahi hua)');
    p.status = 'enabled'; p.errors = []; p.tests = tests;
    this._save(reg);
    return tests;
  },
  setEnabled(name, on) {
    const reg = this.list(); const p = reg.find(x => x.name === name);
    if (!p) throw new Error('Plugin nahi mila');
    if (on && p.status !== 'enabled' && p.status !== 'disabled') throw new Error('Pehle approve karo');
    p.status = on ? 'enabled' : 'disabled';
    this._save(reg);
  },
  uninstall(name) { this._save(this.list().filter(p => p.name !== name)); },

  /* ---------- Audit log ---------- */
  _log(plugin, input, output, error) {
    const log = this._store.get('exec_log', []);
    log.unshift({ ts: Date.now(), plugin, input, output, error: error || null });
    this._store.set('exec_log', log.slice(0, 100));
  },
  execLog() { return this._store.get('exec_log', []); }
};

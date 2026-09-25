var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// wrangler-modules-watch:wrangler:modules-watch
var init_wrangler_modules_watch = __esm({
  "wrangler-modules-watch:wrangler:modules-watch"() {
    init_modules_watch_stub();
  }
});

// ../../node_modules/wrangler/templates/modules-watch-stub.js
var init_modules_watch_stub = __esm({
  "../../node_modules/wrangler/templates/modules-watch-stub.js"() {
    init_wrangler_modules_watch();
  }
});

// node_modules/@desert-ant-labs/core/src/ffi.js
var FfiReader, FfiWriter;
var init_ffi = __esm({
  "node_modules/@desert-ant-labs/core/src/ffi.js"() {
    init_modules_watch_stub();
    FfiReader = class {
      static {
        __name(this, "FfiReader");
      }
      constructor(bytes) {
        this._bytes = bytes;
        this._view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this._o = 0;
      }
      u32() {
        const v = this._view.getUint32(this._o, false);
        this._o += 4;
        return v;
      }
      i32() {
        const v = this._view.getInt32(this._o, false);
        this._o += 4;
        return v;
      }
      f64() {
        const v = this._view.getFloat64(this._o, false);
        this._o += 8;
        return v;
      }
      /** Read `n` raw bytes (a view into the underlying buffer; copy if retaining). */
      bytes(n) {
        const v = this._bytes.subarray(this._o, this._o + n);
        this._o += n;
        return v;
      }
      /** Read a uint32 count, then that many big-endian floats. The audio payload:
       *  a fresh Float32Array, not a view, because the source bytes are big-endian
       *  and the platform is not. */
      f32Array() {
        const n = this.u32();
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          out[i] = this._view.getFloat32(this._o, false);
          this._o += 4;
        }
        return out;
      }
      /** Read a uint32-length-prefixed UTF-8 string. */
      str() {
        const n = this.u32();
        const s = new TextDecoder().decode(this._bytes.subarray(this._o, this._o + n));
        this._o += n;
        return s;
      }
      get offset() {
        return this._o;
      }
      get remaining() {
        return this._bytes.length - this._o;
      }
    };
    FfiWriter = class {
      static {
        __name(this, "FfiWriter");
      }
      constructor() {
        this._parts = [];
        this._length = 0;
      }
      _push(bytes) {
        this._parts.push(bytes);
        this._length += bytes.length;
        return this;
      }
      /** Append a big-endian uint32. */
      u32(v) {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setUint32(0, v >>> 0, false);
        return this._push(b);
      }
      /** Append a big-endian IEEE-754 double. */
      f64(v) {
        const b = new Uint8Array(8);
        new DataView(b.buffer).setFloat64(0, v, false);
        return this._push(b);
      }
      /** Append a uint32 element count, then that many big-endian floats: the
       *  portable audio payload, matching Swift's `FFIWriter.f32Array`. */
      f32Array(values) {
        const a = values instanceof Float32Array ? values : Float32Array.from(values ?? []);
        this.u32(a.length);
        const b = new Uint8Array(a.length * 4);
        const view = new DataView(b.buffer);
        for (let i = 0; i < a.length; i++) view.setFloat32(i * 4, a[i], false);
        return this._push(b);
      }
      /** Append a uint32 UTF-8 byte count, then the UTF-8 bytes. */
      str(s) {
        const utf8 = new TextEncoder().encode(String(s ?? ""));
        return this.u32(utf8.length)._push(utf8);
      }
      /** Append a uint32 count, then that many length-prefixed strings. */
      strings(values) {
        const list = Array.from(values ?? []);
        this.u32(list.length);
        for (const s of list) this.str(s);
        return this;
      }
      /** Append a uint32 byte count, then the raw bytes. */
      blob(bytes) {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        return this.u32(b.length)._push(b);
      }
      /** Append raw bytes verbatim (no length prefix). */
      raw(bytes) {
        return this._push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      }
      get length() {
        return this._length;
      }
      /** The finished payload (no outer length prefix; `dal_run` takes ptr + len). */
      done() {
        const out = new Uint8Array(this._length);
        let o = 0;
        for (const part of this._parts) {
          out.set(part, o);
          o += part.length;
        }
        return out;
      }
    };
  }
});

// node_modules/@desert-ant-labs/core/src/callgroup.js
function newGroupId() {
  return globalThis.crypto?.randomUUID?.() ?? `dal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function makeCallGroups(endGroup) {
  return {
    /**
     * Run `body(group)` with a fresh group id, so every call inside that passes
     * `{ group }` bills as a single usage call. The group is released when
     * `body` settles (resolve or reject).
     */
    async withCallGroup(body) {
      const group = newGroupId();
      try {
        return await body(group);
      } finally {
        endGroup(group);
      }
    }
  };
}
var init_callgroup = __esm({
  "node_modules/@desert-ant-labs/core/src/callgroup.js"() {
    init_modules_watch_stub();
    __name(newGroupId, "newGroupId");
    __name(makeCallGroups, "makeCallGroups");
  }
});

// node_modules/@desert-ant-labs/core/src/litert.js
async function importLiteRt(packageName) {
  try {
    return await import("@litertjs/core");
  } catch (cause) {
    const missing = cause?.code === "ERR_MODULE_NOT_FOUND" || cause?.code === "MODULE_NOT_FOUND" || String(cause?.message ?? "").includes("@litertjs/core");
    if (!missing) throw cause;
    throw new Error(
      `${packageName} browser runtime requires @litertjs/core. Install it with: npm i ${packageName} @litertjs/core. If you already bundle LiteRT.js yourself, pass it to load({ litert }). (In Node, import the package normally to use the native server-side build instead.)`,
      { cause }
    );
  }
}
async function loadLiteRt({ litert, wasmDir, defaultWasmDir: defaultWasmDir2, packageName }) {
  const lrt = litert ?? await importLiteRt(packageName);
  liteRtState.ready ??= lrt.loadLiteRt(wasmDir ?? await defaultWasmDir2());
  await liteRtState.ready;
  return lrt;
}
function assertBrowserRuntime({ packageName, litert }) {
  if (litert) return;
  const hasDom = typeof document !== "undefined";
  const hasWorker = typeof importScripts === "function";
  if (hasDom || hasWorker) return;
  throw new Error(
    `${packageName}: the default import runs the browser WebAssembly runtime (LiteRT.js), which needs a browser/Worker environment and can't initialize in plain Node. For server-side inference import the native build instead: import from "${packageName}/native". (The default import is still safe to bundle for server-side rendering; only calling load() in Node needs the native build.)`
  );
}
function makeModelHostSeam() {
  let host = null;
  const live = /* @__PURE__ */ __name(() => {
    if (!host) throw new Error("the model host is not installed yet");
    return host;
  }, "live");
  return {
    imports: {
      dalModelHost: {
        // `async` on purpose: the Swift side declares these as `async throws`, so
        // "no host installed" has to arrive as a rejected promise rather than a
        // synchronous throw across the bridge.
        createSessionFromPath: /* @__PURE__ */ __name(async (path) => live().createSessionFromPath(path), "createSessionFromPath"),
        createSessionFromBytes: /* @__PURE__ */ __name(async (bytes) => live().createSessionFromBytes(bytes), "createSessionFromBytes"),
        run: /* @__PURE__ */ __name(async (inputs) => live().run(inputs), "run")
      }
    },
    install: /* @__PURE__ */ __name((implementation) => {
      host = implementation;
    }, "install")
  };
}
function makeLiteRtHost({ accelerator = "wasm", loadAndCompile, Tensor, readModelSource: readModelSource2 }) {
  let model;
  const typedArray = /* @__PURE__ */ __name((t) => {
    const bytes = t.data.slice();
    switch (t.type) {
      case "int32":
        return new Int32Array(bytes.buffer);
      case "float32":
        return new Float32Array(bytes.buffer);
      case "uint8":
        return new Uint8Array(bytes.buffer);
      default:
        throw new Error(`unsupported tensor type: ${t.type}`);
    }
  }, "typedArray");
  return {
    host: {
      // node hands over the cached path, the browser the bytes it fetched: two
      // methods rather than one union, as the typed contract requires.
      createSessionFromPath: /* @__PURE__ */ __name(async (path) => {
        model = await loadAndCompile(await readModelSource2(path), { accelerator });
      }, "createSessionFromPath"),
      createSessionFromBytes: /* @__PURE__ */ __name(async (bytes) => {
        model = await loadAndCompile(await readModelSource2(bytes), { accelerator });
      }, "createSessionFromBytes"),
      run: /* @__PURE__ */ __name(async (inputs) => {
        const feeds = {};
        const made = [];
        for (const [name, t] of Object.entries(inputs)) {
          const tensor = new Tensor(typedArray(t), Array.from(t.dims));
          feeds[name] = tensor;
          made.push(tensor);
        }
        const results = await model.run(feeds);
        const outputs = {};
        const toDelete = [...made];
        for (const [name, out] of Object.entries(results)) {
          const host = accelerator === "wasm" ? out : await out.moveTo("wasm");
          const arr = host.toTypedArray();
          outputs[name] = {
            data: new Uint8Array(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)),
            dims: Array.from(host.type.layout.dimensions),
            type: host.type.dtype
          };
          toDelete.push(out);
          if (host !== out) toDelete.push(host);
        }
        for (const t of toDelete) t.delete();
        return outputs;
      }, "run")
    },
    setModel: /* @__PURE__ */ __name((m) => {
      model = m;
    }, "setModel")
  };
}
async function fetchSelfHostedModel(baseUrl, files) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const get = /* @__PURE__ */ __name(async (name) => new Uint8Array(await fetch(`${base}${name}`).then((r) => r.arrayBuffer())), "get");
  const [modelBytes, ...sidecarBytes] = await Promise.all([
    get(files.model),
    ...files.sidecars.map(get)
  ]);
  const sidecars = {};
  files.sidecars.forEach((name, i) => {
    sidecars[name] = sidecarBytes[i];
  });
  return { sidecars, modelBytes };
}
async function browserSetup({ init: init2 }) {
  const seam = makeModelHostSeam();
  const { init: initCore } = await init2();
  const { exports } = await initCore({ getImports: /* @__PURE__ */ __name(() => seam.imports, "getImports") });
  return { exports, installHost: seam.install };
}
async function browserWasmDir() {
  return "https://cdn.jsdelivr.net/npm/@litertjs/core/wasm/";
}
async function browserReadModelSource(source) {
  return source;
}
async function browserCacheRoot() {
  return "";
}
var liteRtStateKey, liteRtState;
var init_litert = __esm({
  "node_modules/@desert-ant-labs/core/src/litert.js"() {
    init_modules_watch_stub();
    liteRtStateKey = /* @__PURE__ */ Symbol.for("ai.desertant.litert.state");
    liteRtState = globalThis[liteRtStateKey] ??= {};
    __name(importLiteRt, "importLiteRt");
    __name(loadLiteRt, "loadLiteRt");
    __name(assertBrowserRuntime, "assertBrowserRuntime");
    __name(makeModelHostSeam, "makeModelHostSeam");
    __name(makeLiteRtHost, "makeLiteRtHost");
    __name(fetchSelfHostedModel, "fetchSelfHostedModel");
    __name(browserSetup, "browserSetup");
    __name(browserWasmDir, "browserWasmDir");
    __name(browserReadModelSource, "browserReadModelSource");
    __name(browserCacheRoot, "browserCacheRoot");
  }
});

// node_modules/@desert-ant-labs/core/src/sdk.js
async function readyModel({ core, packageName, handle, onProgress }) {
  if (!handle) throw new Error(`${packageName}: failed to create the model`);
  const model = new LoadedModel({ core, packageName, handle });
  try {
    await core.download(handle, onProgress);
  } catch (cause) {
    model.dispose();
    throw new Error(`${packageName}: model download failed: ${cause}`, { cause });
  }
  onProgress?.(1);
  return model;
}
function wasmCore(exports) {
  return {
    create: /* @__PURE__ */ __name((cacheRoot, directory) => exports.create(cacheRoot ?? null, directory ?? null), "create"),
    createSelfHosted: /* @__PURE__ */ __name((files) => exports.createSelfHosted(files), "createSelfHosted"),
    isDownloaded: /* @__PURE__ */ __name((handle) => exports.isDownloaded(handle), "isDownloaded"),
    download: /* @__PURE__ */ __name((handle, onProgress) => exports.download(handle, onProgress ?? (() => {
    })), "download"),
    run: /* @__PURE__ */ __name(async (handle, input, options, group, deviceId) => new FfiReader(
      await exports.run(handle, input, options ?? null, group ?? null, deviceId ?? null)
    ), "run"),
    destroy: /* @__PURE__ */ __name((handle) => exports.destroy(handle), "destroy"),
    flushTelemetry: /* @__PURE__ */ __name(() => exports.flushTelemetry(), "flushTelemetry"),
    ...makeCallGroups((id) => exports.endCallGroup(id))
  };
}
async function createWasmSdk({ platform, packageName }) {
  const { exports, installHost } = await platform.setupCore();
  const core = wasmCore(exports);
  const { artifact, sidecars } = exports.modelInfo();
  if (globalThis.__dalHttpDebug) {
    globalThis.__dalFlushTelemetry = () => core.flushTelemetry();
  }
  return {
    core,
    async open(options = {}) {
      assertBrowserRuntime({ packageName, litert: options.litert });
      const lrt = await loadLiteRt({
        litert: options.litert,
        wasmDir: options.litertWasmDir,
        defaultWasmDir: platform.defaultWasmDir,
        packageName
      });
      const accelerator = options.accelerator ?? "wasm";
      const { host, setModel } = makeLiteRtHost({
        accelerator,
        loadAndCompile: lrt.loadAndCompile,
        Tensor: lrt.Tensor,
        readModelSource: platform.readModelSource
      });
      installHost(host);
      const onProgress = typeof options.onProgress === "function" ? options.onProgress : void 0;
      let handle;
      if (options.modelBaseUrl != null) {
        const { sidecars: fetched, modelBytes } = await fetchSelfHostedModel(options.modelBaseUrl, { model: artifact, sidecars });
        setModel(await lrt.loadAndCompile(modelBytes, { accelerator }));
        handle = core.createSelfHosted(fetched);
      } else {
        const cacheRoot = options.cacheRoot ?? await platform.defaultCacheRoot();
        handle = core.create(cacheRoot, options.directory ?? null);
      }
      return readyModel({ core, packageName, handle, onProgress });
    }
  };
}
var LoadedModel;
var init_sdk = __esm({
  "node_modules/@desert-ant-labs/core/src/sdk.js"() {
    init_modules_watch_stub();
    init_callgroup();
    init_ffi();
    init_litert();
    LoadedModel = class {
      static {
        __name(this, "LoadedModel");
      }
      #core;
      #packageName;
      #handle;
      constructor({ core, packageName, handle }) {
        this.#core = core;
        this.#packageName = packageName;
        this.#handle = handle;
      }
      /**
       * Run the model over its own input payload with its own options payload,
       * returning an `FfiReader` over its result payload for the caller's decoder.
       *
       * Both payloads are the model's: text, audio samples, video frames - the shape
       * is the model's codec's business and nothing about it reaches this layer.
       *
       * @param {Uint8Array} input the model's encoded input
       * @param {Uint8Array} options the model's encoded options
       * @param {{ group?: string, deviceId?: string | (() => string) }} [call]
       */
      async run(input, options, call = {}) {
        if (this.#handle == null) throw new Error(`${this.#packageName}: model disposed`);
        const group = call.group != null ? String(call.group) : null;
        const deviceId = typeof call.deviceId === "function" ? call.deviceId() : call.deviceId;
        return this.#core.run(
          this.#handle,
          input,
          options,
          group,
          deviceId != null ? String(deviceId) : null
        );
      }
      /** Whether the model is usable with no network. */
      isDownloaded() {
        return this.#handle != null && this.#core.isDownloaded(this.#handle);
      }
      /**
       * Run `body(group)` with a fresh call-group id, so every call inside that
       * passes `{ group }` bills as a single usage call. Released when `body`
       * settles.
       */
      withCallGroup(body) {
        return this.#core.withCallGroup(body);
      }
      /**
       * Emit the usage this runtime has recorded and await the POST, so a process
       * that ends immediately after an inference does not exit before it lands. One
       * load per device per call, whatever the re-emit window says.
       */
      flushTelemetry() {
        return this.#core.flushTelemetry?.() ?? Promise.resolve(true);
      }
      /** Release the model. Calls afterwards throw. */
      dispose() {
        if (this.#handle == null) return;
        this.#core.destroy(this.#handle);
        this.#handle = null;
      }
    };
    __name(readyModel, "readyModel");
    __name(wasmCore, "wasmCore");
    __name(createWasmSdk, "createWasmSdk");
  }
});

// node_modules/@desert-ant-labs/core/src/voz.js
var init_voz = __esm({
  "node_modules/@desert-ant-labs/core/src/voz.js"() {
    init_modules_watch_stub();
  }
});

// node_modules/@desert-ant-labs/core/index.js
var init_core = __esm({
  "node_modules/@desert-ant-labs/core/index.js"() {
    init_modules_watch_stub();
    init_ffi();
    init_callgroup();
    init_sdk();
    init_litert();
    init_voz();
  }
});

// node_modules/@desert-ant-labs/gist/dist/runtime.js
function assertNever(x, message) {
  throw new Error(message);
}
function decodeObjectRefs(ptr, length, memory) {
  const basePtr = ptr >>> 0;
  const count = length >>> 0;
  const result = new Array(count);
  for (let i = 0; i < count; i++) {
    result[i] = memory.getUint32(basePtr + 4 * i, true);
  }
  return result;
}
function serializeError(error) {
  if (error instanceof Error) {
    return {
      isError: true,
      value: {
        message: error.message,
        name: error.name,
        stack: error.stack
      }
    };
  }
  return { isError: false, value: error };
}
function deserializeError(error) {
  if (error.isError) {
    return Object.assign(new Error(error.value.message), error.value);
  }
  return error.value;
}
var SwiftClosureDeallocator, MAIN_THREAD_TID, decode, decodeArray, write, writeAndReturnKindBits, ITCInterface, MessageBroker, globalVariable, SLOT_BITS, SLOT_MASK, GEN_MASK, JSObjectSpace, SwiftRuntime, UnsafeEventLoopYield;
var init_runtime = __esm({
  "node_modules/@desert-ant-labs/gist/dist/runtime.js"() {
    init_modules_watch_stub();
    SwiftClosureDeallocator = class {
      static {
        __name(this, "SwiftClosureDeallocator");
      }
      constructor(exports$1) {
        if (typeof FinalizationRegistry === "undefined") {
          throw new Error("The Swift part of JavaScriptKit was configured to require the availability of JavaScript WeakRefs. Please build with `-Xswiftc -DJAVASCRIPTKIT_WITHOUT_WEAKREFS` to disable features that use WeakRefs.");
        }
        this.functionRegistry = new FinalizationRegistry((id) => {
          exports$1.swjs_free_host_function(id);
        });
      }
      track(func, func_ref) {
        this.functionRegistry.register(func, func_ref);
      }
    };
    __name(assertNever, "assertNever");
    MAIN_THREAD_TID = -1;
    decode = /* @__PURE__ */ __name((kind, payload1, payload2, objectSpace) => {
      switch (kind) {
        case 0:
          switch (payload1) {
            case 0:
              return false;
            case 1:
              return true;
          }
        // falls through
        case 2:
          return payload2;
        case 1:
        case 3:
        case 7:
        case 8:
          return objectSpace.getObject(payload1);
        case 4:
          return null;
        case 5:
          return void 0;
        default:
          assertNever(kind, `JSValue Type kind "${kind}" is not supported`);
      }
    }, "decode");
    decodeArray = /* @__PURE__ */ __name((ptr, length, memory, objectSpace) => {
      const basePtr = ptr >>> 0;
      const count = length >>> 0;
      if (count === 0) {
        return [];
      }
      let result = [];
      for (let index = 0; index < count; index++) {
        const base = basePtr + 16 * index;
        const kind = memory.getUint32(base, true);
        const payload1 = memory.getUint32(base + 4, true);
        const payload2 = memory.getFloat64(base + 8, true);
        result.push(decode(kind, payload1, payload2, objectSpace));
      }
      return result;
    }, "decodeArray");
    write = /* @__PURE__ */ __name((value, kind_ptr, payload1_ptr, payload2_ptr, is_exception, memory, objectSpace) => {
      const kind = writeAndReturnKindBits(value, payload1_ptr, payload2_ptr, is_exception, memory, objectSpace);
      memory.setUint32(kind_ptr >>> 0, kind, true);
    }, "write");
    writeAndReturnKindBits = /* @__PURE__ */ __name((value, payload1_ptr, payload2_ptr, is_exception, memory, objectSpace) => {
      const exceptionBit = (is_exception ? 1 : 0) << 31;
      const payload1Offset = payload1_ptr >>> 0;
      const payload2Offset = payload2_ptr >>> 0;
      if (value === null) {
        return exceptionBit | 4;
      }
      const writeRef = /* @__PURE__ */ __name((kind) => {
        memory.setUint32(payload1Offset, objectSpace.retain(value), true);
        return exceptionBit | kind;
      }, "writeRef");
      const type = typeof value;
      switch (type) {
        case "boolean": {
          memory.setUint32(payload1Offset, value ? 1 : 0, true);
          return exceptionBit | 0;
        }
        case "number": {
          memory.setFloat64(payload2Offset, value, true);
          return exceptionBit | 2;
        }
        case "string": {
          return writeRef(
            1
            /* Kind.String */
          );
        }
        case "undefined": {
          return exceptionBit | 5;
        }
        case "object": {
          return writeRef(
            3
            /* Kind.Object */
          );
        }
        case "function": {
          return writeRef(
            3
            /* Kind.Object */
          );
        }
        case "symbol": {
          return writeRef(
            7
            /* Kind.Symbol */
          );
        }
        case "bigint": {
          return writeRef(
            8
            /* Kind.BigInt */
          );
        }
        default:
          assertNever(type, `Type "${type}" is not supported yet`);
      }
      throw new Error("Unreachable");
    }, "writeAndReturnKindBits");
    __name(decodeObjectRefs, "decodeObjectRefs");
    ITCInterface = class {
      static {
        __name(this, "ITCInterface");
      }
      constructor(memory) {
        this.memory = memory;
      }
      send(sendingObject, transferringObjects, sendingContext) {
        const object = this.memory.getObject(sendingObject);
        const transfer = transferringObjects.map((ref) => this.memory.getObject(ref));
        return { object, sendingContext, transfer };
      }
      sendObjects(sendingObjects, transferringObjects, sendingContext) {
        const objects = sendingObjects.map((ref) => this.memory.getObject(ref));
        const transfer = transferringObjects.map((ref) => this.memory.getObject(ref));
        return { object: objects, sendingContext, transfer };
      }
      invokeRemoteJSObjectBody(invocationContext) {
        return { object: void 0, transfer: [] };
      }
      release(objectRef) {
        this.memory.release(objectRef);
        return { object: void 0, transfer: [] };
      }
    };
    MessageBroker = class {
      static {
        __name(this, "MessageBroker");
      }
      constructor(selfTid, threadChannel, handlers) {
        this.selfTid = selfTid;
        this.threadChannel = threadChannel;
        this.handlers = handlers;
      }
      request(message) {
        if (message.data.targetTid == this.selfTid) {
          this.handlers.onRequest(message);
        } else if ("postMessageToWorkerThread" in this.threadChannel) {
          this.threadChannel.postMessageToWorkerThread(message.data.targetTid, message, []);
        } else if ("postMessageToMainThread" in this.threadChannel) {
          this.threadChannel.postMessageToMainThread(message, []);
        } else {
          throw new Error("unreachable");
        }
      }
      reply(message) {
        if (message.data.sourceTid == this.selfTid) {
          this.handlers.onResponse(message);
          return;
        }
        const transfer = message.data.response.ok ? message.data.response.value.transfer : [];
        if ("postMessageToWorkerThread" in this.threadChannel) {
          this.threadChannel.postMessageToWorkerThread(message.data.sourceTid, message, transfer);
        } else if ("postMessageToMainThread" in this.threadChannel) {
          this.threadChannel.postMessageToMainThread(message, transfer);
        } else {
          throw new Error("unreachable");
        }
      }
      onReceivingRequest(message) {
        if (message.data.targetTid == this.selfTid) {
          this.handlers.onRequest(message);
        } else if ("postMessageToWorkerThread" in this.threadChannel) {
          this.threadChannel.postMessageToWorkerThread(message.data.targetTid, message, []);
        } else if ("postMessageToMainThread" in this.threadChannel) {
          throw new Error("unreachable");
        }
      }
      onReceivingResponse(message) {
        if (message.data.sourceTid == this.selfTid) {
          this.handlers.onResponse(message);
        } else if ("postMessageToWorkerThread" in this.threadChannel) {
          const transfer = message.data.response.ok ? message.data.response.value.transfer : [];
          this.threadChannel.postMessageToWorkerThread(message.data.sourceTid, message, transfer);
        } else if ("postMessageToMainThread" in this.threadChannel) {
          throw new Error("unreachable");
        }
      }
    };
    __name(serializeError, "serializeError");
    __name(deserializeError, "deserializeError");
    globalVariable = globalThis;
    SLOT_BITS = 24;
    SLOT_MASK = (1 << SLOT_BITS) - 1;
    GEN_MASK = (1 << 32 - SLOT_BITS) - 1;
    JSObjectSpace = class {
      static {
        __name(this, "JSObjectSpace");
      }
      constructor() {
        this._slotByValue = /* @__PURE__ */ new Map();
        this._values = [];
        this._stateBySlot = [];
        this._freeSlotStack = [];
        this._values[0] = void 0;
        this._values[1] = globalVariable;
        this._slotByValue.set(globalVariable, 1);
        this._stateBySlot[1] = 1;
      }
      retain(value) {
        const slot = this._slotByValue.get(value);
        if (slot !== void 0) {
          const state2 = this._stateBySlot[slot];
          const nextState = state2 + 1 >>> 0;
          if ((nextState & SLOT_MASK) === 0) {
            throw new RangeError(`Reference count overflow at slot ${slot}`);
          }
          this._stateBySlot[slot] = nextState;
          return (nextState & ~SLOT_MASK | slot) >>> 0;
        }
        let newSlot;
        let state;
        if (this._freeSlotStack.length > 0) {
          newSlot = this._freeSlotStack.pop();
          const gen = this._stateBySlot[newSlot] >>> SLOT_BITS;
          state = (gen << SLOT_BITS | 1) >>> 0;
        } else {
          newSlot = this._values.length;
          if (newSlot > SLOT_MASK) {
            throw new RangeError(`Reference slot overflow: ${newSlot} exceeds ${SLOT_MASK}`);
          }
          state = 1;
        }
        this._stateBySlot[newSlot] = state;
        this._values[newSlot] = value;
        this._slotByValue.set(value, newSlot);
        return (state & ~SLOT_MASK | newSlot) >>> 0;
      }
      retainByRef(reference) {
        const state = this._getValidatedSlotState(reference);
        const slot = reference & SLOT_MASK;
        const nextState = state + 1 >>> 0;
        if ((nextState & SLOT_MASK) === 0) {
          throw new RangeError(`Reference count overflow at slot ${slot}`);
        }
        this._stateBySlot[slot] = nextState;
        return reference;
      }
      release(reference) {
        const state = this._getValidatedSlotState(reference);
        const slot = reference & SLOT_MASK;
        if ((state & SLOT_MASK) > 1) {
          this._stateBySlot[slot] = state - 1 >>> 0;
          return;
        }
        this._slotByValue.delete(this._values[slot]);
        this._values[slot] = void 0;
        const nextGen = (state >>> SLOT_BITS) + 1 & GEN_MASK;
        this._stateBySlot[slot] = nextGen << SLOT_BITS >>> 0;
        this._freeSlotStack.push(slot);
      }
      getObject(reference) {
        this._getValidatedSlotState(reference);
        return this._values[reference & SLOT_MASK];
      }
      // Returns the packed state for the slot, after validating the reference.
      _getValidatedSlotState(reference) {
        const slot = reference & SLOT_MASK;
        if (slot === 0)
          throw new ReferenceError(`Attempted to use invalid reference ${reference}`);
        const state = this._stateBySlot[slot];
        if (state === void 0 || (state & SLOT_MASK) === 0) {
          throw new ReferenceError(`Attempted to use invalid reference ${reference}`);
        }
        if (state >>> SLOT_BITS !== reference >>> SLOT_BITS) {
          throw new ReferenceError(`Attempted to use stale reference ${reference}`);
        }
        return state;
      }
    };
    SwiftRuntime = class {
      static {
        __name(this, "SwiftRuntime");
      }
      constructor(options) {
        this.version = 708;
        this.textDecoder = new TextDecoder("utf-8");
        this.textEncoder = new TextEncoder();
        this.UnsafeEventLoopYield = UnsafeEventLoopYield;
        this.importObjects = () => this.wasmImports;
        this._instance = null;
        this.memory = new JSObjectSpace();
        this._closureDeallocator = null;
        this.tid = null;
        this.options = options || {};
        this.getDataView = () => {
          throw new Error("Please call setInstance() before using any JavaScriptKit APIs from Swift.");
        };
        this.getUint8Array = () => {
          throw new Error("Please call setInstance() before using any JavaScriptKit APIs from Swift.");
        };
        this.wasmMemory = null;
      }
      setInstance(instance) {
        this._instance = instance;
        const wasmMemory = instance.exports.memory;
        if (wasmMemory instanceof WebAssembly.Memory) {
          let cachedDataView = new DataView(wasmMemory.buffer);
          let cachedUint8Array = new Uint8Array(wasmMemory.buffer);
          if (Object.getPrototypeOf(wasmMemory.buffer).constructor.name === "SharedArrayBuffer") {
            this.getDataView = () => {
              if (cachedDataView.buffer !== wasmMemory.buffer) {
                cachedDataView = new DataView(wasmMemory.buffer);
              }
              return cachedDataView;
            };
            this.getUint8Array = () => {
              if (cachedUint8Array.buffer !== wasmMemory.buffer) {
                cachedUint8Array = new Uint8Array(wasmMemory.buffer);
              }
              return cachedUint8Array;
            };
          } else {
            this.getDataView = () => {
              if (cachedDataView.buffer.byteLength === 0) {
                cachedDataView = new DataView(wasmMemory.buffer);
              }
              return cachedDataView;
            };
            this.getUint8Array = () => {
              if (cachedUint8Array.byteLength === 0) {
                cachedUint8Array = new Uint8Array(wasmMemory.buffer);
              }
              return cachedUint8Array;
            };
          }
          this.wasmMemory = wasmMemory;
        } else {
          throw new Error("instance.exports.memory is not a WebAssembly.Memory!?");
        }
        if (typeof this.exports._start === "function") {
          throw new Error(`JavaScriptKit supports only WASI reactor ABI.
                Please make sure you are building with:
                -Xswiftc -Xclang-linker -Xswiftc -mexec-model=reactor
                `);
        }
        if (this.exports.swjs_library_version() != this.version) {
          throw new Error(`The versions of JavaScriptKit are incompatible.
                WebAssembly runtime ${this.exports.swjs_library_version()} != JS runtime ${this.version}`);
        }
      }
      main() {
        const instance = this.instance;
        try {
          if (typeof instance.exports.main === "function") {
            instance.exports.main();
          } else if (typeof instance.exports.__main_argc_argv === "function") {
            instance.exports.__main_argc_argv(0, 0);
          }
        } catch (error) {
          if (error instanceof UnsafeEventLoopYield) {
            return;
          }
          throw error;
        }
      }
      /**
       * Start a new thread with the given `tid` and `startArg`, which
       * is forwarded to the `wasi_thread_start` function.
       * This function is expected to be called from the spawned Web Worker thread.
       */
      startThread(tid, startArg) {
        this.tid = tid;
        const instance = this.instance;
        try {
          if (typeof instance.exports.wasi_thread_start === "function") {
            instance.exports.wasi_thread_start(tid, startArg);
          } else {
            throw new Error(`The WebAssembly module is not built for wasm32-unknown-wasip1-threads target.`);
          }
        } catch (error) {
          if (error instanceof UnsafeEventLoopYield) {
            return;
          }
          throw error;
        }
      }
      get instance() {
        if (!this._instance)
          throw new Error("WebAssembly instance is not set yet");
        return this._instance;
      }
      get exports() {
        return this.instance.exports;
      }
      get closureDeallocator() {
        if (this._closureDeallocator)
          return this._closureDeallocator;
        const features = this.exports.swjs_library_features();
        const librarySupportsWeakRef = (features & 1) != 0;
        if (librarySupportsWeakRef) {
          this._closureDeallocator = new SwiftClosureDeallocator(this.exports);
        }
        return this._closureDeallocator;
      }
      callHostFunction(host_func_id, line, file, args) {
        const argc = args.length;
        const argv = this.exports.swjs_prepare_host_function_call(argc);
        const memory = this.memory;
        const dataView = this.getDataView();
        for (let index = 0; index < args.length; index++) {
          const argument = args[index];
          const base = argv + 16 * index;
          write(argument, base, base + 4, base + 8, false, dataView, memory);
        }
        let output;
        const callback_func_ref = memory.retain((result) => {
          output = result;
        });
        const alreadyReleased = this.exports.swjs_call_host_function(host_func_id, argv, argc, callback_func_ref);
        if (alreadyReleased) {
          throw new Error(`The JSClosure has been already released by Swift side. The closure is created at ${file}:${line} @${host_func_id}`);
        }
        this.exports.swjs_cleanup_host_function_call(argv);
        return output;
      }
      get wasmImports() {
        let broker = null;
        const getMessageBroker = /* @__PURE__ */ __name((threadChannel) => {
          var _a;
          if (broker)
            return broker;
          const itcInterface = new ITCInterface(this.memory);
          const defaultRequestHandler = /* @__PURE__ */ __name((message) => {
            const request = message.data.request;
            const result = itcInterface[request.method].apply(itcInterface, request.parameters);
            return { ok: true, value: result };
          }, "defaultRequestHandler");
          const requestHandlers = {
            invokeRemoteJSObjectBody: /* @__PURE__ */ __name((message) => {
              const invocationContext = message.data.request.parameters[0];
              const hasError = this.exports.swjs_invoke_remote_jsobject_body(invocationContext);
              return {
                ok: true,
                value: {
                  object: hasError,
                  sendingContext: message.data.context,
                  transfer: []
                }
              };
            }, "invokeRemoteJSObjectBody")
          };
          const defaultResponseHandler = /* @__PURE__ */ __name((message) => {
            if (message.data.response.ok) {
              const object = this.memory.retain(message.data.response.value.object);
              this.exports.swjs_receive_response(object, message.data.context);
            } else {
              const error = deserializeError(message.data.response.error);
              const errorObject = this.memory.retain(error);
              this.exports.swjs_receive_error(errorObject, message.data.context);
            }
          }, "defaultResponseHandler");
          const responseHandlers = {
            invokeRemoteJSObjectBody: /* @__PURE__ */ __name((_message) => {
            }, "invokeRemoteJSObjectBody")
          };
          const newBroker = new MessageBroker((_a = this.tid) !== null && _a !== void 0 ? _a : -1, threadChannel, {
            onRequest: /* @__PURE__ */ __name((message) => {
              var _a2;
              let returnValue;
              try {
                const method = message.data.request.method;
                const handler = (_a2 = requestHandlers[method]) !== null && _a2 !== void 0 ? _a2 : defaultRequestHandler;
                returnValue = handler(message);
              } catch (error) {
                returnValue = {
                  ok: false,
                  error: serializeError(error)
                };
              }
              const responseMessage = {
                type: "response",
                data: {
                  sourceTid: message.data.sourceTid,
                  context: message.data.context,
                  requestMethod: message.data.request.method,
                  response: returnValue
                }
              };
              try {
                newBroker.reply(responseMessage);
              } catch (error) {
                responseMessage.data.response = {
                  ok: false,
                  error: serializeError(new TypeError(`Failed to serialize message: ${error}`))
                };
                newBroker.reply(responseMessage);
              }
            }, "onRequest"),
            onResponse: /* @__PURE__ */ __name((message) => {
              var _a2;
              const method = message.data.requestMethod;
              const handler = (_a2 = responseHandlers[method]) !== null && _a2 !== void 0 ? _a2 : defaultResponseHandler;
              handler(message);
            }, "onResponse")
          });
          broker = newBroker;
          return newBroker;
        }, "getMessageBroker");
        return {
          swjs_set_prop: /* @__PURE__ */ __name((ref, name, kind, payload1, payload2) => {
            const memory = this.memory;
            const obj = memory.getObject(ref);
            const key = memory.getObject(name);
            const value = decode(kind, payload1, payload2, memory);
            obj[key] = value;
          }, "swjs_set_prop"),
          swjs_get_prop: /* @__PURE__ */ __name((ref, name, payload1_ptr, payload2_ptr) => {
            const memory = this.memory;
            const obj = memory.getObject(ref);
            const key = memory.getObject(name);
            const result = obj[key];
            return writeAndReturnKindBits(result, payload1_ptr, payload2_ptr, false, this.getDataView(), this.memory);
          }, "swjs_get_prop"),
          swjs_set_subscript: /* @__PURE__ */ __name((ref, index, kind, payload1, payload2) => {
            const memory = this.memory;
            const obj = memory.getObject(ref);
            const value = decode(kind, payload1, payload2, memory);
            obj[index] = value;
          }, "swjs_set_subscript"),
          swjs_get_subscript: /* @__PURE__ */ __name((ref, index, payload1_ptr, payload2_ptr) => {
            const obj = this.memory.getObject(ref);
            const result = obj[index];
            return writeAndReturnKindBits(result, payload1_ptr, payload2_ptr, false, this.getDataView(), this.memory);
          }, "swjs_get_subscript"),
          swjs_encode_string: /* @__PURE__ */ __name((ref, bytes_ptr_result) => {
            const memory = this.memory;
            const bytes = this.textEncoder.encode(memory.getObject(ref));
            const bytes_ptr = memory.retain(bytes);
            this.getDataView().setUint32(bytes_ptr_result >>> 0, bytes_ptr, true);
            return bytes.length;
          }, "swjs_encode_string"),
          swjs_decode_string: (
            // NOTE: TextDecoder can't decode typed arrays backed by SharedArrayBuffer
            this.options.sharedMemory == true ? (bytes_ptr, length) => {
              const bytesOffset = bytes_ptr >>> 0;
              const byteLength = length >>> 0;
              const bytes = this.getUint8Array().slice(bytesOffset, bytesOffset + byteLength);
              const string = this.textDecoder.decode(bytes);
              return this.memory.retain(string);
            } : (bytes_ptr, length) => {
              const bytesOffset = bytes_ptr >>> 0;
              const byteLength = length >>> 0;
              const bytes = this.getUint8Array().subarray(bytesOffset, bytesOffset + byteLength);
              const string = this.textDecoder.decode(bytes);
              return this.memory.retain(string);
            }
          ),
          swjs_load_string: /* @__PURE__ */ __name((ref, buffer) => {
            const bytes = this.memory.getObject(ref);
            this.getUint8Array().set(bytes, buffer >>> 0);
          }, "swjs_load_string"),
          swjs_call_function: /* @__PURE__ */ __name((ref, argv, argc, payload1_ptr, payload2_ptr) => {
            const memory = this.memory;
            const func = memory.getObject(ref);
            let result;
            try {
              const args = decodeArray(argv, argc, this.getDataView(), memory);
              result = func(...args);
            } catch (error) {
              return writeAndReturnKindBits(error, payload1_ptr, payload2_ptr, true, this.getDataView(), this.memory);
            }
            return writeAndReturnKindBits(result, payload1_ptr, payload2_ptr, false, this.getDataView(), this.memory);
          }, "swjs_call_function"),
          swjs_call_function_no_catch: /* @__PURE__ */ __name((ref, argv, argc, payload1_ptr, payload2_ptr) => {
            const memory = this.memory;
            const func = memory.getObject(ref);
            const args = decodeArray(argv, argc, this.getDataView(), memory);
            const result = func(...args);
            return writeAndReturnKindBits(result, payload1_ptr, payload2_ptr, false, this.getDataView(), this.memory);
          }, "swjs_call_function_no_catch"),
          swjs_call_function_with_this: /* @__PURE__ */ __name((obj_ref, func_ref, argv, argc, payload1_ptr, payload2_ptr) => {
            const memory = this.memory;
            const obj = memory.getObject(obj_ref);
            const func = memory.getObject(func_ref);
            let result;
            try {
              const args = decodeArray(argv, argc, this.getDataView(), memory);
              result = func.apply(obj, args);
            } catch (error) {
              return writeAndReturnKindBits(error, payload1_ptr, payload2_ptr, true, this.getDataView(), this.memory);
            }
            return writeAndReturnKindBits(result, payload1_ptr, payload2_ptr, false, this.getDataView(), this.memory);
          }, "swjs_call_function_with_this"),
          swjs_call_function_with_this_no_catch: /* @__PURE__ */ __name((obj_ref, func_ref, argv, argc, payload1_ptr, payload2_ptr) => {
            const memory = this.memory;
            const obj = memory.getObject(obj_ref);
            const func = memory.getObject(func_ref);
            const args = decodeArray(argv, argc, this.getDataView(), memory);
            const result = func.apply(obj, args);
            return writeAndReturnKindBits(result, payload1_ptr, payload2_ptr, false, this.getDataView(), this.memory);
          }, "swjs_call_function_with_this_no_catch"),
          swjs_call_new: /* @__PURE__ */ __name((ref, argv, argc) => {
            const memory = this.memory;
            const constructor = memory.getObject(ref);
            const args = decodeArray(argv, argc, this.getDataView(), memory);
            const instance = new constructor(...args);
            return this.memory.retain(instance);
          }, "swjs_call_new"),
          swjs_call_throwing_new: /* @__PURE__ */ __name((ref, argv, argc, exception_kind_ptr, exception_payload1_ptr, exception_payload2_ptr) => {
            let memory = this.memory;
            const constructor = memory.getObject(ref);
            let result;
            try {
              const args = decodeArray(argv, argc, this.getDataView(), memory);
              result = new constructor(...args);
            } catch (error) {
              write(error, exception_kind_ptr, exception_payload1_ptr, exception_payload2_ptr, true, this.getDataView(), this.memory);
              return -1;
            }
            memory = this.memory;
            write(null, exception_kind_ptr, exception_payload1_ptr, exception_payload2_ptr, false, this.getDataView(), memory);
            return memory.retain(result);
          }, "swjs_call_throwing_new"),
          swjs_instanceof: /* @__PURE__ */ __name((obj_ref, constructor_ref) => {
            const memory = this.memory;
            const obj = memory.getObject(obj_ref);
            const constructor = memory.getObject(constructor_ref);
            return obj instanceof constructor;
          }, "swjs_instanceof"),
          swjs_value_equals: /* @__PURE__ */ __name((lhs_ref, rhs_ref) => {
            const memory = this.memory;
            const lhs = memory.getObject(lhs_ref);
            const rhs = memory.getObject(rhs_ref);
            return lhs == rhs;
          }, "swjs_value_equals"),
          swjs_create_function: /* @__PURE__ */ __name((host_func_id, line, file) => {
            var _a;
            const fileString = this.memory.getObject(file);
            const func = /* @__PURE__ */ __name((...args) => this.callHostFunction(host_func_id, line, fileString, args), "func");
            const func_ref = this.memory.retain(func);
            (_a = this.closureDeallocator) === null || _a === void 0 ? void 0 : _a.track(func, host_func_id);
            return func_ref;
          }, "swjs_create_function"),
          swjs_create_oneshot_function: /* @__PURE__ */ __name((host_func_id, line, file) => {
            const fileString = this.memory.getObject(file);
            const func = /* @__PURE__ */ __name((...args) => this.callHostFunction(host_func_id, line, fileString, args), "func");
            const func_ref = this.memory.retain(func);
            return func_ref;
          }, "swjs_create_oneshot_function"),
          swjs_create_typed_array: /* @__PURE__ */ __name((constructor_ref, elementsPtr, length) => {
            const ArrayType = this.memory.getObject(constructor_ref);
            if (length == 0) {
              return this.memory.retain(new ArrayType());
            }
            const array = new ArrayType(this.wasmMemory.buffer, elementsPtr >>> 0, length >>> 0);
            return this.memory.retain(array.slice());
          }, "swjs_create_typed_array"),
          swjs_create_object: /* @__PURE__ */ __name(() => {
            return this.memory.retain({});
          }, "swjs_create_object"),
          swjs_load_typed_array: /* @__PURE__ */ __name((ref, buffer) => {
            const memory = this.memory;
            const typedArray = memory.getObject(ref);
            const bytes = new Uint8Array(typedArray.buffer);
            this.getUint8Array().set(bytes, buffer >>> 0);
          }, "swjs_load_typed_array"),
          swjs_release: /* @__PURE__ */ __name((ref) => {
            this.memory.release(ref);
          }, "swjs_release"),
          swjs_release_remote: /* @__PURE__ */ __name((tid, ref) => {
            var _a;
            if (!this.options.threadChannel) {
              throw new Error("threadChannel is not set in options given to SwiftRuntime. Please set it to release objects on remote threads.");
            }
            const broker2 = getMessageBroker(this.options.threadChannel);
            broker2.request({
              type: "request",
              data: {
                sourceTid: (_a = this.tid) !== null && _a !== void 0 ? _a : MAIN_THREAD_TID,
                targetTid: tid,
                context: 0,
                request: {
                  method: "release",
                  parameters: [ref]
                }
              }
            });
          }, "swjs_release_remote"),
          swjs_i64_to_bigint: /* @__PURE__ */ __name((value, signed) => {
            return this.memory.retain(signed ? value : BigInt.asUintN(64, value));
          }, "swjs_i64_to_bigint"),
          swjs_bigint_to_i64: /* @__PURE__ */ __name((ref, signed) => {
            const object = this.memory.getObject(ref);
            if (typeof object !== "bigint") {
              throw new Error(`Expected a BigInt, but got ${typeof object}`);
            }
            if (signed) {
              return object;
            } else {
              if (object < BigInt(0)) {
                return BigInt(0);
              }
              return BigInt.asIntN(64, object);
            }
          }, "swjs_bigint_to_i64"),
          swjs_i64_to_bigint_slow: /* @__PURE__ */ __name((lower, upper, signed) => {
            const value = BigInt.asUintN(32, BigInt(lower)) + (BigInt.asUintN(32, BigInt(upper)) << BigInt(32));
            return this.memory.retain(signed ? BigInt.asIntN(64, value) : BigInt.asUintN(64, value));
          }, "swjs_i64_to_bigint_slow"),
          swjs_unsafe_event_loop_yield: /* @__PURE__ */ __name(() => {
            throw new UnsafeEventLoopYield();
          }, "swjs_unsafe_event_loop_yield"),
          swjs_send_job_to_main_thread: /* @__PURE__ */ __name((unowned_job) => {
            this.postMessageToMainThread({
              type: "job",
              data: unowned_job
            });
          }, "swjs_send_job_to_main_thread"),
          swjs_listen_message_from_main_thread: /* @__PURE__ */ __name(() => {
            const threadChannel = this.options.threadChannel;
            if (!(threadChannel && "listenMessageFromMainThread" in threadChannel)) {
              throw new Error("listenMessageFromMainThread is not set in options given to SwiftRuntime. Please set it to listen to wake events from the main thread.");
            }
            const broker2 = getMessageBroker(threadChannel);
            threadChannel.listenMessageFromMainThread((message) => {
              switch (message.type) {
                case "wake":
                  this.exports.swjs_wake_worker_thread();
                  break;
                case "request": {
                  broker2.onReceivingRequest(message);
                  break;
                }
                case "response": {
                  broker2.onReceivingResponse(message);
                  break;
                }
                default: {
                  const unknownMessage = message;
                  throw new Error(`Unknown message type: ${unknownMessage}`);
                }
              }
            });
          }, "swjs_listen_message_from_main_thread"),
          swjs_wake_up_worker_thread: /* @__PURE__ */ __name((tid) => {
            this.postMessageToWorkerThread(tid, { type: "wake" });
          }, "swjs_wake_up_worker_thread"),
          swjs_listen_message_from_worker_thread: /* @__PURE__ */ __name((tid) => {
            const threadChannel = this.options.threadChannel;
            if (!(threadChannel && "listenMessageFromWorkerThread" in threadChannel)) {
              throw new Error("listenMessageFromWorkerThread is not set in options given to SwiftRuntime. Please set it to listen to jobs from worker threads.");
            }
            const broker2 = getMessageBroker(threadChannel);
            threadChannel.listenMessageFromWorkerThread(tid, (message) => {
              switch (message.type) {
                case "job":
                  this.exports.swjs_enqueue_main_job_from_worker(message.data);
                  break;
                case "request": {
                  broker2.onReceivingRequest(message);
                  break;
                }
                case "response": {
                  broker2.onReceivingResponse(message);
                  break;
                }
                default: {
                  const unknownMessage = message;
                  throw new Error(`Unknown message type: ${unknownMessage}`);
                }
              }
            });
          }, "swjs_listen_message_from_worker_thread"),
          swjs_terminate_worker_thread: /* @__PURE__ */ __name((tid) => {
            var _a;
            const threadChannel = this.options.threadChannel;
            if (threadChannel && "terminateWorkerThread" in threadChannel) {
              (_a = threadChannel.terminateWorkerThread) === null || _a === void 0 ? void 0 : _a.call(threadChannel, tid);
            }
          }, "swjs_terminate_worker_thread"),
          swjs_get_worker_thread_id: /* @__PURE__ */ __name(() => {
            return this.tid || -1;
          }, "swjs_get_worker_thread_id"),
          swjs_request_sending_object: /* @__PURE__ */ __name((sending_object, transferring_objects, transferring_objects_count, object_source_tid, sending_context) => {
            var _a;
            if (!this.options.threadChannel) {
              throw new Error("threadChannel is not set in options given to SwiftRuntime. Please set it to request transferring objects.");
            }
            const broker2 = getMessageBroker(this.options.threadChannel);
            const transferringObjects = decodeObjectRefs(transferring_objects, transferring_objects_count, this.getDataView());
            broker2.request({
              type: "request",
              data: {
                sourceTid: (_a = this.tid) !== null && _a !== void 0 ? _a : MAIN_THREAD_TID,
                targetTid: object_source_tid,
                context: sending_context,
                request: {
                  method: "send",
                  parameters: [
                    sending_object,
                    transferringObjects,
                    sending_context
                  ]
                }
              }
            });
          }, "swjs_request_sending_object"),
          swjs_request_sending_objects: /* @__PURE__ */ __name((sending_objects, sending_objects_count, transferring_objects, transferring_objects_count, object_source_tid, sending_context) => {
            var _a;
            if (!this.options.threadChannel) {
              throw new Error("threadChannel is not set in options given to SwiftRuntime. Please set it to request transferring objects.");
            }
            const broker2 = getMessageBroker(this.options.threadChannel);
            const dataView = this.getDataView();
            const sendingObjects = decodeObjectRefs(sending_objects, sending_objects_count, dataView);
            const transferringObjects = decodeObjectRefs(transferring_objects, transferring_objects_count, dataView);
            broker2.request({
              type: "request",
              data: {
                sourceTid: (_a = this.tid) !== null && _a !== void 0 ? _a : MAIN_THREAD_TID,
                targetTid: object_source_tid,
                context: sending_context,
                request: {
                  method: "sendObjects",
                  parameters: [
                    sendingObjects,
                    transferringObjects,
                    sending_context
                  ]
                }
              }
            });
          }, "swjs_request_sending_objects"),
          swjs_request_remote_jsobject_body: /* @__PURE__ */ __name((object_source_tid, invocation_context) => {
            var _a;
            if (!this.options.threadChannel) {
              throw new Error("threadChannel is not set in options given to SwiftRuntime. Please set it to request remote JSObject access.");
            }
            const broker2 = getMessageBroker(this.options.threadChannel);
            broker2.request({
              type: "request",
              data: {
                sourceTid: (_a = this.tid) !== null && _a !== void 0 ? _a : MAIN_THREAD_TID,
                targetTid: object_source_tid,
                context: invocation_context,
                request: {
                  method: "invokeRemoteJSObjectBody",
                  parameters: [invocation_context]
                }
              }
            });
          }, "swjs_request_remote_jsobject_body")
        };
      }
      postMessageToMainThread(message, transfer = []) {
        const threadChannel = this.options.threadChannel;
        if (!(threadChannel && "postMessageToMainThread" in threadChannel)) {
          throw new Error("postMessageToMainThread is not set in options given to SwiftRuntime. Please set it to send messages to the main thread.");
        }
        threadChannel.postMessageToMainThread(message, transfer);
      }
      postMessageToWorkerThread(tid, message, transfer = []) {
        const threadChannel = this.options.threadChannel;
        if (!(threadChannel && "postMessageToWorkerThread" in threadChannel)) {
          throw new Error("postMessageToWorkerThread is not set in options given to SwiftRuntime. Please set it to send messages to worker threads.");
        }
        threadChannel.postMessageToWorkerThread(tid, message, transfer);
      }
    };
    UnsafeEventLoopYield = class extends Error {
      static {
        __name(this, "UnsafeEventLoopYield");
      }
    };
  }
});

// node_modules/@desert-ant-labs/gist/dist/bridge-js.js
async function createInstantiator(options, swift) {
  let instance;
  let memory;
  let setException;
  let decodeString;
  const textDecoder = new TextDecoder("utf-8");
  const textEncoder = new TextEncoder("utf-8");
  let tmpRetString;
  let tmpRetBytes;
  let tmpRetException;
  let tmpRetOptionalBool;
  let tmpRetOptionalInt;
  let tmpRetOptionalFloat;
  let tmpRetOptionalDouble;
  let tmpRetOptionalHeapObject;
  let strStack = [];
  let i32Stack = [];
  let i64Stack = [];
  let f32Stack = [];
  let f64Stack = [];
  let ptrStack = [];
  let taStack = [];
  const enumHelpers = {};
  const structHelpers = {};
  let _exports = null;
  let bjs = null;
  const __bjs_arrayCodecCache = /* @__PURE__ */ new WeakMap();
  function __bjs_arrayCodec(elementCodec) {
    let codec = __bjs_arrayCodecCache.get(elementCodec);
    if (codec !== void 0) {
      return codec;
    }
    codec = {
      lower(value) {
        for (let i = 0; i < value.length; i++) {
          elementCodec.lower(value[i]);
        }
        i32Stack.push(value.length);
      },
      lift() {
        const count = i32Stack.pop();
        if (count === -1) {
          return taStack.pop();
        }
        const result = new Array(count);
        for (let i = count - 1; i >= 0; i--) {
          result[i] = elementCodec.lift();
        }
        return result;
      }
    };
    __bjs_arrayCodecCache.set(elementCodec, codec);
    return codec;
  }
  __name(__bjs_arrayCodec, "__bjs_arrayCodec");
  const __bjs_optionalCodecCache = /* @__PURE__ */ new WeakMap();
  const __bjs_optionalCodecUndefinedOrCache = /* @__PURE__ */ new WeakMap();
  function __bjs_optionalCodec(elementCodec, isUndefinedOr = false) {
    const cache = isUndefinedOr ? __bjs_optionalCodecUndefinedOrCache : __bjs_optionalCodecCache;
    let codec = cache.get(elementCodec);
    if (codec !== void 0) {
      return codec;
    }
    codec = {
      lower(value) {
        const isSome = isUndefinedOr ? value !== void 0 : value != null;
        if (isSome) {
          elementCodec.lower(value);
          i32Stack.push(1);
        } else {
          i32Stack.push(0);
        }
      },
      lift() {
        if (i32Stack.pop() === 0) {
          return isUndefinedOr ? void 0 : null;
        }
        return elementCodec.lift();
      }
    };
    cache.set(elementCodec, codec);
    return codec;
  }
  __name(__bjs_optionalCodec, "__bjs_optionalCodec");
  const __bjs_dictCodecCache = /* @__PURE__ */ new WeakMap();
  function __bjs_dictCodec(valueCodec) {
    let codec = __bjs_dictCodecCache.get(valueCodec);
    if (codec !== void 0) {
      return codec;
    }
    codec = {
      lower(value) {
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i++) {
          __bjs_stringCodec.lower(keys[i]);
          valueCodec.lower(value[keys[i]]);
        }
        i32Stack.push(keys.length);
      },
      lift() {
        const count = i32Stack.pop();
        const result = {};
        for (let i = 0; i < count; i++) {
          const value = valueCodec.lift();
          const key = __bjs_stringCodec.lift();
          result[key] = value;
        }
        return result;
      }
    };
    __bjs_dictCodecCache.set(valueCodec, codec);
    return codec;
  }
  __name(__bjs_dictCodec, "__bjs_dictCodec");
  const __bjs_stringCodec = {
    lower: /* @__PURE__ */ __name((v) => {
      const bytes = textEncoder.encode(v);
      const id = swift.memory.retain(bytes);
      i32Stack.push(bytes.length);
      i32Stack.push(id);
    }, "lower"),
    lift: /* @__PURE__ */ __name(() => {
      const string = strStack.pop();
      return string;
    }, "lift")
  };
  const __bjs_primitiveCodecs = {
    Bool: {
      lower: /* @__PURE__ */ __name((v) => {
        i32Stack.push(v ? 1 : 0);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const bool = i32Stack.pop() !== 0;
        return bool;
      }, "lift")
    },
    Int: {
      lower: /* @__PURE__ */ __name((v) => {
        i32Stack.push(v | 0);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const int = i32Stack.pop();
        return int;
      }, "lift")
    },
    Int8: {
      lower: /* @__PURE__ */ __name((v) => {
        i32Stack.push(v | 0);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const int = i32Stack.pop();
        return int;
      }, "lift")
    },
    UInt8: {
      lower: /* @__PURE__ */ __name((v) => {
        i32Stack.push(v | 0);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const int = i32Stack.pop() >>> 0;
        return int;
      }, "lift")
    },
    Int16: {
      lower: /* @__PURE__ */ __name((v) => {
        i32Stack.push(v | 0);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const int = i32Stack.pop();
        return int;
      }, "lift")
    },
    UInt16: {
      lower: /* @__PURE__ */ __name((v) => {
        i32Stack.push(v | 0);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const int = i32Stack.pop() >>> 0;
        return int;
      }, "lift")
    },
    Int32: {
      lower: /* @__PURE__ */ __name((v) => {
        i32Stack.push(v | 0);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const int = i32Stack.pop();
        return int;
      }, "lift")
    },
    UInt32: {
      lower: /* @__PURE__ */ __name((v) => {
        i32Stack.push(v | 0);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const int = i32Stack.pop() >>> 0;
        return int;
      }, "lift")
    },
    UInt: {
      lower: /* @__PURE__ */ __name((v) => {
        i32Stack.push(v | 0);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const int = i32Stack.pop() >>> 0;
        return int;
      }, "lift")
    },
    Int64: {
      lower: /* @__PURE__ */ __name((v) => {
        i64Stack.push(v);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const int = i64Stack.pop();
        return int;
      }, "lift")
    },
    UInt64: {
      lower: /* @__PURE__ */ __name((v) => {
        i64Stack.push(v);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const int = i64Stack.pop();
        return int;
      }, "lift")
    },
    Float: {
      lower: /* @__PURE__ */ __name((v) => {
        f32Stack.push(Math.fround(v));
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const f32 = f32Stack.pop();
        return f32;
      }, "lift")
    },
    Double: {
      lower: /* @__PURE__ */ __name((v) => {
        f64Stack.push(v);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const f64 = f64Stack.pop();
        return f64;
      }, "lift")
    },
    String: __bjs_stringCodec,
    JSValue: {
      lower: /* @__PURE__ */ __name((v) => {
        const [vKind, vPayload1, vPayload2] = __bjs_jsValueLower(v);
        i32Stack.push(vKind);
        i32Stack.push(vPayload1);
        f64Stack.push(vPayload2);
      }, "lower"),
      lift: /* @__PURE__ */ __name(() => {
        const jsValuePayload2 = f64Stack.pop();
        const jsValuePayload1 = i32Stack.pop();
        const jsValueKind = i32Stack.pop();
        const jsValue = __bjs_jsValueLift(jsValueKind, jsValuePayload1, jsValuePayload2);
        return jsValue;
      }, "lift")
    }
  };
  function __bjs_jsValueLower(value) {
    let kind;
    let payload1;
    let payload2;
    if (value === null) {
      kind = 4;
      payload1 = 0;
      payload2 = 0;
    } else {
      switch (typeof value) {
        case "boolean":
          kind = 0;
          payload1 = value ? 1 : 0;
          payload2 = 0;
          break;
        case "number":
          kind = 2;
          payload1 = 0;
          payload2 = value;
          break;
        case "string":
          kind = 1;
          payload1 = swift.memory.retain(value);
          payload2 = 0;
          break;
        case "undefined":
          kind = 5;
          payload1 = 0;
          payload2 = 0;
          break;
        case "object":
          kind = 3;
          payload1 = swift.memory.retain(value);
          payload2 = 0;
          break;
        case "function":
          kind = 3;
          payload1 = swift.memory.retain(value);
          payload2 = 0;
          break;
        case "symbol":
          kind = 7;
          payload1 = swift.memory.retain(value);
          payload2 = 0;
          break;
        case "bigint":
          kind = 8;
          payload1 = swift.memory.retain(value);
          payload2 = 0;
          break;
        default:
          throw new TypeError("Unsupported JSValue type");
      }
    }
    return [kind, payload1, payload2];
  }
  __name(__bjs_jsValueLower, "__bjs_jsValueLower");
  function __bjs_jsValueLift(kind, payload1, payload2) {
    let jsValue;
    switch (kind) {
      case 0:
        jsValue = payload1 !== 0;
        break;
      case 1:
        jsValue = swift.memory.getObject(payload1);
        break;
      case 2:
        jsValue = payload2;
        break;
      case 3:
        jsValue = swift.memory.getObject(payload1);
        break;
      case 4:
        jsValue = null;
        break;
      case 5:
        jsValue = void 0;
        break;
      case 7:
        jsValue = swift.memory.getObject(payload1);
        break;
      case 8:
        jsValue = swift.memory.getObject(payload1);
        break;
      default:
        throw new TypeError("Unsupported JSValue kind " + kind);
    }
    return jsValue;
  }
  __name(__bjs_jsValueLift, "__bjs_jsValueLift");
  const swiftClosureRegistry = typeof FinalizationRegistry === "undefined" ? { register: /* @__PURE__ */ __name(() => {
  }, "register"), unregister: /* @__PURE__ */ __name(() => {
  }, "unregister") } : new FinalizationRegistry((state) => {
    if (state.unregistered) {
      return;
    }
    instance?.exports?.bjs_release_swift_closure(state.pointer);
  });
  const makeClosure = /* @__PURE__ */ __name((pointer, file, line, func) => {
    const state = { pointer, file, line, unregistered: false };
    const real = /* @__PURE__ */ __name((...args) => {
      if (state.unregistered) {
        const bytes = new Uint8Array(memory.buffer, state.file >>> 0);
        let length = 0;
        while (bytes[length] !== 0) {
          length += 1;
        }
        const fileID = decodeString(state.file, length);
        throw new Error(`Attempted to call a released JSTypedClosure created at ${fileID}:${state.line}`);
      }
      return func(...args);
    }, "real");
    real.__unregister = () => {
      if (state.unregistered) {
        return;
      }
      state.unregistered = true;
      swiftClosureRegistry.unregister(state);
    };
    swiftClosureRegistry.register(real, state, state);
    return swift.memory.retain(real);
  }, "makeClosure");
  const __bjs_codec_JSUint8Array = {
    lower: /* @__PURE__ */ __name((v) => {
      const objId = swift.memory.retain(v);
      i32Stack.push(objId);
    }, "lower"),
    lift: /* @__PURE__ */ __name(() => {
      const objId = i32Stack.pop();
      const obj = swift.memory.getObject(objId);
      swift.memory.release(objId);
      return obj;
    }, "lift")
  };
  const __bjs_codec_Dict_JSUint8Array = __bjs_dictCodec(__bjs_codec_JSUint8Array);
  const __bjs_codec_M6JSHostT10HostTensor = {
    lower: /* @__PURE__ */ __name((v) => {
      structHelpers.M6JSHostT10HostTensor.lower(v);
    }, "lower"),
    lift: /* @__PURE__ */ __name(() => {
      const struct = structHelpers.M6JSHostT10HostTensor.lift();
      return struct;
    }, "lift")
  };
  const __bjs_codec_Dict_M6JSHostT10HostTensor = __bjs_dictCodec(__bjs_codec_M6JSHostT10HostTensor);
  const __bjs_codec_Array_Int = __bjs_arrayCodec(__bjs_primitiveCodecs.Int);
  const __bjs_codec_Array_String = __bjs_arrayCodec(__bjs_stringCodec);
  const __bjs_createStructHelpers_M6JSHostT10HostTensor = /* @__PURE__ */ __name(() => ({
    lower: /* @__PURE__ */ __name((value) => {
      let id;
      if (value.data != null) {
        id = swift.memory.retain(value.data);
      } else {
        id = void 0;
      }
      i32Stack.push(id !== void 0 ? id : 0);
      __bjs_codec_Array_Int.lower(value.dims);
      const bytes = textEncoder.encode(value.type);
      const id1 = swift.memory.retain(bytes);
      i32Stack.push(bytes.length);
      i32Stack.push(id1);
    }, "lower"),
    lift: /* @__PURE__ */ __name(() => {
      const string = strStack.pop();
      const arrayResult = __bjs_codec_Array_Int.lift();
      const objectId = i32Stack.pop();
      let value;
      if (objectId !== 0) {
        value = swift.memory.getObject(objectId);
        swift.memory.release(objectId);
      } else {
        value = null;
      }
      return { data: value, dims: arrayResult, type: string };
    }, "lift")
  }), "__bjs_createStructHelpers_M6JSHostT10HostTensor");
  const __bjs_createStructHelpers_M12WasmBindingsT9ModelInfo = /* @__PURE__ */ __name(() => ({
    lower: /* @__PURE__ */ __name((value) => {
      const bytes = textEncoder.encode(value.id);
      const id = swift.memory.retain(bytes);
      i32Stack.push(bytes.length);
      i32Stack.push(id);
      const bytes1 = textEncoder.encode(value.sdkVersion);
      const id1 = swift.memory.retain(bytes1);
      i32Stack.push(bytes1.length);
      i32Stack.push(id1);
      const bytes2 = textEncoder.encode(value.artifact);
      const id2 = swift.memory.retain(bytes2);
      i32Stack.push(bytes2.length);
      i32Stack.push(id2);
      __bjs_codec_Array_String.lower(value.sidecars);
    }, "lower"),
    lift: /* @__PURE__ */ __name(() => {
      const arrayResult = __bjs_codec_Array_String.lift();
      const string = strStack.pop();
      const string1 = strStack.pop();
      const string2 = strStack.pop();
      return { id: string2, sdkVersion: string1, artifact: string, sidecars: arrayResult };
    }, "lift")
  }), "__bjs_createStructHelpers_M12WasmBindingsT9ModelInfo");
  return {
    /**
     * @param {WebAssembly.Imports} importObject
     */
    addImports: /* @__PURE__ */ __name((importObject, importsContext) => {
      bjs = {};
      importObject["bjs"] = bjs;
      const imports = options.getImports(importsContext);
      bjs["swift_js_return_string"] = function(ptr, len) {
        tmpRetString = decodeString(ptr, len);
      };
      bjs["swift_js_init_memory"] = function(sourceId, bytesPtr) {
        const source = swift.memory.getObject(sourceId);
        swift.memory.release(sourceId);
        const bytes = new Uint8Array(memory.buffer, bytesPtr >>> 0);
        bytes.set(source);
      };
      bjs["swift_js_make_js_string"] = function(ptr, len) {
        return swift.memory.retain(decodeString(ptr, len));
      };
      bjs["swift_js_init_memory_with_result"] = function(ptr, len) {
        const target = new Uint8Array(memory.buffer, ptr >>> 0, len >>> 0);
        target.set(tmpRetBytes);
        tmpRetBytes = void 0;
      };
      bjs["swift_js_throw"] = function(id) {
        tmpRetException = swift.memory.retainByRef(id);
      };
      bjs["swift_js_retain"] = function(id) {
        return swift.memory.retainByRef(id);
      };
      bjs["swift_js_release"] = function(id) {
        swift.memory.release(id);
      };
      bjs["swift_js_push_i32"] = function(v) {
        i32Stack.push(v | 0);
      };
      bjs["swift_js_push_f32"] = function(v) {
        f32Stack.push(Math.fround(v));
      };
      bjs["swift_js_push_f64"] = function(v) {
        f64Stack.push(v);
      };
      bjs["swift_js_push_string"] = function(ptr, len) {
        const value = decodeString(ptr, len);
        strStack.push(value);
      };
      bjs["swift_js_pop_i32"] = function() {
        return i32Stack.pop();
      };
      bjs["swift_js_pop_f32"] = function() {
        return f32Stack.pop();
      };
      bjs["swift_js_pop_f64"] = function() {
        return f64Stack.pop();
      };
      bjs["swift_js_push_pointer"] = function(pointer) {
        ptrStack.push(pointer);
      };
      bjs["swift_js_pop_pointer"] = function() {
        return ptrStack.pop();
      };
      bjs["swift_js_push_i64"] = function(v) {
        i64Stack.push(v);
      };
      bjs["swift_js_pop_i64"] = function() {
        return i64Stack.pop();
      };
      const taCtors = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
      bjs["swift_js_push_typed_array"] = function(kind, ptr, count) {
        const Ctor = taCtors[kind];
        const byteLen = count * Ctor.BYTES_PER_ELEMENT;
        const copy = memory.buffer.slice(ptr, ptr + byteLen);
        taStack.push(Array.from(new Ctor(copy)));
      };
      bjs["swift_js_struct_lower_HostTensor"] = function(objectId) {
        structHelpers.M6JSHostT10HostTensor.lower(swift.memory.getObject(objectId));
      };
      bjs["swift_js_struct_lift_HostTensor"] = function() {
        const value = structHelpers.M6JSHostT10HostTensor.lift();
        return swift.memory.retain(value);
      };
      bjs["swift_js_struct_lower_ModelInfo"] = function(objectId) {
        structHelpers.M12WasmBindingsT9ModelInfo.lower(swift.memory.getObject(objectId));
      };
      bjs["swift_js_struct_lift_ModelInfo"] = function() {
        const value = structHelpers.M12WasmBindingsT9ModelInfo.lift();
        return swift.memory.retain(value);
      };
      bjs["bjs_core_register_type_handles"] = function() {
      };
      bjs["bjs_JSHost_register_type_handles"] = function() {
      };
      bjs["bjs_WasmBindings_register_type_handles"] = function() {
      };
      const __bjs_promiseSettlers = /* @__PURE__ */ Symbol("JavaScriptKit.promiseSettlers");
      bjs["swift_js_make_promise"] = function() {
        let resolve, reject;
        const promise = new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });
        promise[__bjs_promiseSettlers] = { resolve, reject };
        return swift.memory.retain(promise);
      };
      bjs["promise_resolve_WasmBindings_Sb"] = function(promise, value) {
        try {
          swift.memory.getObject(promise)[__bjs_promiseSettlers].resolve(value !== 0);
        } catch (error) {
          setException(error);
        }
      };
      bjs["promise_resolve_WasmBindings_12JSUint8ArrayC"] = function(promise, value) {
        try {
          swift.memory.getObject(promise)[__bjs_promiseSettlers].resolve(swift.memory.getObject(value));
        } catch (error) {
          setException(error);
        }
      };
      bjs["promise_reject_WasmBindings"] = function(promise, valueKind, valuePayload1, valuePayload2) {
        try {
          const jsValue = __bjs_jsValueLift(valueKind, valuePayload1, valuePayload2);
          swift.memory.getObject(promise)[__bjs_promiseSettlers].reject(jsValue);
        } catch (error) {
          setException(error);
        }
      };
      bjs["swift_js_return_optional_bool"] = function(isSome, value) {
        if (isSome === 0) {
          tmpRetOptionalBool = null;
        } else {
          tmpRetOptionalBool = value !== 0;
        }
      };
      bjs["swift_js_return_optional_int"] = function(isSome, value) {
        if (isSome === 0) {
          tmpRetOptionalInt = null;
        } else {
          tmpRetOptionalInt = value | 0;
        }
      };
      bjs["swift_js_return_optional_float"] = function(isSome, value) {
        if (isSome === 0) {
          tmpRetOptionalFloat = null;
        } else {
          tmpRetOptionalFloat = Math.fround(value);
        }
      };
      bjs["swift_js_return_optional_double"] = function(isSome, value) {
        if (isSome === 0) {
          tmpRetOptionalDouble = null;
        } else {
          tmpRetOptionalDouble = value;
        }
      };
      bjs["swift_js_return_optional_string"] = function(isSome, ptr, len) {
        if (isSome === 0) {
          tmpRetString = null;
        } else {
          tmpRetString = decodeString(ptr, len);
        }
      };
      bjs["swift_js_return_optional_object"] = function(isSome, objectId) {
        if (isSome === 0) {
          tmpRetString = null;
        } else {
          tmpRetString = swift.memory.getObject(objectId);
        }
      };
      bjs["swift_js_return_optional_heap_object"] = function(isSome, pointer) {
        if (isSome === 0) {
          tmpRetOptionalHeapObject = null;
        } else {
          tmpRetOptionalHeapObject = pointer;
        }
      };
      bjs["swift_js_get_optional_int_presence"] = function() {
        return tmpRetOptionalInt != null ? 1 : 0;
      };
      bjs["swift_js_get_optional_int_value"] = function() {
        const value = tmpRetOptionalInt;
        tmpRetOptionalInt = void 0;
        return value;
      };
      bjs["swift_js_get_optional_string"] = function() {
        const str = tmpRetString;
        tmpRetString = void 0;
        if (str == null) {
          return -1;
        } else {
          const bytes = textEncoder.encode(str);
          tmpRetBytes = bytes;
          return bytes.length;
        }
      };
      bjs["swift_js_get_optional_float_presence"] = function() {
        return tmpRetOptionalFloat != null ? 1 : 0;
      };
      bjs["swift_js_get_optional_float_value"] = function() {
        const value = tmpRetOptionalFloat;
        tmpRetOptionalFloat = void 0;
        return value;
      };
      bjs["swift_js_get_optional_double_presence"] = function() {
        return tmpRetOptionalDouble != null ? 1 : 0;
      };
      bjs["swift_js_get_optional_double_value"] = function() {
        const value = tmpRetOptionalDouble;
        tmpRetOptionalDouble = void 0;
        return value;
      };
      bjs["swift_js_get_optional_heap_object_pointer"] = function() {
        const pointer = tmpRetOptionalHeapObject;
        tmpRetOptionalHeapObject = void 0;
        return pointer || 0;
      };
      bjs["swift_js_closure_unregister"] = function(funcRef) {
      };
      bjs["swift_js_closure_unregister"] = function(funcRef) {
        const func = swift.memory.getObject(funcRef);
        func.__unregister();
      };
      bjs["invoke_js_callback_JSHost_6JSHosts7JSValueV_y"] = function(callbackId, param0Kind, param0Payload1, param0Payload2) {
        try {
          const callback = swift.memory.getObject(callbackId);
          const jsValue = __bjs_jsValueLift(param0Kind, param0Payload1, param0Payload2);
          callback(jsValue);
        } catch (error) {
          setException(error);
        }
      };
      bjs["make_swift_closure_JSHost_6JSHosts7JSValueV_y"] = function(boxPtr, file, line) {
        const lower_closure_JSHost_6JSHosts7JSValueV_y = /* @__PURE__ */ __name(function(param0) {
          const [param0Kind, param0Payload1, param0Payload2] = __bjs_jsValueLower(param0);
          instance.exports.invoke_swift_closure_JSHost_6JSHosts7JSValueV_y(boxPtr, param0Kind, param0Payload1, param0Payload2);
          if (tmpRetException) {
            const error = swift.memory.getObject(tmpRetException);
            swift.memory.release(tmpRetException);
            tmpRetException = void 0;
            throw error;
          }
        }, "lower_closure_JSHost_6JSHosts7JSValueV_y");
        return makeClosure(boxPtr, file, line, lower_closure_JSHost_6JSHosts7JSValueV_y);
      };
      bjs["invoke_js_callback_JSHost_6JSHostsSD10HostTensorV_y"] = function(callbackId) {
        try {
          const callback = swift.memory.getObject(callbackId);
          const dictResult = __bjs_codec_Dict_M6JSHostT10HostTensor.lift();
          callback(dictResult);
        } catch (error) {
          setException(error);
        }
      };
      bjs["make_swift_closure_JSHost_6JSHostsSD10HostTensorV_y"] = function(boxPtr, file, line) {
        const lower_closure_JSHost_6JSHostsSD10HostTensorV_y = /* @__PURE__ */ __name(function(param0) {
          __bjs_codec_Dict_M6JSHostT10HostTensor.lower(param0);
          instance.exports.invoke_swift_closure_JSHost_6JSHostsSD10HostTensorV_y(boxPtr);
          if (tmpRetException) {
            const error = swift.memory.getObject(tmpRetException);
            swift.memory.release(tmpRetException);
            tmpRetException = void 0;
            throw error;
          }
        }, "lower_closure_JSHost_6JSHostsSD10HostTensorV_y");
        return makeClosure(boxPtr, file, line, lower_closure_JSHost_6JSHostsSD10HostTensorV_y);
      };
      bjs["invoke_js_callback_JSHost_6JSHosty_y"] = function(callbackId) {
        try {
          const callback = swift.memory.getObject(callbackId);
          callback();
        } catch (error) {
          setException(error);
        }
      };
      bjs["make_swift_closure_JSHost_6JSHosty_y"] = function(boxPtr, file, line) {
        const lower_closure_JSHost_6JSHosty_y = /* @__PURE__ */ __name(function() {
          instance.exports.invoke_swift_closure_JSHost_6JSHosty_y(boxPtr);
          if (tmpRetException) {
            const error = swift.memory.getObject(tmpRetException);
            swift.memory.release(tmpRetException);
            tmpRetException = void 0;
            throw error;
          }
        }, "lower_closure_JSHost_6JSHosty_y");
        return makeClosure(boxPtr, file, line, lower_closure_JSHost_6JSHosty_y);
      };
      bjs["swift_js_closure_unregister"] = function(funcRef) {
        const func = swift.memory.getObject(funcRef);
        func.__unregister();
      };
      bjs["invoke_js_callback_WasmBindings_12WasmBindingsSd_y"] = function(callbackId, param0) {
        try {
          const callback = swift.memory.getObject(callbackId);
          callback(param0);
        } catch (error) {
          setException(error);
        }
      };
      bjs["make_swift_closure_WasmBindings_12WasmBindingsSd_y"] = function(boxPtr, file, line) {
        const lower_closure_WasmBindings_12WasmBindingsSd_y = /* @__PURE__ */ __name(function(param0) {
          instance.exports.invoke_swift_closure_WasmBindings_12WasmBindingsSd_y(boxPtr, param0);
          if (tmpRetException) {
            const error = swift.memory.getObject(tmpRetException);
            swift.memory.release(tmpRetException);
            tmpRetException = void 0;
            throw error;
          }
        }, "lower_closure_WasmBindings_12WasmBindingsSd_y");
        return makeClosure(boxPtr, file, line, lower_closure_WasmBindings_12WasmBindingsSd_y);
      };
      const JSHost = importObject["JSHost"] = importObject["JSHost"] || {};
      JSHost["bjs_dalModelHost_get"] = /* @__PURE__ */ __name(function bjs_dalModelHost_get() {
        try {
          let ret = imports.dalModelHost;
          return swift.memory.retain(ret);
        } catch (error) {
          setException(error);
          return 0;
        }
      }, "bjs_dalModelHost_get");
      JSHost["bjs_DalModelHost_createSessionFromPath"] = /* @__PURE__ */ __name(function bjs_DalModelHost_createSessionFromPath(resolveRef, rejectRef, self, pathBytes, pathCount) {
        const resolve = swift.memory.getObject(resolveRef);
        const reject = swift.memory.getObject(rejectRef);
        const string = decodeString(pathBytes, pathCount);
        swift.memory.getObject(self).createSessionFromPath(string).then(resolve, reject);
      }, "bjs_DalModelHost_createSessionFromPath");
      JSHost["bjs_DalModelHost_createSessionFromBytes"] = /* @__PURE__ */ __name(function bjs_DalModelHost_createSessionFromBytes(resolveRef, rejectRef, self, bytes) {
        const resolve = swift.memory.getObject(resolveRef);
        const reject = swift.memory.getObject(rejectRef);
        swift.memory.getObject(self).createSessionFromBytes(swift.memory.getObject(bytes)).then(resolve, reject);
      }, "bjs_DalModelHost_createSessionFromBytes");
      JSHost["bjs_DalModelHost_run"] = /* @__PURE__ */ __name(function bjs_DalModelHost_run(resolveRef, rejectRef, self) {
        const resolve = swift.memory.getObject(resolveRef);
        const reject = swift.memory.getObject(rejectRef);
        const dictResult = __bjs_codec_Dict_M6JSHostT10HostTensor.lift();
        swift.memory.getObject(self).run(dictResult).then(resolve, reject);
      }, "bjs_DalModelHost_run");
    }, "addImports"),
    setInstance: /* @__PURE__ */ __name((i) => {
      instance = i;
      memory = instance.exports.memory;
      decodeString = /* @__PURE__ */ __name((ptr, len) => {
        const bytes = new Uint8Array(memory.buffer, ptr >>> 0, len >>> 0);
        return textDecoder.decode(bytes);
      }, "decodeString");
      setException = /* @__PURE__ */ __name((error) => {
        instance.exports._swift_js_exception.value = swift.memory.retain(error);
      }, "setException");
    }, "setInstance"),
    /** @param {WebAssembly.Instance} instance */
    createExports: /* @__PURE__ */ __name((instance2) => {
      const js = swift.memory.heap;
      const __bjs_helpers_M6JSHostT10HostTensor = __bjs_createStructHelpers_M6JSHostT10HostTensor();
      structHelpers.M6JSHostT10HostTensor = __bjs_helpers_M6JSHostT10HostTensor;
      const __bjs_helpers_M12WasmBindingsT9ModelInfo = __bjs_createStructHelpers_M12WasmBindingsT9ModelInfo();
      structHelpers.M12WasmBindingsT9ModelInfo = __bjs_helpers_M12WasmBindingsT9ModelInfo;
      const exports = {
        modelInfo: /* @__PURE__ */ __name(function bjs_modelInfo() {
          instance2.exports.bjs_modelInfo();
          const structValue = structHelpers.M12WasmBindingsT9ModelInfo.lift();
          if (tmpRetException) {
            const error = swift.memory.getObject(tmpRetException);
            swift.memory.release(tmpRetException);
            tmpRetException = void 0;
            throw error;
          }
          return structValue;
        }, "bjs_modelInfo"),
        create: /* @__PURE__ */ __name(function bjs_create(cacheRoot, directory) {
          const isSome = cacheRoot != null;
          let result, result1;
          if (isSome) {
            const cacheRootBytes = textEncoder.encode(cacheRoot);
            const cacheRootId = swift.memory.retain(cacheRootBytes);
            result = cacheRootId;
            result1 = cacheRootBytes.length;
          } else {
            result = 0;
            result1 = 0;
          }
          const isSome1 = directory != null;
          let result2, result3;
          if (isSome1) {
            const directoryBytes = textEncoder.encode(directory);
            const directoryId = swift.memory.retain(directoryBytes);
            result2 = directoryId;
            result3 = directoryBytes.length;
          } else {
            result2 = 0;
            result3 = 0;
          }
          const ret = instance2.exports.bjs_create(+isSome, result, result1, +isSome1, result2, result3);
          return ret;
        }, "bjs_create"),
        createSelfHosted: /* @__PURE__ */ __name(function bjs_createSelfHosted(files) {
          __bjs_codec_Dict_JSUint8Array.lower(files);
          const ret = instance2.exports.bjs_createSelfHosted();
          if (tmpRetException) {
            const error = swift.memory.getObject(tmpRetException);
            swift.memory.release(tmpRetException);
            tmpRetException = void 0;
            throw error;
          }
          return ret;
        }, "bjs_createSelfHosted"),
        isDownloaded: /* @__PURE__ */ __name(function bjs_isDownloaded(handle) {
          const ret = instance2.exports.bjs_isDownloaded(handle);
          return ret !== 0;
        }, "bjs_isDownloaded"),
        download: /* @__PURE__ */ __name(function bjs_download(handle, onProgress) {
          const callbackId = swift.memory.retain(onProgress);
          const ret = instance2.exports.bjs_download(handle, callbackId);
          const ret1 = swift.memory.getObject(ret);
          swift.memory.release(ret);
          if (tmpRetException) {
            const error = swift.memory.getObject(tmpRetException);
            swift.memory.release(tmpRetException);
            tmpRetException = void 0;
            throw error;
          }
          return ret1;
        }, "bjs_download"),
        run: /* @__PURE__ */ __name(function bjs_run(handle, input, options2, group, deviceId) {
          const isSome = options2 != null;
          let result;
          if (isSome) {
            result = swift.memory.retain(options2);
          } else {
            result = 0;
          }
          const isSome1 = group != null;
          let result1, result2;
          if (isSome1) {
            const groupBytes = textEncoder.encode(group);
            const groupId = swift.memory.retain(groupBytes);
            result1 = groupId;
            result2 = groupBytes.length;
          } else {
            result1 = 0;
            result2 = 0;
          }
          const isSome2 = deviceId != null;
          let result3, result4;
          if (isSome2) {
            const deviceIdBytes = textEncoder.encode(deviceId);
            const deviceIdId = swift.memory.retain(deviceIdBytes);
            result3 = deviceIdId;
            result4 = deviceIdBytes.length;
          } else {
            result3 = 0;
            result4 = 0;
          }
          const ret = instance2.exports.bjs_run(handle, swift.memory.retain(input), +isSome, result, +isSome1, result1, result2, +isSome2, result3, result4);
          const ret1 = swift.memory.getObject(ret);
          swift.memory.release(ret);
          if (tmpRetException) {
            const error = swift.memory.getObject(tmpRetException);
            swift.memory.release(tmpRetException);
            tmpRetException = void 0;
            throw error;
          }
          return ret1;
        }, "bjs_run"),
        endCallGroup: /* @__PURE__ */ __name(function bjs_endCallGroup(id) {
          const isSome = id != null;
          let result, result1;
          if (isSome) {
            const idBytes = textEncoder.encode(id);
            const idId = swift.memory.retain(idBytes);
            result = idId;
            result1 = idBytes.length;
          } else {
            result = 0;
            result1 = 0;
          }
          instance2.exports.bjs_endCallGroup(+isSome, result, result1);
        }, "bjs_endCallGroup"),
        destroy: /* @__PURE__ */ __name(function bjs_destroy(handle) {
          instance2.exports.bjs_destroy(handle);
        }, "bjs_destroy"),
        flushTelemetry: /* @__PURE__ */ __name(function bjs_flushTelemetry() {
          const ret = instance2.exports.bjs_flushTelemetry();
          const ret1 = swift.memory.getObject(ret);
          swift.memory.release(ret);
          return ret1;
        }, "bjs_flushTelemetry")
      };
      _exports = exports;
      return exports;
    }, "createExports")
  };
}
var init_bridge_js = __esm({
  "node_modules/@desert-ant-labs/gist/dist/bridge-js.js"() {
    init_modules_watch_stub();
    __name(createInstantiator, "createInstantiator");
  }
});

// node_modules/@desert-ant-labs/gist/dist/instantiate.js
async function instantiate(options) {
  const { instantiator, ...result } = await _instantiate(options);
  options.wasi.initialize(result.instance);
  result.swift.main();
  return result;
}
async function _instantiate(options) {
  const _WebAssembly = options.WebAssembly || WebAssembly;
  const moduleSource = options.module;
  const { wasi } = options;
  const swift = new SwiftRuntime({});
  const instantiator = await createInstantiator(options, swift);
  const importObject = {
    javascript_kit: swift.wasmImports,
    wasi_snapshot_preview1: wasi.wasiImport
  };
  const importsContext = {
    getInstance: /* @__PURE__ */ __name(() => instance, "getInstance"),
    getExports: /* @__PURE__ */ __name(() => exports, "getExports"),
    _swift: swift
  };
  instantiator.addImports(importObject, importsContext);
  options.addToCoreImports?.(importObject, importsContext);
  let module;
  let instance;
  let exports;
  if (moduleSource instanceof _WebAssembly.Module) {
    module = moduleSource;
    instance = await _WebAssembly.instantiate(module, importObject);
  } else if (typeof Response === "function" && (moduleSource instanceof Response || moduleSource instanceof Promise)) {
    if (typeof _WebAssembly.instantiateStreaming === "function") {
      const result = await _WebAssembly.instantiateStreaming(
        moduleSource,
        importObject
      );
      module = result.module;
      instance = result.instance;
    } else {
      const moduleBytes = await (await moduleSource).arrayBuffer();
      module = await _WebAssembly.compile(moduleBytes);
      instance = await _WebAssembly.instantiate(module, importObject);
    }
  } else {
    module = await _WebAssembly.compile(moduleSource);
    instance = await _WebAssembly.instantiate(module, importObject);
  }
  instance = options.instrumentInstance?.(instance, { _swift: swift }) ?? instance;
  swift.setInstance(instance);
  instantiator.setInstance(instance);
  exports = instantiator.createExports(instance);
  return {
    instance,
    swift,
    exports,
    instantiator
  };
}
var MODULE_PATH;
var init_instantiate = __esm({
  "node_modules/@desert-ant-labs/gist/dist/instantiate.js"() {
    init_modules_watch_stub();
    init_runtime();
    init_bridge_js();
    MODULE_PATH = "GistWeb.wasm";
    __name(instantiate, "instantiate");
    __name(_instantiate, "_instantiate");
  }
});

// node_modules/@bjorn3/browser_wasi_shim/dist/wasi_defs.js
var CLOCKID_REALTIME, CLOCKID_MONOTONIC, ERRNO_SUCCESS, ERRNO_BADF, ERRNO_EXIST, ERRNO_INVAL, ERRNO_ISDIR, ERRNO_NAMETOOLONG, ERRNO_NOENT, ERRNO_NOSYS, ERRNO_NOTDIR, ERRNO_NOTEMPTY, ERRNO_NOTSUP, ERRNO_PERM, ERRNO_NOTCAPABLE, RIGHTS_FD_DATASYNC, RIGHTS_FD_READ, RIGHTS_FD_SEEK, RIGHTS_FD_FDSTAT_SET_FLAGS, RIGHTS_FD_SYNC, RIGHTS_FD_TELL, RIGHTS_FD_WRITE, RIGHTS_FD_ADVISE, RIGHTS_FD_ALLOCATE, RIGHTS_PATH_CREATE_DIRECTORY, RIGHTS_PATH_CREATE_FILE, RIGHTS_PATH_LINK_SOURCE, RIGHTS_PATH_LINK_TARGET, RIGHTS_PATH_OPEN, RIGHTS_FD_READDIR, RIGHTS_PATH_READLINK, RIGHTS_PATH_RENAME_SOURCE, RIGHTS_PATH_RENAME_TARGET, RIGHTS_PATH_FILESTAT_GET, RIGHTS_PATH_FILESTAT_SET_SIZE, RIGHTS_PATH_FILESTAT_SET_TIMES, RIGHTS_FD_FILESTAT_GET, RIGHTS_FD_FILESTAT_SET_SIZE, RIGHTS_FD_FILESTAT_SET_TIMES, RIGHTS_PATH_SYMLINK, RIGHTS_PATH_REMOVE_DIRECTORY, RIGHTS_PATH_UNLINK_FILE, RIGHTS_POLL_FD_READWRITE, RIGHTS_SOCK_SHUTDOWN, Iovec, Ciovec, WHENCE_SET, WHENCE_CUR, WHENCE_END, FILETYPE_CHARACTER_DEVICE, FILETYPE_DIRECTORY, FILETYPE_REGULAR_FILE, Dirent, FDFLAGS_APPEND, FDFLAGS_DSYNC, FDFLAGS_NONBLOCK, FDFLAGS_RSYNC, FDFLAGS_SYNC, Fdstat, FSTFLAGS_ATIM, FSTFLAGS_ATIM_NOW, FSTFLAGS_MTIM, FSTFLAGS_MTIM_NOW, OFLAGS_CREAT, OFLAGS_DIRECTORY, OFLAGS_EXCL, OFLAGS_TRUNC, Filestat, EVENTRWFLAGS_FD_READWRITE_HANGUP, SUBCLOCKFLAGS_SUBSCRIPTION_CLOCK_ABSTIME, RIFLAGS_RECV_PEEK, RIFLAGS_RECV_WAITALL, ROFLAGS_RECV_DATA_TRUNCATED, SDFLAGS_RD, SDFLAGS_WR, PREOPENTYPE_DIR, PrestatDir, Prestat;
var init_wasi_defs = __esm({
  "node_modules/@bjorn3/browser_wasi_shim/dist/wasi_defs.js"() {
    init_modules_watch_stub();
    CLOCKID_REALTIME = 0;
    CLOCKID_MONOTONIC = 1;
    ERRNO_SUCCESS = 0;
    ERRNO_BADF = 8;
    ERRNO_EXIST = 20;
    ERRNO_INVAL = 28;
    ERRNO_ISDIR = 31;
    ERRNO_NAMETOOLONG = 37;
    ERRNO_NOENT = 44;
    ERRNO_NOSYS = 52;
    ERRNO_NOTDIR = 54;
    ERRNO_NOTEMPTY = 55;
    ERRNO_NOTSUP = 58;
    ERRNO_PERM = 63;
    ERRNO_NOTCAPABLE = 76;
    RIGHTS_FD_DATASYNC = 1 << 0;
    RIGHTS_FD_READ = 1 << 1;
    RIGHTS_FD_SEEK = 1 << 2;
    RIGHTS_FD_FDSTAT_SET_FLAGS = 1 << 3;
    RIGHTS_FD_SYNC = 1 << 4;
    RIGHTS_FD_TELL = 1 << 5;
    RIGHTS_FD_WRITE = 1 << 6;
    RIGHTS_FD_ADVISE = 1 << 7;
    RIGHTS_FD_ALLOCATE = 1 << 8;
    RIGHTS_PATH_CREATE_DIRECTORY = 1 << 9;
    RIGHTS_PATH_CREATE_FILE = 1 << 10;
    RIGHTS_PATH_LINK_SOURCE = 1 << 11;
    RIGHTS_PATH_LINK_TARGET = 1 << 12;
    RIGHTS_PATH_OPEN = 1 << 13;
    RIGHTS_FD_READDIR = 1 << 14;
    RIGHTS_PATH_READLINK = 1 << 15;
    RIGHTS_PATH_RENAME_SOURCE = 1 << 16;
    RIGHTS_PATH_RENAME_TARGET = 1 << 17;
    RIGHTS_PATH_FILESTAT_GET = 1 << 18;
    RIGHTS_PATH_FILESTAT_SET_SIZE = 1 << 19;
    RIGHTS_PATH_FILESTAT_SET_TIMES = 1 << 20;
    RIGHTS_FD_FILESTAT_GET = 1 << 21;
    RIGHTS_FD_FILESTAT_SET_SIZE = 1 << 22;
    RIGHTS_FD_FILESTAT_SET_TIMES = 1 << 23;
    RIGHTS_PATH_SYMLINK = 1 << 24;
    RIGHTS_PATH_REMOVE_DIRECTORY = 1 << 25;
    RIGHTS_PATH_UNLINK_FILE = 1 << 26;
    RIGHTS_POLL_FD_READWRITE = 1 << 27;
    RIGHTS_SOCK_SHUTDOWN = 1 << 28;
    Iovec = class _Iovec {
      static {
        __name(this, "Iovec");
      }
      static read_bytes(view, ptr) {
        const iovec = new _Iovec();
        iovec.buf = view.getUint32(ptr, true);
        iovec.buf_len = view.getUint32(ptr + 4, true);
        return iovec;
      }
      static read_bytes_array(view, ptr, len) {
        const iovecs = [];
        for (let i = 0; i < len; i++) {
          iovecs.push(_Iovec.read_bytes(view, ptr + 8 * i));
        }
        return iovecs;
      }
    };
    Ciovec = class _Ciovec {
      static {
        __name(this, "Ciovec");
      }
      static read_bytes(view, ptr) {
        const iovec = new _Ciovec();
        iovec.buf = view.getUint32(ptr, true);
        iovec.buf_len = view.getUint32(ptr + 4, true);
        return iovec;
      }
      static read_bytes_array(view, ptr, len) {
        const iovecs = [];
        for (let i = 0; i < len; i++) {
          iovecs.push(_Ciovec.read_bytes(view, ptr + 8 * i));
        }
        return iovecs;
      }
    };
    WHENCE_SET = 0;
    WHENCE_CUR = 1;
    WHENCE_END = 2;
    FILETYPE_CHARACTER_DEVICE = 2;
    FILETYPE_DIRECTORY = 3;
    FILETYPE_REGULAR_FILE = 4;
    Dirent = class {
      static {
        __name(this, "Dirent");
      }
      head_length() {
        return 24;
      }
      name_length() {
        return this.dir_name.byteLength;
      }
      write_head_bytes(view, ptr) {
        view.setBigUint64(ptr, this.d_next, true);
        view.setBigUint64(ptr + 8, this.d_ino, true);
        view.setUint32(ptr + 16, this.dir_name.length, true);
        view.setUint8(ptr + 20, this.d_type);
      }
      write_name_bytes(view8, ptr, buf_len) {
        view8.set(this.dir_name.slice(0, Math.min(this.dir_name.byteLength, buf_len)), ptr);
      }
      constructor(next_cookie, name, type) {
        this.d_ino = 0n;
        const encoded_name = new TextEncoder().encode(name);
        this.d_next = next_cookie;
        this.d_namlen = encoded_name.byteLength;
        this.d_type = type;
        this.dir_name = encoded_name;
      }
    };
    FDFLAGS_APPEND = 1 << 0;
    FDFLAGS_DSYNC = 1 << 1;
    FDFLAGS_NONBLOCK = 1 << 2;
    FDFLAGS_RSYNC = 1 << 3;
    FDFLAGS_SYNC = 1 << 4;
    Fdstat = class {
      static {
        __name(this, "Fdstat");
      }
      write_bytes(view, ptr) {
        view.setUint8(ptr, this.fs_filetype);
        view.setUint16(ptr + 2, this.fs_flags, true);
        view.setBigUint64(ptr + 8, this.fs_rights_base, true);
        view.setBigUint64(ptr + 16, this.fs_rights_inherited, true);
      }
      constructor(filetype, flags) {
        this.fs_rights_base = 0n;
        this.fs_rights_inherited = 0n;
        this.fs_filetype = filetype;
        this.fs_flags = flags;
      }
    };
    FSTFLAGS_ATIM = 1 << 0;
    FSTFLAGS_ATIM_NOW = 1 << 1;
    FSTFLAGS_MTIM = 1 << 2;
    FSTFLAGS_MTIM_NOW = 1 << 3;
    OFLAGS_CREAT = 1 << 0;
    OFLAGS_DIRECTORY = 1 << 1;
    OFLAGS_EXCL = 1 << 2;
    OFLAGS_TRUNC = 1 << 3;
    Filestat = class {
      static {
        __name(this, "Filestat");
      }
      write_bytes(view, ptr) {
        view.setBigUint64(ptr, this.dev, true);
        view.setBigUint64(ptr + 8, this.ino, true);
        view.setUint8(ptr + 16, this.filetype);
        view.setBigUint64(ptr + 24, this.nlink, true);
        view.setBigUint64(ptr + 32, this.size, true);
        view.setBigUint64(ptr + 38, this.atim, true);
        view.setBigUint64(ptr + 46, this.mtim, true);
        view.setBigUint64(ptr + 52, this.ctim, true);
      }
      constructor(filetype, size) {
        this.dev = 0n;
        this.ino = 0n;
        this.nlink = 0n;
        this.atim = 0n;
        this.mtim = 0n;
        this.ctim = 0n;
        this.filetype = filetype;
        this.size = size;
      }
    };
    EVENTRWFLAGS_FD_READWRITE_HANGUP = 1 << 0;
    SUBCLOCKFLAGS_SUBSCRIPTION_CLOCK_ABSTIME = 1 << 0;
    RIFLAGS_RECV_PEEK = 1 << 0;
    RIFLAGS_RECV_WAITALL = 1 << 1;
    ROFLAGS_RECV_DATA_TRUNCATED = 1 << 0;
    SDFLAGS_RD = 1 << 0;
    SDFLAGS_WR = 1 << 1;
    PREOPENTYPE_DIR = 0;
    PrestatDir = class {
      static {
        __name(this, "PrestatDir");
      }
      write_bytes(view, ptr) {
        view.setUint32(ptr, this.pr_name.byteLength, true);
      }
      constructor(name) {
        this.pr_name = new TextEncoder().encode(name);
      }
    };
    Prestat = class _Prestat {
      static {
        __name(this, "Prestat");
      }
      static dir(name) {
        const prestat = new _Prestat();
        prestat.tag = PREOPENTYPE_DIR;
        prestat.inner = new PrestatDir(name);
        return prestat;
      }
      write_bytes(view, ptr) {
        view.setUint32(ptr, this.tag, true);
        this.inner.write_bytes(view, ptr + 4);
      }
    };
  }
});

// node_modules/@bjorn3/browser_wasi_shim/dist/debug.js
function createLogger(enabled, prefix) {
  if (enabled) {
    const a = console.log.bind(console, "%c%s", "color: #265BA0", prefix);
    return a;
  } else {
    return () => {
    };
  }
}
var Debug, debug;
var init_debug = __esm({
  "node_modules/@bjorn3/browser_wasi_shim/dist/debug.js"() {
    init_modules_watch_stub();
    Debug = class Debug2 {
      static {
        __name(this, "Debug");
      }
      enable(enabled) {
        this.log = createLogger(enabled === void 0 ? true : enabled, this.prefix);
      }
      get enabled() {
        return this.isEnabled;
      }
      constructor(isEnabled) {
        this.isEnabled = isEnabled;
        this.prefix = "wasi:";
        this.enable(isEnabled);
      }
    };
    __name(createLogger, "createLogger");
    debug = new Debug(false);
  }
});

// node_modules/@bjorn3/browser_wasi_shim/dist/wasi.js
var WASIProcExit, WASI;
var init_wasi = __esm({
  "node_modules/@bjorn3/browser_wasi_shim/dist/wasi.js"() {
    init_modules_watch_stub();
    init_wasi_defs();
    init_debug();
    WASIProcExit = class extends Error {
      static {
        __name(this, "WASIProcExit");
      }
      constructor(code) {
        super("exit with exit code " + code);
        this.code = code;
      }
    };
    WASI = class WASI2 {
      static {
        __name(this, "WASI");
      }
      start(instance) {
        this.inst = instance;
        try {
          instance.exports._start();
          return 0;
        } catch (e) {
          if (e instanceof WASIProcExit) {
            return e.code;
          } else {
            throw e;
          }
        }
      }
      initialize(instance) {
        this.inst = instance;
        if (instance.exports._initialize) {
          instance.exports._initialize();
        }
      }
      constructor(args, env, fds, options = {}) {
        this.args = [];
        this.env = [];
        this.fds = [];
        debug.enable(options.debug);
        this.args = args;
        this.env = env;
        this.fds = fds;
        const self = this;
        this.wasiImport = { args_sizes_get(argc, argv_buf_size) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          buffer.setUint32(argc, self.args.length, true);
          let buf_size = 0;
          for (const arg of self.args) {
            buf_size += arg.length + 1;
          }
          buffer.setUint32(argv_buf_size, buf_size, true);
          debug.log(buffer.getUint32(argc, true), buffer.getUint32(argv_buf_size, true));
          return 0;
        }, args_get(argv, argv_buf) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          const orig_argv_buf = argv_buf;
          for (let i = 0; i < self.args.length; i++) {
            buffer.setUint32(argv, argv_buf, true);
            argv += 4;
            const arg = new TextEncoder().encode(self.args[i]);
            buffer8.set(arg, argv_buf);
            buffer.setUint8(argv_buf + arg.length, 0);
            argv_buf += arg.length + 1;
          }
          if (debug.enabled) {
            debug.log(new TextDecoder("utf-8").decode(buffer8.slice(orig_argv_buf, argv_buf)));
          }
          return 0;
        }, environ_sizes_get(environ_count, environ_size) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          buffer.setUint32(environ_count, self.env.length, true);
          let buf_size = 0;
          for (const environ of self.env) {
            buf_size += environ.length + 1;
          }
          buffer.setUint32(environ_size, buf_size, true);
          debug.log(buffer.getUint32(environ_count, true), buffer.getUint32(environ_size, true));
          return 0;
        }, environ_get(environ, environ_buf) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          const orig_environ_buf = environ_buf;
          for (let i = 0; i < self.env.length; i++) {
            buffer.setUint32(environ, environ_buf, true);
            environ += 4;
            const e = new TextEncoder().encode(self.env[i]);
            buffer8.set(e, environ_buf);
            buffer.setUint8(environ_buf + e.length, 0);
            environ_buf += e.length + 1;
          }
          if (debug.enabled) {
            debug.log(new TextDecoder("utf-8").decode(buffer8.slice(orig_environ_buf, environ_buf)));
          }
          return 0;
        }, clock_res_get(id, res_ptr) {
          let resolutionValue;
          switch (id) {
            case CLOCKID_MONOTONIC: {
              resolutionValue = 5000n;
              break;
            }
            case CLOCKID_REALTIME: {
              resolutionValue = 1000000n;
              break;
            }
            default:
              return ERRNO_NOSYS;
          }
          const view = new DataView(self.inst.exports.memory.buffer);
          view.setBigUint64(res_ptr, resolutionValue, true);
          return ERRNO_SUCCESS;
        }, clock_time_get(id, precision, time) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          if (id === CLOCKID_REALTIME) {
            buffer.setBigUint64(time, BigInt((/* @__PURE__ */ new Date()).getTime()) * 1000000n, true);
          } else if (id == CLOCKID_MONOTONIC) {
            let monotonic_time;
            try {
              monotonic_time = BigInt(Math.round(performance.now() * 1e6));
            } catch (e) {
              monotonic_time = 0n;
            }
            buffer.setBigUint64(time, monotonic_time, true);
          } else {
            buffer.setBigUint64(time, 0n, true);
          }
          return 0;
        }, fd_advise(fd, offset, len, advice) {
          if (self.fds[fd] != void 0) {
            return ERRNO_SUCCESS;
          } else {
            return ERRNO_BADF;
          }
        }, fd_allocate(fd, offset, len) {
          if (self.fds[fd] != void 0) {
            return self.fds[fd].fd_allocate(offset, len);
          } else {
            return ERRNO_BADF;
          }
        }, fd_close(fd) {
          if (self.fds[fd] != void 0) {
            const ret = self.fds[fd].fd_close();
            self.fds[fd] = void 0;
            return ret;
          } else {
            return ERRNO_BADF;
          }
        }, fd_datasync(fd) {
          if (self.fds[fd] != void 0) {
            return self.fds[fd].fd_sync();
          } else {
            return ERRNO_BADF;
          }
        }, fd_fdstat_get(fd, fdstat_ptr) {
          if (self.fds[fd] != void 0) {
            const { ret, fdstat } = self.fds[fd].fd_fdstat_get();
            if (fdstat != null) {
              fdstat.write_bytes(new DataView(self.inst.exports.memory.buffer), fdstat_ptr);
            }
            return ret;
          } else {
            return ERRNO_BADF;
          }
        }, fd_fdstat_set_flags(fd, flags) {
          if (self.fds[fd] != void 0) {
            return self.fds[fd].fd_fdstat_set_flags(flags);
          } else {
            return ERRNO_BADF;
          }
        }, fd_fdstat_set_rights(fd, fs_rights_base, fs_rights_inheriting) {
          if (self.fds[fd] != void 0) {
            return self.fds[fd].fd_fdstat_set_rights(fs_rights_base, fs_rights_inheriting);
          } else {
            return ERRNO_BADF;
          }
        }, fd_filestat_get(fd, filestat_ptr) {
          if (self.fds[fd] != void 0) {
            const { ret, filestat } = self.fds[fd].fd_filestat_get();
            if (filestat != null) {
              filestat.write_bytes(new DataView(self.inst.exports.memory.buffer), filestat_ptr);
            }
            return ret;
          } else {
            return ERRNO_BADF;
          }
        }, fd_filestat_set_size(fd, size) {
          if (self.fds[fd] != void 0) {
            return self.fds[fd].fd_filestat_set_size(size);
          } else {
            return ERRNO_BADF;
          }
        }, fd_filestat_set_times(fd, atim, mtim, fst_flags) {
          if (self.fds[fd] != void 0) {
            return self.fds[fd].fd_filestat_set_times(atim, mtim, fst_flags);
          } else {
            return ERRNO_BADF;
          }
        }, fd_pread(fd, iovs_ptr, iovs_len, offset, nread_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const iovecs = Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
            let nread = 0;
            for (const iovec of iovecs) {
              const { ret, data } = self.fds[fd].fd_pread(iovec.buf_len, offset);
              if (ret != ERRNO_SUCCESS) {
                buffer.setUint32(nread_ptr, nread, true);
                return ret;
              }
              buffer8.set(data, iovec.buf);
              nread += data.length;
              offset += BigInt(data.length);
              if (data.length != iovec.buf_len) {
                break;
              }
            }
            buffer.setUint32(nread_ptr, nread, true);
            return ERRNO_SUCCESS;
          } else {
            return ERRNO_BADF;
          }
        }, fd_prestat_get(fd, buf_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const { ret, prestat } = self.fds[fd].fd_prestat_get();
            if (prestat != null) {
              prestat.write_bytes(buffer, buf_ptr);
            }
            return ret;
          } else {
            return ERRNO_BADF;
          }
        }, fd_prestat_dir_name(fd, path_ptr, path_len) {
          if (self.fds[fd] != void 0) {
            const { ret, prestat } = self.fds[fd].fd_prestat_get();
            if (prestat == null) {
              return ret;
            }
            const prestat_dir_name = prestat.inner.pr_name;
            const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
            buffer8.set(prestat_dir_name.slice(0, path_len), path_ptr);
            return prestat_dir_name.byteLength > path_len ? ERRNO_NAMETOOLONG : ERRNO_SUCCESS;
          } else {
            return ERRNO_BADF;
          }
        }, fd_pwrite(fd, iovs_ptr, iovs_len, offset, nwritten_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const iovecs = Ciovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
            let nwritten = 0;
            for (const iovec of iovecs) {
              const data = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
              const { ret, nwritten: nwritten_part } = self.fds[fd].fd_pwrite(data, offset);
              if (ret != ERRNO_SUCCESS) {
                buffer.setUint32(nwritten_ptr, nwritten, true);
                return ret;
              }
              nwritten += nwritten_part;
              offset += BigInt(nwritten_part);
              if (nwritten_part != data.byteLength) {
                break;
              }
            }
            buffer.setUint32(nwritten_ptr, nwritten, true);
            return ERRNO_SUCCESS;
          } else {
            return ERRNO_BADF;
          }
        }, fd_read(fd, iovs_ptr, iovs_len, nread_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const iovecs = Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
            let nread = 0;
            for (const iovec of iovecs) {
              const { ret, data } = self.fds[fd].fd_read(iovec.buf_len);
              if (ret != ERRNO_SUCCESS) {
                buffer.setUint32(nread_ptr, nread, true);
                return ret;
              }
              buffer8.set(data, iovec.buf);
              nread += data.length;
              if (data.length != iovec.buf_len) {
                break;
              }
            }
            buffer.setUint32(nread_ptr, nread, true);
            return ERRNO_SUCCESS;
          } else {
            return ERRNO_BADF;
          }
        }, fd_readdir(fd, buf, buf_len, cookie, bufused_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            let bufused = 0;
            while (true) {
              const { ret, dirent } = self.fds[fd].fd_readdir_single(cookie);
              if (ret != 0) {
                buffer.setUint32(bufused_ptr, bufused, true);
                return ret;
              }
              if (dirent == null) {
                break;
              }
              if (buf_len - bufused < dirent.head_length()) {
                bufused = buf_len;
                break;
              }
              const head_bytes = new ArrayBuffer(dirent.head_length());
              dirent.write_head_bytes(new DataView(head_bytes), 0);
              buffer8.set(new Uint8Array(head_bytes).slice(0, Math.min(head_bytes.byteLength, buf_len - bufused)), buf);
              buf += dirent.head_length();
              bufused += dirent.head_length();
              if (buf_len - bufused < dirent.name_length()) {
                bufused = buf_len;
                break;
              }
              dirent.write_name_bytes(buffer8, buf, buf_len - bufused);
              buf += dirent.name_length();
              bufused += dirent.name_length();
              cookie = dirent.d_next;
            }
            buffer.setUint32(bufused_ptr, bufused, true);
            return 0;
          } else {
            return ERRNO_BADF;
          }
        }, fd_renumber(fd, to) {
          if (self.fds[fd] != void 0 && self.fds[to] != void 0) {
            const ret = self.fds[to].fd_close();
            if (ret != 0) {
              return ret;
            }
            self.fds[to] = self.fds[fd];
            self.fds[fd] = void 0;
            return 0;
          } else {
            return ERRNO_BADF;
          }
        }, fd_seek(fd, offset, whence, offset_out_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const { ret, offset: offset_out } = self.fds[fd].fd_seek(offset, whence);
            buffer.setBigInt64(offset_out_ptr, offset_out, true);
            return ret;
          } else {
            return ERRNO_BADF;
          }
        }, fd_sync(fd) {
          if (self.fds[fd] != void 0) {
            return self.fds[fd].fd_sync();
          } else {
            return ERRNO_BADF;
          }
        }, fd_tell(fd, offset_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const { ret, offset } = self.fds[fd].fd_tell();
            buffer.setBigUint64(offset_ptr, offset, true);
            return ret;
          } else {
            return ERRNO_BADF;
          }
        }, fd_write(fd, iovs_ptr, iovs_len, nwritten_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const iovecs = Ciovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
            let nwritten = 0;
            for (const iovec of iovecs) {
              const data = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
              const { ret, nwritten: nwritten_part } = self.fds[fd].fd_write(data);
              if (ret != ERRNO_SUCCESS) {
                buffer.setUint32(nwritten_ptr, nwritten, true);
                return ret;
              }
              nwritten += nwritten_part;
              if (nwritten_part != data.byteLength) {
                break;
              }
            }
            buffer.setUint32(nwritten_ptr, nwritten, true);
            return ERRNO_SUCCESS;
          } else {
            return ERRNO_BADF;
          }
        }, path_create_directory(fd, path_ptr, path_len) {
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const path = new TextDecoder("utf-8").decode(buffer8.slice(path_ptr, path_ptr + path_len));
            return self.fds[fd].path_create_directory(path);
          } else {
            return ERRNO_BADF;
          }
        }, path_filestat_get(fd, flags, path_ptr, path_len, filestat_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const path = new TextDecoder("utf-8").decode(buffer8.slice(path_ptr, path_ptr + path_len));
            const { ret, filestat } = self.fds[fd].path_filestat_get(flags, path);
            if (filestat != null) {
              filestat.write_bytes(buffer, filestat_ptr);
            }
            return ret;
          } else {
            return ERRNO_BADF;
          }
        }, path_filestat_set_times(fd, flags, path_ptr, path_len, atim, mtim, fst_flags) {
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const path = new TextDecoder("utf-8").decode(buffer8.slice(path_ptr, path_ptr + path_len));
            return self.fds[fd].path_filestat_set_times(flags, path, atim, mtim, fst_flags);
          } else {
            return ERRNO_BADF;
          }
        }, path_link(old_fd, old_flags, old_path_ptr, old_path_len, new_fd, new_path_ptr, new_path_len) {
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[old_fd] != void 0 && self.fds[new_fd] != void 0) {
            const old_path = new TextDecoder("utf-8").decode(buffer8.slice(old_path_ptr, old_path_ptr + old_path_len));
            const new_path = new TextDecoder("utf-8").decode(buffer8.slice(new_path_ptr, new_path_ptr + new_path_len));
            const { ret, inode_obj } = self.fds[old_fd].path_lookup(old_path, old_flags);
            if (inode_obj == null) {
              return ret;
            }
            return self.fds[new_fd].path_link(new_path, inode_obj, false);
          } else {
            return ERRNO_BADF;
          }
        }, path_open(fd, dirflags, path_ptr, path_len, oflags, fs_rights_base, fs_rights_inheriting, fd_flags, opened_fd_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const path = new TextDecoder("utf-8").decode(buffer8.slice(path_ptr, path_ptr + path_len));
            debug.log(path);
            const { ret, fd_obj } = self.fds[fd].path_open(dirflags, path, oflags, fs_rights_base, fs_rights_inheriting, fd_flags);
            if (ret != 0) {
              return ret;
            }
            self.fds.push(fd_obj);
            const opened_fd = self.fds.length - 1;
            buffer.setUint32(opened_fd_ptr, opened_fd, true);
            return 0;
          } else {
            return ERRNO_BADF;
          }
        }, path_readlink(fd, path_ptr, path_len, buf_ptr, buf_len, nread_ptr) {
          const buffer = new DataView(self.inst.exports.memory.buffer);
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const path = new TextDecoder("utf-8").decode(buffer8.slice(path_ptr, path_ptr + path_len));
            debug.log(path);
            const { ret, data } = self.fds[fd].path_readlink(path);
            if (data != null) {
              const data_buf = new TextEncoder().encode(data);
              if (data_buf.length > buf_len) {
                buffer.setUint32(nread_ptr, 0, true);
                return ERRNO_BADF;
              }
              buffer8.set(data_buf, buf_ptr);
              buffer.setUint32(nread_ptr, data_buf.length, true);
            }
            return ret;
          } else {
            return ERRNO_BADF;
          }
        }, path_remove_directory(fd, path_ptr, path_len) {
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const path = new TextDecoder("utf-8").decode(buffer8.slice(path_ptr, path_ptr + path_len));
            return self.fds[fd].path_remove_directory(path);
          } else {
            return ERRNO_BADF;
          }
        }, path_rename(fd, old_path_ptr, old_path_len, new_fd, new_path_ptr, new_path_len) {
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0 && self.fds[new_fd] != void 0) {
            const old_path = new TextDecoder("utf-8").decode(buffer8.slice(old_path_ptr, old_path_ptr + old_path_len));
            const new_path = new TextDecoder("utf-8").decode(buffer8.slice(new_path_ptr, new_path_ptr + new_path_len));
            let { ret, inode_obj } = self.fds[fd].path_unlink(old_path);
            if (inode_obj == null) {
              return ret;
            }
            ret = self.fds[new_fd].path_link(new_path, inode_obj, true);
            if (ret != ERRNO_SUCCESS) {
              if (self.fds[fd].path_link(old_path, inode_obj, true) != ERRNO_SUCCESS) {
                throw "path_link should always return success when relinking an inode back to the original place";
              }
            }
            return ret;
          } else {
            return ERRNO_BADF;
          }
        }, path_symlink(old_path_ptr, old_path_len, fd, new_path_ptr, new_path_len) {
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const old_path = new TextDecoder("utf-8").decode(buffer8.slice(old_path_ptr, old_path_ptr + old_path_len));
            const new_path = new TextDecoder("utf-8").decode(buffer8.slice(new_path_ptr, new_path_ptr + new_path_len));
            return ERRNO_NOTSUP;
          } else {
            return ERRNO_BADF;
          }
        }, path_unlink_file(fd, path_ptr, path_len) {
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          if (self.fds[fd] != void 0) {
            const path = new TextDecoder("utf-8").decode(buffer8.slice(path_ptr, path_ptr + path_len));
            return self.fds[fd].path_unlink_file(path);
          } else {
            return ERRNO_BADF;
          }
        }, poll_oneoff(in_, out, nsubscriptions) {
          throw "async io not supported";
        }, proc_exit(exit_code) {
          throw new WASIProcExit(exit_code);
        }, proc_raise(sig) {
          throw "raised signal " + sig;
        }, sched_yield() {
        }, random_get(buf, buf_len) {
          const buffer8 = new Uint8Array(self.inst.exports.memory.buffer);
          for (let i = 0; i < buf_len; i++) {
            buffer8[buf + i] = Math.random() * 256 | 0;
          }
        }, sock_recv(fd, ri_data, ri_flags) {
          throw "sockets not supported";
        }, sock_send(fd, si_data, si_flags) {
          throw "sockets not supported";
        }, sock_shutdown(fd, how) {
          throw "sockets not supported";
        }, sock_accept(fd, flags) {
          throw "sockets not supported";
        } };
      }
    };
  }
});

// node_modules/@bjorn3/browser_wasi_shim/dist/fd.js
var Fd, Inode;
var init_fd = __esm({
  "node_modules/@bjorn3/browser_wasi_shim/dist/fd.js"() {
    init_modules_watch_stub();
    init_wasi_defs();
    Fd = class {
      static {
        __name(this, "Fd");
      }
      fd_allocate(offset, len) {
        return ERRNO_NOTSUP;
      }
      fd_close() {
        return 0;
      }
      fd_fdstat_get() {
        return { ret: ERRNO_NOTSUP, fdstat: null };
      }
      fd_fdstat_set_flags(flags) {
        return ERRNO_NOTSUP;
      }
      fd_fdstat_set_rights(fs_rights_base, fs_rights_inheriting) {
        return ERRNO_NOTSUP;
      }
      fd_filestat_get() {
        return { ret: ERRNO_NOTSUP, filestat: null };
      }
      fd_filestat_set_size(size) {
        return ERRNO_NOTSUP;
      }
      fd_filestat_set_times(atim, mtim, fst_flags) {
        return ERRNO_NOTSUP;
      }
      fd_pread(size, offset) {
        return { ret: ERRNO_NOTSUP, data: new Uint8Array() };
      }
      fd_prestat_get() {
        return { ret: ERRNO_NOTSUP, prestat: null };
      }
      fd_pwrite(data, offset) {
        return { ret: ERRNO_NOTSUP, nwritten: 0 };
      }
      fd_read(size) {
        return { ret: ERRNO_NOTSUP, data: new Uint8Array() };
      }
      fd_readdir_single(cookie) {
        return { ret: ERRNO_NOTSUP, dirent: null };
      }
      fd_seek(offset, whence) {
        return { ret: ERRNO_NOTSUP, offset: 0n };
      }
      fd_sync() {
        return 0;
      }
      fd_tell() {
        return { ret: ERRNO_NOTSUP, offset: 0n };
      }
      fd_write(data) {
        return { ret: ERRNO_NOTSUP, nwritten: 0 };
      }
      path_create_directory(path) {
        return ERRNO_NOTSUP;
      }
      path_filestat_get(flags, path) {
        return { ret: ERRNO_NOTSUP, filestat: null };
      }
      path_filestat_set_times(flags, path, atim, mtim, fst_flags) {
        return ERRNO_NOTSUP;
      }
      path_link(path, inode, allow_dir) {
        return ERRNO_NOTSUP;
      }
      path_unlink(path) {
        return { ret: ERRNO_NOTSUP, inode_obj: null };
      }
      path_lookup(path, dirflags) {
        return { ret: ERRNO_NOTSUP, inode_obj: null };
      }
      path_open(dirflags, path, oflags, fs_rights_base, fs_rights_inheriting, fd_flags) {
        return { ret: ERRNO_NOTDIR, fd_obj: null };
      }
      path_readlink(path) {
        return { ret: ERRNO_NOTSUP, data: null };
      }
      path_remove_directory(path) {
        return ERRNO_NOTSUP;
      }
      path_rename(old_path, new_fd, new_path) {
        return ERRNO_NOTSUP;
      }
      path_unlink_file(path) {
        return ERRNO_NOTSUP;
      }
    };
    Inode = class {
      static {
        __name(this, "Inode");
      }
    };
  }
});

// node_modules/@bjorn3/browser_wasi_shim/dist/fs_mem.js
var OpenFile, OpenDirectory, PreopenDirectory, File, Path, Directory, ConsoleStdout;
var init_fs_mem = __esm({
  "node_modules/@bjorn3/browser_wasi_shim/dist/fs_mem.js"() {
    init_modules_watch_stub();
    init_debug();
    init_wasi_defs();
    init_fd();
    OpenFile = class extends Fd {
      static {
        __name(this, "OpenFile");
      }
      fd_allocate(offset, len) {
        if (this.file.size > offset + len) {
        } else {
          const new_data = new Uint8Array(Number(offset + len));
          new_data.set(this.file.data, 0);
          this.file.data = new_data;
        }
        return ERRNO_SUCCESS;
      }
      fd_fdstat_get() {
        return { ret: 0, fdstat: new Fdstat(FILETYPE_REGULAR_FILE, 0) };
      }
      fd_filestat_set_size(size) {
        if (this.file.size > size) {
          this.file.data = new Uint8Array(this.file.data.buffer.slice(0, Number(size)));
        } else {
          const new_data = new Uint8Array(Number(size));
          new_data.set(this.file.data, 0);
          this.file.data = new_data;
        }
        return ERRNO_SUCCESS;
      }
      fd_read(size) {
        const slice = this.file.data.slice(Number(this.file_pos), Number(this.file_pos + BigInt(size)));
        this.file_pos += BigInt(slice.length);
        return { ret: 0, data: slice };
      }
      fd_pread(size, offset) {
        const slice = this.file.data.slice(Number(offset), Number(offset + BigInt(size)));
        return { ret: 0, data: slice };
      }
      fd_seek(offset, whence) {
        let calculated_offset;
        switch (whence) {
          case WHENCE_SET:
            calculated_offset = offset;
            break;
          case WHENCE_CUR:
            calculated_offset = this.file_pos + offset;
            break;
          case WHENCE_END:
            calculated_offset = BigInt(this.file.data.byteLength) + offset;
            break;
          default:
            return { ret: ERRNO_INVAL, offset: 0n };
        }
        if (calculated_offset < 0) {
          return { ret: ERRNO_INVAL, offset: 0n };
        }
        this.file_pos = calculated_offset;
        return { ret: 0, offset: this.file_pos };
      }
      fd_tell() {
        return { ret: 0, offset: this.file_pos };
      }
      fd_write(data) {
        if (this.file.readonly) return { ret: ERRNO_BADF, nwritten: 0 };
        if (this.file_pos + BigInt(data.byteLength) > this.file.size) {
          const old = this.file.data;
          this.file.data = new Uint8Array(Number(this.file_pos + BigInt(data.byteLength)));
          this.file.data.set(old);
        }
        this.file.data.set(data, Number(this.file_pos));
        this.file_pos += BigInt(data.byteLength);
        return { ret: 0, nwritten: data.byteLength };
      }
      fd_pwrite(data, offset) {
        if (this.file.readonly) return { ret: ERRNO_BADF, nwritten: 0 };
        if (offset + BigInt(data.byteLength) > this.file.size) {
          const old = this.file.data;
          this.file.data = new Uint8Array(Number(offset + BigInt(data.byteLength)));
          this.file.data.set(old);
        }
        this.file.data.set(data, Number(offset));
        return { ret: 0, nwritten: data.byteLength };
      }
      fd_filestat_get() {
        return { ret: 0, filestat: this.file.stat() };
      }
      constructor(file) {
        super();
        this.file_pos = 0n;
        this.file = file;
      }
    };
    OpenDirectory = class extends Fd {
      static {
        __name(this, "OpenDirectory");
      }
      fd_seek(offset, whence) {
        return { ret: ERRNO_BADF, offset: 0n };
      }
      fd_tell() {
        return { ret: ERRNO_BADF, offset: 0n };
      }
      fd_allocate(offset, len) {
        return ERRNO_BADF;
      }
      fd_fdstat_get() {
        return { ret: 0, fdstat: new Fdstat(FILETYPE_DIRECTORY, 0) };
      }
      fd_readdir_single(cookie) {
        if (debug.enabled) {
          debug.log("readdir_single", cookie);
          debug.log(cookie, this.dir.contents.keys());
        }
        if (cookie == 0n) {
          return { ret: ERRNO_SUCCESS, dirent: new Dirent(1n, ".", FILETYPE_DIRECTORY) };
        } else if (cookie == 1n) {
          return { ret: ERRNO_SUCCESS, dirent: new Dirent(2n, "..", FILETYPE_DIRECTORY) };
        }
        if (cookie >= BigInt(this.dir.contents.size) + 2n) {
          return { ret: 0, dirent: null };
        }
        const [name, entry] = Array.from(this.dir.contents.entries())[Number(cookie - 2n)];
        return { ret: 0, dirent: new Dirent(cookie + 1n, name, entry.stat().filetype) };
      }
      path_filestat_get(flags, path_str) {
        const { ret: path_err, path } = Path.from(path_str);
        if (path == null) {
          return { ret: path_err, filestat: null };
        }
        const { ret, entry } = this.dir.get_entry_for_path(path);
        if (entry == null) {
          return { ret, filestat: null };
        }
        return { ret: 0, filestat: entry.stat() };
      }
      path_lookup(path_str, dirflags) {
        const { ret: path_ret, path } = Path.from(path_str);
        if (path == null) {
          return { ret: path_ret, inode_obj: null };
        }
        const { ret, entry } = this.dir.get_entry_for_path(path);
        if (entry == null) {
          return { ret, inode_obj: null };
        }
        return { ret: ERRNO_SUCCESS, inode_obj: entry };
      }
      path_open(dirflags, path_str, oflags, fs_rights_base, fs_rights_inheriting, fd_flags) {
        const { ret: path_ret, path } = Path.from(path_str);
        if (path == null) {
          return { ret: path_ret, fd_obj: null };
        }
        let { ret, entry } = this.dir.get_entry_for_path(path);
        if (entry == null) {
          if (ret != ERRNO_NOENT) {
            return { ret, fd_obj: null };
          }
          if ((oflags & OFLAGS_CREAT) == OFLAGS_CREAT) {
            const { ret: ret2, entry: new_entry } = this.dir.create_entry_for_path(path_str, (oflags & OFLAGS_DIRECTORY) == OFLAGS_DIRECTORY);
            if (new_entry == null) {
              return { ret: ret2, fd_obj: null };
            }
            entry = new_entry;
          } else {
            return { ret: ERRNO_NOENT, fd_obj: null };
          }
        } else if ((oflags & OFLAGS_EXCL) == OFLAGS_EXCL) {
          return { ret: ERRNO_EXIST, fd_obj: null };
        }
        if ((oflags & OFLAGS_DIRECTORY) == OFLAGS_DIRECTORY && entry.stat().filetype !== FILETYPE_DIRECTORY) {
          return { ret: ERRNO_NOTDIR, fd_obj: null };
        }
        return entry.path_open(oflags, fs_rights_base, fd_flags);
      }
      path_create_directory(path) {
        return this.path_open(0, path, OFLAGS_CREAT | OFLAGS_DIRECTORY, 0n, 0n, 0).ret;
      }
      path_link(path_str, inode, allow_dir) {
        const { ret: path_ret, path } = Path.from(path_str);
        if (path == null) {
          return path_ret;
        }
        if (path.is_dir) {
          return ERRNO_NOENT;
        }
        const { ret: parent_ret, parent_entry, filename, entry } = this.dir.get_parent_dir_and_entry_for_path(path, true);
        if (parent_entry == null || filename == null) {
          return parent_ret;
        }
        if (entry != null) {
          const source_is_dir = inode.stat().filetype == FILETYPE_DIRECTORY;
          const target_is_dir = entry.stat().filetype == FILETYPE_DIRECTORY;
          if (source_is_dir && target_is_dir) {
            if (allow_dir && entry instanceof Directory) {
              if (entry.contents.size == 0) {
              } else {
                return ERRNO_NOTEMPTY;
              }
            } else {
              return ERRNO_EXIST;
            }
          } else if (source_is_dir && !target_is_dir) {
            return ERRNO_NOTDIR;
          } else if (!source_is_dir && target_is_dir) {
            return ERRNO_ISDIR;
          } else if (inode.stat().filetype == FILETYPE_REGULAR_FILE && entry.stat().filetype == FILETYPE_REGULAR_FILE) {
          } else {
            return ERRNO_EXIST;
          }
        }
        if (!allow_dir && inode.stat().filetype == FILETYPE_DIRECTORY) {
          return ERRNO_PERM;
        }
        parent_entry.contents.set(filename, inode);
        return ERRNO_SUCCESS;
      }
      path_unlink(path_str) {
        const { ret: path_ret, path } = Path.from(path_str);
        if (path == null) {
          return { ret: path_ret, inode_obj: null };
        }
        const { ret: parent_ret, parent_entry, filename, entry } = this.dir.get_parent_dir_and_entry_for_path(path, true);
        if (parent_entry == null || filename == null) {
          return { ret: parent_ret, inode_obj: null };
        }
        if (entry == null) {
          return { ret: ERRNO_NOENT, inode_obj: null };
        }
        parent_entry.contents.delete(filename);
        return { ret: ERRNO_SUCCESS, inode_obj: entry };
      }
      path_unlink_file(path_str) {
        const { ret: path_ret, path } = Path.from(path_str);
        if (path == null) {
          return path_ret;
        }
        const { ret: parent_ret, parent_entry, filename, entry } = this.dir.get_parent_dir_and_entry_for_path(path, false);
        if (parent_entry == null || filename == null || entry == null) {
          return parent_ret;
        }
        if (entry.stat().filetype === FILETYPE_DIRECTORY) {
          return ERRNO_ISDIR;
        }
        parent_entry.contents.delete(filename);
        return ERRNO_SUCCESS;
      }
      path_remove_directory(path_str) {
        const { ret: path_ret, path } = Path.from(path_str);
        if (path == null) {
          return path_ret;
        }
        const { ret: parent_ret, parent_entry, filename, entry } = this.dir.get_parent_dir_and_entry_for_path(path, false);
        if (parent_entry == null || filename == null || entry == null) {
          return parent_ret;
        }
        if (!(entry instanceof Directory) || entry.stat().filetype !== FILETYPE_DIRECTORY) {
          return ERRNO_NOTDIR;
        }
        if (entry.contents.size !== 0) {
          return ERRNO_NOTEMPTY;
        }
        if (!parent_entry.contents.delete(filename)) {
          return ERRNO_NOENT;
        }
        return ERRNO_SUCCESS;
      }
      fd_filestat_get() {
        return { ret: 0, filestat: this.dir.stat() };
      }
      fd_filestat_set_size(size) {
        return ERRNO_BADF;
      }
      fd_read(size) {
        return { ret: ERRNO_BADF, data: new Uint8Array() };
      }
      fd_pread(size, offset) {
        return { ret: ERRNO_BADF, data: new Uint8Array() };
      }
      fd_write(data) {
        return { ret: ERRNO_BADF, nwritten: 0 };
      }
      fd_pwrite(data, offset) {
        return { ret: ERRNO_BADF, nwritten: 0 };
      }
      constructor(dir) {
        super();
        this.dir = dir;
      }
    };
    PreopenDirectory = class extends OpenDirectory {
      static {
        __name(this, "PreopenDirectory");
      }
      fd_prestat_get() {
        return { ret: 0, prestat: Prestat.dir(this.prestat_name) };
      }
      constructor(name, contents) {
        super(new Directory(contents));
        this.prestat_name = name;
      }
    };
    File = class extends Inode {
      static {
        __name(this, "File");
      }
      path_open(oflags, fs_rights_base, fd_flags) {
        if (this.readonly && (fs_rights_base & BigInt(RIGHTS_FD_WRITE)) == BigInt(RIGHTS_FD_WRITE)) {
          return { ret: ERRNO_PERM, fd_obj: null };
        }
        if ((oflags & OFLAGS_TRUNC) == OFLAGS_TRUNC) {
          if (this.readonly) return { ret: ERRNO_PERM, fd_obj: null };
          this.data = new Uint8Array([]);
        }
        const file = new OpenFile(this);
        if (fd_flags & FDFLAGS_APPEND) file.fd_seek(0n, WHENCE_END);
        return { ret: ERRNO_SUCCESS, fd_obj: file };
      }
      get size() {
        return BigInt(this.data.byteLength);
      }
      stat() {
        return new Filestat(FILETYPE_REGULAR_FILE, this.size);
      }
      constructor(data, options) {
        super();
        this.data = new Uint8Array(data);
        this.readonly = !!options?.readonly;
      }
    };
    Path = class Path2 {
      static {
        __name(this, "Path");
      }
      static from(path) {
        const self = new Path2();
        self.is_dir = path.endsWith("/");
        if (path.startsWith("/")) {
          return { ret: ERRNO_NOTCAPABLE, path: null };
        }
        if (path.includes("\0")) {
          return { ret: ERRNO_INVAL, path: null };
        }
        for (const component of path.split("/")) {
          if (component === "" || component === ".") {
            continue;
          }
          if (component === "..") {
            if (self.parts.pop() == void 0) {
              return { ret: ERRNO_NOTCAPABLE, path: null };
            }
            continue;
          }
          self.parts.push(component);
        }
        return { ret: ERRNO_SUCCESS, path: self };
      }
      to_path_string() {
        let s = this.parts.join("/");
        if (this.is_dir) {
          s += "/";
        }
        return s;
      }
      constructor() {
        this.parts = [];
        this.is_dir = false;
      }
    };
    Directory = class _Directory extends Inode {
      static {
        __name(this, "Directory");
      }
      path_open(oflags, fs_rights_base, fd_flags) {
        return { ret: ERRNO_SUCCESS, fd_obj: new OpenDirectory(this) };
      }
      stat() {
        return new Filestat(FILETYPE_DIRECTORY, 0n);
      }
      get_entry_for_path(path) {
        let entry = this;
        for (const component of path.parts) {
          if (!(entry instanceof _Directory)) {
            return { ret: ERRNO_NOTDIR, entry: null };
          }
          const child = entry.contents.get(component);
          if (child !== void 0) {
            entry = child;
          } else {
            debug.log(component);
            return { ret: ERRNO_NOENT, entry: null };
          }
        }
        if (path.is_dir) {
          if (entry.stat().filetype != FILETYPE_DIRECTORY) {
            return { ret: ERRNO_NOTDIR, entry: null };
          }
        }
        return { ret: ERRNO_SUCCESS, entry };
      }
      get_parent_dir_and_entry_for_path(path, allow_undefined) {
        const filename = path.parts.pop();
        if (filename === void 0) {
          return { ret: ERRNO_INVAL, parent_entry: null, filename: null, entry: null };
        }
        const { ret: entry_ret, entry: parent_entry } = this.get_entry_for_path(path);
        if (parent_entry == null) {
          return { ret: entry_ret, parent_entry: null, filename: null, entry: null };
        }
        if (!(parent_entry instanceof _Directory)) {
          return { ret: ERRNO_NOTDIR, parent_entry: null, filename: null, entry: null };
        }
        const entry = parent_entry.contents.get(filename);
        if (entry === void 0) {
          if (!allow_undefined) {
            return { ret: ERRNO_NOENT, parent_entry: null, filename: null, entry: null };
          } else {
            return { ret: ERRNO_SUCCESS, parent_entry, filename, entry: null };
          }
        }
        if (path.is_dir) {
          if (entry.stat().filetype != FILETYPE_DIRECTORY) {
            return { ret: ERRNO_NOTDIR, parent_entry: null, filename: null, entry: null };
          }
        }
        return { ret: ERRNO_SUCCESS, parent_entry, filename, entry };
      }
      create_entry_for_path(path_str, is_dir) {
        const { ret: path_ret, path } = Path.from(path_str);
        if (path == null) {
          return { ret: path_ret, entry: null };
        }
        let { ret: parent_ret, parent_entry, filename, entry } = this.get_parent_dir_and_entry_for_path(path, true);
        if (parent_entry == null || filename == null) {
          return { ret: parent_ret, entry: null };
        }
        if (entry != null) {
          return { ret: ERRNO_EXIST, entry: null };
        }
        debug.log("create", path);
        let new_child;
        if (!is_dir) {
          new_child = new File(new ArrayBuffer(0));
        } else {
          new_child = new _Directory(/* @__PURE__ */ new Map());
        }
        parent_entry.contents.set(filename, new_child);
        entry = new_child;
        return { ret: ERRNO_SUCCESS, entry };
      }
      constructor(contents) {
        super();
        if (contents instanceof Array) {
          this.contents = new Map(contents);
        } else {
          this.contents = contents;
        }
      }
    };
    ConsoleStdout = class _ConsoleStdout extends Fd {
      static {
        __name(this, "ConsoleStdout");
      }
      fd_filestat_get() {
        const filestat = new Filestat(FILETYPE_CHARACTER_DEVICE, BigInt(0));
        return { ret: 0, filestat };
      }
      fd_fdstat_get() {
        const fdstat = new Fdstat(FILETYPE_CHARACTER_DEVICE, 0);
        fdstat.fs_rights_base = BigInt(RIGHTS_FD_WRITE);
        return { ret: 0, fdstat };
      }
      fd_write(data) {
        this.write(data);
        return { ret: 0, nwritten: data.byteLength };
      }
      static lineBuffered(write2) {
        const dec = new TextDecoder("utf-8", { fatal: false });
        let line_buf = "";
        return new _ConsoleStdout((buffer) => {
          line_buf += dec.decode(buffer, { stream: true });
          const lines = line_buf.split("\n");
          for (const [i, line] of lines.entries()) {
            if (i < lines.length - 1) {
              write2(line);
            } else {
              line_buf = line;
            }
          }
        });
      }
      constructor(write2) {
        super();
        this.write = write2;
      }
    };
  }
});

// node_modules/@bjorn3/browser_wasi_shim/dist/fs_opfs.js
var init_fs_opfs = __esm({
  "node_modules/@bjorn3/browser_wasi_shim/dist/fs_opfs.js"() {
    init_modules_watch_stub();
    init_wasi_defs();
    init_fd();
  }
});

// node_modules/@bjorn3/browser_wasi_shim/dist/strace.js
var init_strace = __esm({
  "node_modules/@bjorn3/browser_wasi_shim/dist/strace.js"() {
    init_modules_watch_stub();
  }
});

// node_modules/@bjorn3/browser_wasi_shim/dist/index.js
var init_dist = __esm({
  "node_modules/@bjorn3/browser_wasi_shim/dist/index.js"() {
    init_modules_watch_stub();
    init_wasi();
    init_fd();
    init_fs_mem();
    init_fs_opfs();
    init_strace();
    init_wasi_defs();
  }
});

// node_modules/@desert-ant-labs/gist/dist/platforms/browser.js
async function defaultBrowserSetup(options) {
  const args = options.args ?? [];
  const onStdoutLine = options.onStdoutLine ?? ((line) => console.log(line));
  const onStderrLine = options.onStderrLine ?? ((line) => console.error(line));
  const wasi = new WASI(
    /* args */
    [MODULE_PATH, ...args],
    /* env */
    [],
    /* fd */
    [
      new OpenFile(new File([])),
      // stdin
      ConsoleStdout.lineBuffered((stdout) => {
        onStdoutLine(stdout);
      }),
      ConsoleStdout.lineBuffered((stderr) => {
        onStderrLine(stderr);
      }),
      new PreopenDirectory("/", /* @__PURE__ */ new Map())
    ],
    { debug: false }
  );
  return {
    module: options.module,
    getImports() {
      return options.getImports();
    },
    wasi: Object.assign(wasi, {
      setInstance(instance) {
        wasi.inst = instance;
      }
    })
  };
}
var init_browser = __esm({
  "node_modules/@desert-ant-labs/gist/dist/platforms/browser.js"() {
    init_modules_watch_stub();
    init_instantiate();
    init_dist();
    __name(defaultBrowserSetup, "defaultBrowserSetup");
  }
});

// node_modules/@desert-ant-labs/gist/dist/index.js
var dist_exports = {};
__export(dist_exports, {
  init: () => init
});
async function initBrowser(_options) {
  const options = _options || {
    /** @returns {import('./instantiate.d').Imports} */
    getImports() {
      (() => {
        throw new Error("No imports provided");
      })();
    }
  };
  let module = options.module;
  if (!module) {
    module = fetch(new URL("GistWeb.wasm", import.meta.url));
  }
  const instantiateOptions = await defaultBrowserSetup({
    module,
    getImports: /* @__PURE__ */ __name(() => options.getImports(), "getImports")
  });
  return await instantiate(instantiateOptions);
}
async function init(options) {
  return initBrowser(options);
}
var init_dist2 = __esm({
  "node_modules/@desert-ant-labs/gist/dist/index.js"() {
    init_modules_watch_stub();
    init_instantiate();
    init_browser();
    __name(initBrowser, "initBrowser");
    __name(init, "init");
  }
});

// node_modules/@desert-ant-labs/gist/platform-browser.js
var platform_browser_exports = {};
__export(platform_browser_exports, {
  defaultCacheRoot: () => defaultCacheRoot,
  defaultWasmDir: () => defaultWasmDir,
  readModelSource: () => readModelSource,
  setupCore: () => setupCore
});
function setupCore() {
  return browserSetup({ init: /* @__PURE__ */ __name(() => Promise.resolve().then(() => (init_dist2(), dist_exports)), "init") });
}
var defaultWasmDir, readModelSource, defaultCacheRoot;
var init_platform_browser = __esm({
  "node_modules/@desert-ant-labs/gist/platform-browser.js"() {
    init_modules_watch_stub();
    init_core();
    __name(setupCore, "setupCore");
    defaultWasmDir = browserWasmDir;
    readModelSource = browserReadModelSource;
    defaultCacheRoot = browserCacheRoot;
  }
});

// node_modules/@desert-ant-labs/gist/codec.js
function encodeInput(text) {
  return new FfiWriter().str(text).done();
}
function decodeTagged(r) {
  const threshold = r.f64();
  const count = r.u32();
  const scores = {};
  const names = {};
  for (let i = 0; i < count; i++) {
    const slug = r.str();
    names[slug] = r.str();
    scores[slug] = r.f64();
  }
  return { threshold, scores, names };
}
var PACKAGE_NAME;
var init_codec = __esm({
  "node_modules/@desert-ant-labs/gist/codec.js"() {
    init_modules_watch_stub();
    init_core();
    PACKAGE_NAME = "@desert-ant-labs/gist";
    __name(encodeInput, "encodeInput");
    __name(decodeTagged, "decodeTagged");
  }
});

// node_modules/@desert-ant-labs/gist/gist.js
function makeGist(sdk) {
  return class Gist2 {
    static {
      __name(this, "Gist");
    }
    #model;
    constructor(model) {
      this.#model = model;
    }
    /**
     * Load the model and return a ready tagger. By default the model is
     * downloaded from the Hugging Face Hub at the pinned revision, verified, and
     * cached (the filesystem under Node, the runtime's cache in the browser).
     * Pass `directory` (Node) or `modelBaseUrl` (browser) to use files you host
     * yourself. The repo and revision are pinned to the SDK.
     */
    static async load(options = {}) {
      return new Gist2(await sdk.open(options));
    }
    /**
     * The full 36-topic probability distribution for `text`
     * (`{ [slug]: probability }`). Feed these to {@link channelTopics} to roll a
     * channel up.
     *
     * `options.deviceId` (a string or a zero-arg function returning one)
     * attributes usage to a specific end-user device; it is collected per call,
     * so it is safe for concurrent multi-tenant hosts. `options.group` (an id
     * from {@link withCallGroup}) bills several calls as one.
     */
    async scores(text, options = {}) {
      const phrase = String(text ?? "");
      if (phrase.trim() === "") return {};
      return (await this.#tag(phrase, options)).scores;
    }
    /**
     * The ranked topics for `text` above the model's tuned threshold, most
     * likely first. The top topic is always returned even when nothing clears
     * the threshold; `options.topK` caps the list (default 3) and
     * `options.threshold` overrides the model's own. Empty input returns `[]`.
     */
    async classify(text, options = {}) {
      const phrase = String(text ?? "");
      if (phrase.trim() === "") return [];
      const { threshold, scores, names } = await this.#tag(phrase, options);
      const thr = options.threshold ?? threshold;
      const topK = options.topK ?? 3;
      return Object.entries(scores).sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1).slice(0, topK).filter(([, score], i) => score >= thr || i === 0).map(([slug, score]) => ({ slug, name: names[slug] ?? slug, score }));
    }
    /** One run, decoded. Both public calls need the same payload. */
    async #tag(phrase, options) {
      return decodeTagged(await this.#model.run(encodeInput(phrase), new Uint8Array(0), options));
    }
    /** Whether the model is usable with no network. */
    isDownloaded() {
      return this.#model.isDownloaded();
    }
    /**
     * Run `body(group)` with a fresh call-group id, so every `classify({ group })`
     * inside it bills as a single usage call. The group is released when `body`
     * settles.
     */
    withCallGroup(body) {
      return this.#model.withCallGroup(body);
    }
    /**
     * Send the usage recorded so far and await the POST, so a short-lived process
     * (a CLI, a Lambda) does not exit before it lands. Usage is reported on its own
     * otherwise; such a process has no idle gap for the debounce to fire in.
     */
    flushTelemetry() {
      return this.#model.flushTelemetry();
    }
    /** Release the model. The tagger is unusable afterwards. */
    dispose() {
      this.#model.dispose();
    }
  };
}
var init_gist = __esm({
  "node_modules/@desert-ant-labs/gist/gist.js"() {
    init_modules_watch_stub();
    init_codec();
    __name(makeGist, "makeGist");
  }
});

// node_modules/@desert-ant-labs/gist/channel.js
function channelTopics(posts, options = {}) {
  const {
    topN = 5,
    floor = 0.05,
    minPosts = 3,
    halfLifeDays = 0,
    touch = 0.15,
    nowMillis = 0
  } = options;
  if (posts.length < minPosts) return [];
  const weight = /* @__PURE__ */ new Map();
  const count = /* @__PURE__ */ new Map();
  const decay = halfLifeDays > 0 ? Math.LN2 / (halfLifeDays * 864e5) : 0;
  for (const post of posts) {
    let w = 1;
    const t = post.timestampMillis;
    if (decay > 0 && t !== void 0) w = Math.exp(-decay * Math.max(0, nowMillis - t));
    for (const [slug, prob] of Object.entries(post.topics)) {
      if (!(prob > 0)) continue;
      weight.set(slug, (weight.get(slug) ?? 0) + prob * w);
      if (prob >= touch) count.set(slug, (count.get(slug) ?? 0) + 1);
    }
  }
  const total = [...weight.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return [...weight.entries()].map(([slug, mass]) => ({ slug, share: mass / total, postCount: count.get(slug) ?? 0 })).filter((t) => t.share >= floor).sort((a, b) => b.share !== a.share ? b.share - a.share : a.slug < b.slug ? -1 : 1).slice(0, topN);
}
var init_channel = __esm({
  "node_modules/@desert-ant-labs/gist/channel.js"() {
    init_modules_watch_stub();
    __name(channelTopics, "channelTopics");
  }
});

// node_modules/@desert-ant-labs/gist/browser.js
var browser_exports = {};
__export(browser_exports, {
  Gist: () => Gist,
  channelTopics: () => channelTopics
});
var Gist;
var init_browser2 = __esm({
  async "node_modules/@desert-ant-labs/gist/browser.js"() {
    init_modules_watch_stub();
    init_platform_browser();
    init_core();
    init_codec();
    init_gist();
    init_channel();
    Gist = makeGist(await createWasmSdk({
      platform: platform_browser_exports,
      packageName: PACKAGE_NAME
    }));
  }
});

// .wrangler/tmp/bundle-o2XXAu/middleware-loader.entry.ts
init_modules_watch_stub();

// .wrangler/tmp/bundle-o2XXAu/middleware-insertion-facade.js
init_modules_watch_stub();

// src/worker.js
init_modules_watch_stub();
var json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data, null, 1), {
  status,
  headers: { "content-type": "application/json" }
}), "json");
var worker_default = {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/probe") return json({ ok: false, error: "unknown route" }, 404);
    const t0 = performance.now();
    try {
      const { Gist: Gist2 } = await init_browser2().then(() => browser_exports);
      const gist = await Gist2.load();
      const topics = await gist.classify("Power of Goodness activities with children in Pati");
      return json({ ok: true, loadMs: Math.round(performance.now() - t0), topics });
    } catch (error) {
      return json({
        ok: false,
        failedAfterMs: Math.round(performance.now() - t0),
        name: error?.name,
        type: error?.constructor?.name,
        message: error?.message,
        stackHead: typeof error?.stack === "string" ? error.stack.split("\n").slice(0, 4).join("\n") : void 0
      });
    }
  }
};

// ../../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
init_modules_watch_stub();
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
init_modules_watch_stub();
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-o2XXAu/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../node_modules/wrangler/templates/middleware/common.ts
init_modules_watch_stub();
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-o2XXAu/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init2) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init2.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init2) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init2.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map

// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
"use strict";

((window) => {
  const { ops } = Deno.core;
  const { Event } = window.__bootstrap.event;
  const { EventTarget } = window.__bootstrap.eventTarget;
  const { pathFromURL } = window.__bootstrap.util;
  const { illegalConstructorKey } = window.__bootstrap.webUtil;
  const {
    ArrayIsArray,
    ArrayPrototypeIncludes,
    ArrayPrototypeMap,
    ArrayPrototypeSlice,
    Map,
    MapPrototypeGet,
    MapPrototypeHas,
    MapPrototypeSet,
    FunctionPrototypeCall,
    PromiseResolve,
    PromiseReject,
    ReflectHas,
    SafeArrayIterator,
    SymbolFor,
    TypeError,
  } = window.__bootstrap.primordials;

  /**
   * @typedef StatusCacheValue
   * @property {PermissionState} state
   * @property {PermissionStatus} status
   */

  /** @type {ReadonlyArray<"read" | "write" | "net" | "env" | "sys" | "run" | "ffi" | "hrtime">} */
  const permissionNames = [
    "read",
    "write",
    "net",
    "env",
    "sys",
    "run",
    "ffi",
    "hrtime",
  ];

  /**
   * @param {Deno.PermissionDescriptor} desc
   * @returns {Deno.PermissionState}
   */
  function opQuery(desc) {
    return ops.op_query_permission(desc);
  }

  /**
   * @param {Deno.PermissionDescriptor} desc
   * @returns {Deno.PermissionState}
   */
  function opRevoke(desc) {
    return ops.op_revoke_permission(desc);
  }

  /**
   * @param {Deno.PermissionDescriptor} desc
   * @returns {Deno.PermissionState}
   */
  function opRequest(desc) {
    return ops.op_request_permission(desc);
  }

  class PermissionStatus extends EventTarget {
    /** @type {{ state: Deno.PermissionState }} */
    #state;

    /** @type {((this: PermissionStatus, event: Event) => any) | null} */
    onchange = null;

    /** @returns {Deno.PermissionState} */
    get state() {
      return this.#state.state;
    }

    /**
     * @param {{ state: Deno.PermissionState }} state
     * @param {unknown} key
     */
    constructor(state = null, key = null) {
      if (key != illegalConstructorKey) {
        throw new TypeError("Illegal constructor.");
      }
      super();
      this.#state = state;
    }

    /**
     * @param {Event} event
     * @returns {boolean}
     */
    dispatchEvent(event) {
      let dispatched = super.dispatchEvent(event);
      if (dispatched && this.onchange) {
        FunctionPrototypeCall(this.onchange, this, event);
        dispatched = !event.defaultPrevented;
      }
      return dispatched;
    }

    [SymbolFor("Deno.privateCustomInspect")](inspect) {
      return `${this.constructor.name} ${
        inspect({ state: this.state, onchange: this.onchange })
      }`;
    }
  }

  /** @type {Map<string, StatusCacheValue>} */
  const statusCache = new Map();

  /**
   * @param {Deno.PermissionDescriptor} desc
   * @param {Deno.PermissionState} state
   * @returns {PermissionStatus}
   */
  function cache(desc, state) {
    let { name: key } = desc;
    if (
      (desc.name === "read" || desc.name === "write" || desc.name === "ffi") &&
      ReflectHas(desc, "path")
    ) {
      key += `-${desc.path}&`;
    } else if (desc.name === "net" && desc.host) {
      key += `-${desc.host}&`;
    } else if (desc.name === "run" && desc.command) {
      key += `-${desc.command}&`;
    } else if (desc.name === "env" && desc.variable) {
      key += `-${desc.variable}&`;
    } else if (desc.name === "sys" && desc.kind) {
      key += `-${desc.kind}&`;
    } else {
      key += "$";
    }
    if (MapPrototypeHas(statusCache, key)) {
      const status = MapPrototypeGet(statusCache, key);
      if (status.state !== state) {
        status.state = state;
        status.status.dispatchEvent(new Event("change", { cancelable: false }));
      }
      return status.status;
    }
    /** @type {{ state: Deno.PermissionState; status?: PermissionStatus }} */
    const status = { state };
    status.status = new PermissionStatus(status, illegalConstructorKey);
    MapPrototypeSet(statusCache, key, status);
    return status.status;
  }

  /**
   * @param {unknown} desc
   * @returns {desc is Deno.PermissionDescriptor}
   */
  function isValidDescriptor(desc) {
    return typeof desc === "object" && desc !== null &&
      ArrayPrototypeIncludes(permissionNames, desc.name);
  }

  /**
   * @param {Deno.PermissionDescriptor} desc
   * @returns {desc is Deno.PermissionDescriptor}
   */
  function formDescriptor(desc) {
    if (
      desc.name === "read" || desc.name === "write" || desc.name === "ffi"
    ) {
      desc.path = pathFromURL(desc.path);
    } else if (desc.name === "run") {
      desc.command = pathFromURL(desc.command);
    }
  }

  class Permissions {
    constructor(key = null) {
      if (key != illegalConstructorKey) {
        throw new TypeError("Illegal constructor.");
      }
    }

    query(desc) {
      try {
        return PromiseResolve(this.querySync(desc));
      } catch (error) {
        return PromiseReject(error);
      }
    }

    querySync(desc) {
      if (!isValidDescriptor(desc)) {
        throw new TypeError(
          `The provided value "${desc?.name}" is not a valid permission name.`,
        );
      }

      formDescriptor(desc);

      const state = opQuery(desc);
      return cache(desc, state);
    }

    revoke(desc) {
      try {
        return PromiseResolve(this.revokeSync(desc));
      } catch (error) {
        return PromiseReject(error);
      }
    }

    revokeSync(desc) {
      if (!isValidDescriptor(desc)) {
        throw new TypeError(
          `The provided value "${desc?.name}" is not a valid permission name.`,
        );
      }

      formDescriptor(desc);

      const state = opRevoke(desc);
      return cache(desc, state);
    }

    request(desc) {
      try {
        return PromiseResolve(this.requestSync(desc));
      } catch (error) {
        return PromiseReject(error);
      }
    }

    requestSync(desc) {
      if (!isValidDescriptor(desc)) {
        throw new TypeError(
          `The provided value "${desc?.name}" is not a valid permission name.`,
        );
      }

      formDescriptor(desc);

      const state = opRequest(desc);
      return cache(desc, state);
    }
  }

  const permissions = new Permissions(illegalConstructorKey);

  /** Converts all file URLs in FS allowlists to paths. */
  function serializePermissions(permissions) {
    if (typeof permissions == "object" && permissions != null) {
      const serializedPermissions = {};
      for (
        const key of new SafeArrayIterator(["read", "write", "run", "ffi"])
      ) {
        if (ArrayIsArray(permissions[key])) {
          serializedPermissions[key] = ArrayPrototypeMap(
            permissions[key],
            (path) => pathFromURL(path),
          );
        } else {
          serializedPermissions[key] = permissions[key];
        }
      }
      for (
        const key of new SafeArrayIterator(["env", "hrtime", "net", "sys"])
      ) {
        if (ArrayIsArray(permissions[key])) {
          serializedPermissions[key] = ArrayPrototypeSlice(permissions[key]);
        } else {
          serializedPermissions[key] = permissions[key];
        }
      }
      return serializedPermissions;
    }
    return permissions;
  }

  window.__bootstrap.permissions = {
    serializePermissions,
    permissions,
    Permissions,
    PermissionStatus,
  };
})(this);

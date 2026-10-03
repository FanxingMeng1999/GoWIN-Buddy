/* Preserve independent edits from the dashboard and desktop pet. */
(function (target) {
  "use strict";
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key =>
      Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]));
  }
  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }
  function keyed(items) {
    if (!Array.isArray(items)) return false;
    const ids = items.map(item => object(item) && item.id != null ? typeof item.id + ":" + item.id : null);
    return !ids.includes(null) && new Set(ids).size === ids.length;
  }
  function mergeDashboardState(base, local, remote) {
    const conflicts = [];
    function merge(before, mine, theirs, location) {
      if (equal(mine, before)) return clone(theirs);
      if (equal(theirs, before) || equal(mine, theirs)) return clone(mine);
      if (object(mine) && object(theirs) && (before === undefined || object(before))) {
        const merged = {};
        const keys = new Set([...Object.keys(before || {}), ...Object.keys(mine), ...Object.keys(theirs)]);
        keys.forEach(key => {
          const value = merge(before && before[key], mine[key], theirs[key], location + "." + key);
          if (value !== undefined) Object.defineProperty(merged, key, { value, enumerable: true, configurable: true, writable: true });
        });
        return merged;
      }
      if (keyed(mine) && keyed(theirs) && (before === undefined || keyed(before))) {
        const toMap = items => new Map((items || []).map(item => [typeof item.id + ":" + item.id, item]));
        const old = toMap(before), left = toMap(mine), right = toMap(theirs);
        const ids = new Set([...left.keys(), ...right.keys(), ...old.keys()]);
        const merged = [];
        ids.forEach(id => {
          const value = merge(old.get(id), left.get(id), right.get(id), location + "[" + id + "]");
          if (value !== undefined) merged.push(value);
        });
        return merged;
      }
      conflicts.push(location || "state");
      return clone(mine);
    }
    return { state: merge(base, local, remote, ""), conflicts };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { mergeDashboardState };
  else target.mergeDashboardState = mergeDashboardState;
})(typeof window !== "undefined" ? window : globalThis);

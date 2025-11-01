/**
 * Utility for working with objects that have branded type keys.
 * Provides type-safe alternatives to Object.keys() and Object.entries()
 * that preserve branded types.
 */
export const TypedObject = {
  /**
   * Type-safe version of Object.keys() that preserves the key type.
   */
  keys<K extends PropertyKey, V>(obj: Record<K, V>): K[] {
    return Object.keys(obj) as K[];
  },

  /**
   * Type-safe version of Object.entries() that preserves both key and value types.
   */
  entries<K extends PropertyKey, V>(obj: Record<K, V>): [K, V][] {
    return Object.entries(obj) as [K, V][];
  },
};

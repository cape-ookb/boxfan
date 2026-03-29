import {
  allPass,
  anyPass,
  filter,
  isArray,
  isPlainObject,
  prop,
  stringToPath,
} from "remeda";

// --- Serializable filter descriptor types ---

/** A single field match: exact value, wildcard "*", or array of allowed values (any-of). */
type FieldValue = string | number | boolean | null;
type FieldMatch = FieldValue | "*" | FieldValue[];

/** Dot-notation key → match value. */
type FieldConditions = Record<string, FieldMatch>;

/** Conditions that support grouped OR: an array of groups means "any group must fully match". */
type GroupableConditions = FieldConditions | FieldConditions[];

/**
 * A JSON-serializable filter descriptor.
 *
 * - `allPass`  – ALL conditions must match
 * - `nonePass` – NONE of the conditions may match
 * - `anyPass`  – at least ONE condition must match
 *
 * If none of these keys are present the entire object is treated as `allPass`.
 */
export interface FilterDescriptor {
  allPass?: FieldConditions;
  nonePass?: GroupableConditions;
  anyPass?: GroupableConditions;
}

/** One or more filter descriptors. An array is applied as a pipeline (each filters the previous result). */
export type FilterInput =
  | FilterDescriptor
  | FieldConditions
  | (FilterDescriptor | FieldConditions)[];

// --- Internal helpers ---

function resolvePath(obj: Record<string, unknown>, key: string): unknown {
  const path = stringToPath(key);
  return prop(obj, ...(path as [string]));
}

/** Build a predicate for a single field condition entry. */
function fieldPredicate(
  key: string,
  match: FieldMatch,
): (item: Record<string, unknown>) => boolean {
  if (match === "*") {
    // Wildcard: value must exist and be truthy (non-null, non-undefined, non-empty string, non-false).
    return (item) => {
      const v = resolvePath(item, key);
      return v !== undefined && v !== null && v !== "" && v !== false;
    };
  }
  // Comparison operators: ">3", "<10", ">=5.5", "<=-1"
  if (typeof match === "string") {
    const cmp = match.match(/^([><]=?)([-]?\d+(?:\.\d+)?)$/);
    if (cmp) {
      const op = cmp[1];
      const threshold = Number(cmp[2]);
      return (item) => {
        const v = resolvePath(item, key);
        if (typeof v !== "number") return false;
        if (op === ">") return v > threshold;
        if (op === "<") return v < threshold;
        if (op === ">=") return v >= threshold;
        return v <= threshold; // "<="
      };
    }
  }
  if (isArray(match)) {
    // Any-of: value must be one of the listed values.
    return (item) => {
      const v = resolvePath(item, key);
      return (match as FieldValue[]).includes(v as FieldValue);
    };
  }
  // Exact match.
  return (item) => resolvePath(item, key) === match;
}

/** All field conditions must match. */
function allPassPredicate(
  conditions: FieldConditions,
): (item: Record<string, unknown>) => boolean {
  const predicates = Object.entries(conditions).map(([k, v]) =>
    fieldPredicate(k, v),
  );
  return allPass(predicates);
}

/** At least one condition (or group of conditions) must match. */
function anyPassPredicate(
  conditions: GroupableConditions,
): (item: Record<string, unknown>) => boolean {
  if (isArray(conditions)) {
    // Array of groups: any group must fully match (OR of ANDs).
    const groupPredicates = conditions.map((group) => allPassPredicate(group));
    return anyPass(groupPredicates);
  }
  // Flat object: any single field must match.
  const predicates = Object.entries(conditions).map(([k, v]) =>
    fieldPredicate(k, v),
  );
  return anyPass(predicates);
}

// --- Normalise raw input into a FilterDescriptor ---

function normalise(
  raw: FilterDescriptor | FieldConditions,
): FilterDescriptor {
  if ("allPass" in raw || "nonePass" in raw || "anyPass" in raw) {
    return raw as FilterDescriptor;
  }
  return { allPass: raw as FieldConditions };
}

// --- Build a single predicate from a FilterDescriptor ---

function buildSinglePredicate(
  raw: FilterDescriptor | FieldConditions,
): (item: Record<string, unknown>) => boolean {
  const desc = normalise(raw);
  const predicates: ((item: Record<string, unknown>) => boolean)[] = [];

  // Collect extra keys (not reserved) as implicit allPass conditions.
  const reserved = new Set(["allPass", "nonePass", "anyPass"]);
  const extra: FieldConditions = {};
  for (const key of Object.keys(desc)) {
    if (!reserved.has(key)) {
      extra[key] = (desc as Record<string, unknown>)[key] as FieldMatch;
    }
  }

  const merged: FieldConditions = {
    ...extra,
    ...(isPlainObject(desc.allPass) ? desc.allPass : {}),
  };

  if (Object.keys(merged).length > 0) {
    predicates.push(allPassPredicate(merged));
  }
  if (desc.nonePass) {
    const any = anyPassPredicate(desc.nonePass);
    predicates.push((item) => !any(item));
  }
  if (desc.anyPass) {
    predicates.push(anyPassPredicate(desc.anyPass));
  }

  return allPass(predicates);
}

/**
 * Compile a filter into a reusable predicate function.
 *
 * Accepts a FilterDescriptor, bare FieldConditions, or an array of descriptors
 * (pipeline). The compilation happens once — the returned function can be used
 * directly with Array.filter or anywhere a predicate is needed.
 */
export function buildPredicate(
  raw: FilterInput,
): (item: Record<string, unknown>) => boolean {
  if (isArray(raw)) {
    const predicates = raw.map((fi) => buildSinglePredicate(fi));
    return allPass(predicates);
  }

  return buildSinglePredicate(raw);
}

// --- Public API ---

/**
 * Filter an array of objects (or test a single object) against a
 * JSON-serializable filter descriptor.
 *
 * When `filterInfo` is an array of descriptors they are applied as a pipeline —
 * each successive filter narrows the result of the previous one.
 *
 * Returns a filtered array when given an array, a boolean when given a
 * single object, or `false` for non-object input.
 */
export function filterBy<T extends Record<string, unknown>>(
  values: T[],
  filterInfo: FilterInput,
): T[];
export function filterBy<T extends Record<string, unknown>>(
  values: T,
  filterInfo: FilterInput,
): boolean;
export function filterBy(
  values: unknown,
  filterInfo: FilterInput,
): unknown {
  const predicate = buildPredicate(filterInfo);

  if (isArray(values)) {
    return filter(values as Record<string, unknown>[], predicate);
  }
  if (isPlainObject(values)) {
    return predicate(values as Record<string, unknown>);
  }
  return false;
}

/**
 * Given a collection where each item carries its own filter descriptor,
 * return the items whose embedded filter matches the provided context.
 *
 * Items without a filter at `filterKey` are included (no filter = always match).
 */
export function matchContext<T extends Record<string, unknown>>(
  collection: T[],
  context: Record<string, unknown>,
  filterKey: string,
): T[] {
  return filter(collection, (item) => {
    const raw = resolvePath(item, filterKey);

    // No filter present → always matches.
    if (raw === undefined || raw === null) return true;

    const predicate = buildPredicate(raw as FilterInput);
    return predicate(context);
  });
}

/**
 * Pre-compile a collection's embedded filters into a reusable matcher function.
 * The returned function accepts a context and returns matching items.
 *
 * Filters are compiled once — only the context changes per call.
 */
export function buildMatcher<T extends Record<string, unknown>>(
  collection: T[],
  filterKey: string,
): (context: Record<string, unknown>) => T[] {
  const compiled = collection.map((item) => {
    const raw = resolvePath(item, filterKey);
    const predicate =
      raw === undefined || raw === null
        ? null
        : buildPredicate(raw as FilterInput);
    return { item, predicate };
  });

  return (context) =>
    compiled
      .filter(({ predicate }) => predicate === null || predicate(context))
      .map(({ item }) => item);
}

export default filterBy;

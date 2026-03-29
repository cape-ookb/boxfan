# boxfan

Serializable JSON filter predicates. Built on [Remeda](https://remedajs.com/).

Filter descriptors are plain JSON objects — no functions, no classes — so they can be sent over the wire, stored in a database, or embedded in configuration.

## Install

```bash
pnpm add boxfan
```

## API

### `filterBy(data, filter)`

Filter an array of objects, or test a single object, against a filter descriptor.

```ts
import { filterBy } from "boxfan";

const users = [
  { id: 1, name: "kai", role: "admin" },
  { id: 2, name: "bob", role: "user" },
  { id: 3, name: "tim", role: "admin" },
  { id: 4, name: "kristian", role: "user" },
];

// Array → returns filtered array
filterBy(users, { allPass: { role: "admin" } });
// → [{ id: 1, ... }, { id: 3, ... }]

// Single object → returns boolean
filterBy({ name: "kai", role: "admin" }, { allPass: { role: "admin" } });
// → true
```

> **Tip:** For simple flat exact-match cases, you may not need boxfan at all.
> Remeda's [`hasSubObject`](https://remedajs.com/docs/#hasSubObject) does the job:
> ```ts
> import { hasSubObject } from "remeda";
> hasSubObject({ name: "kai", role: "admin" }, { role: "admin" }); // → true
> ```
> Reach for boxfan when you need wildcards, dot-paths, any-of arrays, compound OR groups, pipelines, or serializable filters embedded in data.

### `matchContext(collection, context, filterKey)`

The inverse of `filterBy`. Each item in the collection carries its own filter descriptor (at `filterKey`), tested against a context object. Useful for ad targeting, feature flags, notification routing, etc.

```ts
import { matchContext } from "boxfan";

const placements = [
  { id: 1, targeting: { allPass: { "section.id": "marketing" } } },
  { id: 2, targeting: { allPass: { "section.id": "engineering" } } },
  { id: 3, targeting: { anyPass: { "slot.id": ["header", "sidebar"] } } },
  { id: 4 }, // no targeting → always matches
];

const pageContext = {
  section: { id: "marketing" },
  slot: { id: "header" },
};

matchContext(placements, pageContext, "targeting");
// [placements[0], placements[2], placements[3]]
```

Items with no value (or `null`) at `filterKey` are always included.

### `buildMatcher(collection, filterKey)`

Pre-compile a collection's embedded filters into a reusable matcher. The collection is processed once — only the context changes per call. Ideal when the collection is loaded once (e.g. placements, feature flags) but tested against many different contexts (e.g. per page view, per request).

```ts
import { buildMatcher } from "boxfan";

const match = buildMatcher(placements, "targeting");

// Per request — filters are already compiled, no re-parsing
match({ section: { id: "marketing" }, slot: { id: "header" } });
// → [placements[0], placements[2], placements[3]]

match({ section: { id: "engineering" }, slot: { id: "footer" } });
// → [placements[1], placements[3]]
```

### `buildPredicate(filter)`

Compile a filter into a reusable predicate function. Compile once, use many times. Accepts a descriptor object or a pipeline array.

```ts
import { buildPredicate } from "boxfan";

const isAdmin = buildPredicate({ allPass: { role: "admin" } });
isAdmin({ role: "admin" }); // → true
isAdmin({ role: "user" });  // → false

// Pipeline compiled into a single predicate
const isNonBobAdmin = buildPredicate([
  { allPass: { role: "admin" } },
  { nonePass: { name: "bob" } },
]);

// Use directly with Array.filter
const admins = users.filter(buildPredicate({ allPass: { role: "admin" } }));
```

> **JSON parsing:** `buildPredicate` accepts objects, not strings. Handle
> JSON parsing closer to the source — e.g. when reading from a database or
> API response, parse first, then compile:
> ```ts
> const rules = rows.map((row) => ({
>   ...row,
>   predicate: buildPredicate(JSON.parse(row.filterJson)),
> }));
> ```

## Filter Descriptor

A filter descriptor is a plain object with one or more of these keys:

| Key | Behavior | Remeda equivalent |
|-----|----------|-------------------|
| `allPass` | ALL conditions must match | `allPass` |
| `anyPass` | At least ONE condition must match | `anyPass` |
| `nonePass` | NONE of the conditions may match | negated `anyPass` |

These are **reserved keys**. Any extra keys alongside them are treated as implicit `allPass` conditions:

```ts
// These are equivalent:
filterBy(data, { anyPass: { color: ["blue", "green"] }, name: "kai" });
filterBy(data, { anyPass: { color: ["blue", "green"] }, allPass: { name: "kai" } });
```

Avoid using these as field names in your data. The string `"*"` is a **reserved value** — it acts as a wildcard (field must exist and be truthy) and cannot be used as a literal match. Strings matching the pattern `[><]=?\d+` (e.g. `">3"`, `"<=99.5"`) are **reserved for comparison operators** and cannot be used as literal match values.

If none of these keys are present, the object is treated as `allPass`:

```ts
// These are equivalent:
filterBy(data, { name: "kai" });
filterBy(data, { allPass: { name: "kai" } });
```

### Condition values

Each condition maps a dot-notation key to a match value:

```ts
// Exact match
{ allPass: { name: "kai" } }

// Wildcard — any truthy value
{ allPass: { pet: "*" } }

// Any-of — value must be one of the listed values
{ anyPass: { color: ["blue", "green"] } }

// Comparison operators — >, <, >=, <=
{ allPass: { score: ">10" } }
{ allPass: { price: "<=99.99" } }
{ allPass: { temp: ">-5" } }

// Dot-notation — resolve nested paths
{ allPass: { "meta.role": "admin" } }
```

### Grouped OR (compound conditions)

`anyPass` and `nonePass` accept an array of condition groups for OR-of-ANDs logic:

```ts
// (slot=header AND viewport=desktop) OR (slot=sidebar AND viewport=mobile)
filterBy(data, {
  anyPass: [
    { "slot.id": "header", "viewport.id": "desktop" },
    { "slot.id": "sidebar", "viewport.id": "mobile" },
  ],
});
```

### Pipeline (array of descriptors)

Pass an array of descriptors to apply them as a pipeline — each one narrows the result of the previous:

```ts
filterBy(data, [
  { allPass: { "section.id": "marketing" } },
  { anyPass: [
    { "slot.id": "header", "viewport.id": "desktop" },
    { "slot.id": "sidebar", "viewport.id": "mobile" },
  ]},
]);
```

## Types

```ts
import type { FilterDescriptor, FilterInput } from "boxfan";
```

- **`FilterDescriptor`** — `{ allPass?, anyPass?, nonePass? }`
- **`FilterInput`** — a single descriptor, bare conditions, or an array of descriptors (pipeline)

## Why not JSON Schema?

JSON Schema is more powerful and standardized, but verbose for simple object matching:

```jsonc
// boxfan
{ "allPass": { "role": "admin", "section.id": "marketing" } }

// JSON Schema equivalent
{
  "type": "object",
  "required": ["role"],
  "properties": {
    "role": { "const": "admin" },
    "section": {
      "type": "object",
      "properties": {
        "id": { "const": "marketing" }
      }
    }
  }
}
```

JSON Schema doesn't have dot-path access, so nested checks get deeply nested. `anyOf`/`allOf`/`not` map to boxfan's `anyPass`/`allPass`/`nonePass` but with more boilerplate.

**Use JSON Schema when:** you already validate payloads with it, or need complex type constraints (regex patterns, numeric ranges, array length). Validators like [ajv](https://ajv.js.org/) compile schemas to fast predicates too.

**Use boxfan when:** you're storing targeting rules, feature flags, or filter configs in a database and want something compact, readable, and purpose-built for "does this object match?" rather than "is this object valid?"

### vs json-logic-js

[json-logic-js](https://jsonlogic.com/) is a general-purpose rules engine — it can express any computation as JSON, not just matching. The tradeoff is verbosity:

```jsonc
// boxfan
{ "allPass": { "role": "admin", "section.id": "marketing" } }

// json-logic-js equivalent
{
  "and": [
    { "==": [{ "var": "role" }, "admin"] },
    { "==": [{ "var": "section.id" }, "marketing"] }
  ]
}
```

```jsonc
// boxfan — any-of
{ "anyPass": { "color": ["blue", "green"] } }

// json-logic-js
{ "in": [{ "var": "color" }, ["blue", "green"]] }
```

**Use json-logic-js when:** you need a general-purpose rules engine — arithmetic, string operations, `map`/`reduce`, or control flow. It's also cross-language (implementations exist in Python, Ruby, PHP, etc.). (Note: boxfan now supports basic numeric comparisons — `">10"`, `"<=99.5"` — for simple threshold checks without needing a full rules engine.)

**Use boxfan when:** you only need object matching and want descriptors that are compact and self-evident. A non-technical person can read `{ "allPass": { "role": "admin" } }` and understand it.

> **See also:** [runflower](https://github.com/cape-ookb/runflower) — a serializable function composition engine built on lodash/fp. If you need serializable *transformations* (map, pick, flow) in addition to predicates, runflower sits between boxfan and json-logic-js in scope.

## License

ISC

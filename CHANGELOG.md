# Changelog

## 1.1.0

### New features

- **Comparison operators:** filter by numeric thresholds using `">3"`, `"<10"`, `">=5.5"`, `"<=-1"` as match values. Only matches when the field value is a number — strings, nulls, and booleans return `false`. Works everywhere: `allPass`, `anyPass`, `nonePass`, dot-paths, and pipelines.

## 1.0.0

Complete rewrite in TypeScript using [Remeda](https://remedajs.com/). Filter descriptors are now plain objects designed for serialization.

### Breaking changes

- **Renamed filter keys:** `must` → `allPass`, `should` → `anyPass`, `must_not` → `nonePass`
- **Renamed main function:** the default export is now `filterBy` (was an unnamed function)
- **Dependencies replaced:** lodash, dot-object, and JSONPath removed. Remeda is the sole dependency.
- **CoffeeScript removed:** source is now TypeScript. Exports compiled JS and TS source via conditional exports.
- **ESM only:** package uses `"type": "module"`.

### Migration from 0.x

```diff
- const boxfan = require("boxfan");
+ import { filterBy } from "boxfan";

- boxfan(data, { must: { name: "kai" } });
+ filterBy(data, { allPass: { name: "kai" } });

- boxfan(data, { should: { color: ["blue", "green"] } });
+ filterBy(data, { anyPass: { color: ["blue", "green"] } });

- boxfan(data, { must_not: { role: "guest" } });
+ filterBy(data, { nonePass: { role: "guest" } });
```

### New features

- **`matchContext(collection, context, filterKey)`** — find items whose embedded filter matches a context
- **`buildMatcher(collection, filterKey)`** — pre-compile embedded filters for repeated context matching
- **`buildPredicate(filter)`** — compile a descriptor into a reusable `(item) => boolean`
- **Pipeline filters:** pass an array of descriptors to apply sequentially
- **Grouped OR:** `anyPass` and `nonePass` accept an array of condition groups for OR-of-ANDs logic
- **Full TypeScript types:** `FilterDescriptor`, `FilterInput` exported

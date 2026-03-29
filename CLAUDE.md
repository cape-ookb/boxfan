# CLAUDE.md

This file provides guidance when working with code in this repository.

## Overview

Boxfan is a serializable JSON filter predicate library built on Remeda. It accepts an array of objects (or a single object) and a filter descriptor with `must`, `must_not`, and/or `should` properties — inspired by Elasticsearch query DSL. Filter descriptors are plain JSON, designed to be sent over the wire or stored in a database.

## Commands

- **Run tests:** `pnpm test` (vitest)
- **Watch tests:** `pnpm test:watch`
- **Build:** `pnpm build` (tsc → dist/)
- **Type-check:** `npx tsc --noEmit`

## Architecture

- **[src/index.ts](src/index.ts)** — Single-module library. Exports `boxfan` (default), `buildPredicate`, and `FilterDescriptor` type. Internally builds predicate functions from JSON descriptors using Remeda's `allPass` (must), `anyPass` (should), and negated `anyPass` (must_not).
- **[test/boxfan.test.ts](test/boxfan.test.ts)** — Vitest tests covering must/must_not/should, wildcards, dot-path access, single-object mode, and JSON round-trip serialization.

## Key Design Decisions

- Filter descriptors are plain JSON objects — no function references, classes, or non-serializable values.
- `*` wildcard matches any truthy, non-null, non-empty-string value.
- Dot-notation keys (e.g. `"meta.role"`) resolve nested paths at runtime via a simple walker (Remeda's `path` is statically typed and incompatible with dynamic keys from JSON).
- If the filter object has no `must`/`must_not`/`should` key, it is implicitly treated as `must`.
- `buildPredicate` is exported separately so callers can compile a descriptor once and reuse it.

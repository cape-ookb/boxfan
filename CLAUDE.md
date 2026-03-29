# CLAUDE.md

This file provides guidance when working with code in this repository.

## Overview

Boxfan is a serializable JSON filter predicate library built on Remeda. Filter descriptors use `allPass`, `anyPass`, and `nonePass` keys (matching Remeda's naming). Descriptors are plain JSON, designed to be sent over the wire or stored in a database.

## Commands

- **Run tests:** `pnpm test` (vitest)
- **Watch tests:** `pnpm test:watch`
- **Build:** `pnpm build` (tsc → dist/)
- **Type-check:** `pnpm typecheck`

Exports both TS source (`source` condition) and compiled JS (`import`). Build runs automatically on `prepublishOnly`.

## Architecture

- **[src/index.ts](src/index.ts)** — Single-module library. Exports `filterBy` (default), `buildPredicate`, `buildMatcher`, `matchContext`, and types `FilterDescriptor`, `FilterInput`. Internally builds predicate functions from JSON descriptors using Remeda's `allPass`/`anyPass`.
- **[test/boxfan.test.ts](test/boxfan.test.ts)** — Vitest tests covering allPass/anyPass/nonePass, wildcards, dot-path access, grouped OR, pipelines, matchContext, buildMatcher, and serialization round-trips.

## Key Design Decisions

- Filter descriptors are plain JSON objects — no function references, classes, or non-serializable values.
- `allPass`, `anyPass`, `nonePass` are reserved keys. `*` is a reserved value (wildcard).
- Dot-notation keys (e.g. `"meta.role"`) resolved via Remeda's `prop` + `stringToPath`.
- If the filter object has no reserved key, it is implicitly treated as `allPass`.
- `buildPredicate` compiles a descriptor once into a reusable predicate function.
- `buildMatcher` pre-compiles a collection's embedded filters for repeated context matching.

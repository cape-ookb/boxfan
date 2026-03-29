import { describe, expect, it } from "vitest";
import { filterBy, buildPredicate, matchContext, buildMatcher } from "../src/index.js";

const data = [
  { id: 1, name: "kai", color: "blue" },
  { id: 2, name: "bob", color: "green", pet: "cat" },
  { id: 3, name: "tim", color: "red", pet: "" },
  { id: 4, name: "kristian", color: "white", pet: false as const },
  { id: 5, name: "kristian", color: "blue" },
  { id: 6, name: "tim", color: "green" },
];

describe("filterBy", () => {
  it("returns only entries that match allPass", () => {
    const result = filterBy(data, { allPass: { name: "tim" } });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(3);
    expect(result[1].id).toBe(6);
  });

  it("returns entries matching any value in an anyPass array", () => {
    const result = filterBy(data, { anyPass: { name: ["tim", "kai"] } });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual([1, 3, 6]);
  });

  it("excludes entries matching nonePass conditions", () => {
    const result = filterBy(data, {
      nonePass: { name: "kai", color: "green", id: 5 },
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual([3, 4]);
  });

  it("returns empty array when no items match", () => {
    const result = filterBy(data, { allPass: { cow: "bessy" } });
    expect(result).toEqual([]);
  });

  it("treats bare object as allPass filter", () => {
    const result = filterBy(data, { name: "kai" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("returns boolean for a single object", () => {
    expect(filterBy({ name: "kai" }, { allPass: { name: "kai" } })).toBe(true);
    expect(filterBy({ name: "kai" }, { allPass: { name: "bob" } })).toBe(false);
  });

  it("returns false for non-object input", () => {
    expect(filterBy("hello" as never, { allPass: { a: 1 } })).toBe(false);
  });

  it("wildcard * matches any non-empty value", () => {
    const result = filterBy(data, { allPass: { pet: "*" } });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2); // only "cat" is non-empty
  });

  it("supports dot-notation paths", () => {
    const nested = [
      { id: 1, meta: { role: "admin" } },
      { id: 2, meta: { role: "user" } },
    ];
    const result = filterBy(nested, { allPass: { "meta.role": "admin" } });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});

describe("buildPredicate", () => {
  it("returns a reusable predicate function", () => {
    const pred = buildPredicate({ allPass: { name: "kai" } });
    expect(pred({ name: "kai", id: 1 })).toBe(true);
    expect(pred({ name: "bob", id: 2 })).toBe(false);
  });

  it("compiles a pipeline array into a single predicate", () => {
    const pred = buildPredicate([
      { allPass: { role: "admin" } },
      { nonePass: { name: "bob" } },
    ]);
    expect(pred({ name: "kai", role: "admin" })).toBe(true);
    expect(pred({ name: "bob", role: "admin" })).toBe(false);
    expect(pred({ name: "kai", role: "user" })).toBe(false);
  });

  it("can be used directly with Array.filter", () => {
    const users = [
      { name: "kai", role: "admin" },
      { name: "bob", role: "user" },
      { name: "tim", role: "admin" },
    ];
    const result = users.filter(buildPredicate({ allPass: { role: "admin" } }));
    expect(result.map((r) => r.name)).toEqual(["kai", "tim"]);
  });
});

describe("pipeline (array of filters)", () => {
  it("applies filters in sequence, narrowing results", () => {
    // First: keep only blue or green → ids 1, 2, 5, 6
    // Then: exclude kristian → ids 1, 2, 6
    const result = filterBy(data, [
      { anyPass: { color: ["blue", "green"] } },
      { nonePass: { name: "kristian" } },
    ]);
    expect(result.map((r) => r.id)).toEqual([1, 2, 6]);
  });

  it("single-element array behaves like a plain descriptor", () => {
    const result = filterBy(data, [{ allPass: { name: "tim" } }]);
    expect(result.map((r) => r.id)).toEqual([3, 6]);
  });

  it("empty array returns all items", () => {
    const result = filterBy(data, []);
    expect(result).toHaveLength(data.length);
  });

  it("works with a single object input", () => {
    expect(
      filterBy({ name: "kai", color: "blue" }, [
        { allPass: { name: "kai" } },
        { allPass: { color: "blue" } },
      ]),
    ).toBe(true);
    expect(
      filterBy({ name: "kai", color: "blue" }, [
        { allPass: { name: "kai" } },
        { allPass: { color: "red" } },
      ]),
    ).toBe(false);
  });
});

describe("grouped OR (anyPass with array of groups)", () => {
  const slots = [
    { id: 1, slot: { id: "header" }, viewport: { id: "desktop" }, section: { id: "marketing" } },
    { id: 2, slot: { id: "header" }, viewport: { id: "mobile" }, section: { id: "marketing" } },
    { id: 3, slot: { id: "sidebar" }, viewport: { id: "mobile" }, section: { id: "marketing" } },
    { id: 4, slot: { id: "sidebar" }, viewport: { id: "desktop" }, section: { id: "engineering" } },
    { id: 5, slot: { id: "footer" }, viewport: { id: "desktop" }, section: { id: "marketing" } },
    { id: 6, slot: { id: "header" }, viewport: { id: "desktop" }, section: { id: "engineering" } },
    { id: 7, slot: { id: "sidebar" }, viewport: { id: "mobile" }, section: { id: "engineering" } },
  ];

  it("matches when (slot=header AND viewport=desktop) OR (slot=sidebar AND viewport=mobile)", () => {
    const result = filterBy(slots, {
      anyPass: [
        { "slot.id": "header", "viewport.id": "desktop" },
        { "slot.id": "sidebar", "viewport.id": "mobile" },
      ],
    });
    expect(result.map((r) => r.id)).toEqual([1, 3, 6, 7]);
  });

  it("single group in array behaves like allPass", () => {
    const result = filterBy(slots, {
      anyPass: [{ "slot.id": "footer" }],
    });
    expect(result.map((r) => r.id)).toEqual([5]);
  });

  it("grouped nonePass excludes compound conditions", () => {
    // Exclude (header+desktop) OR (sidebar+mobile) → keep 2, 4, 5
    const result = filterBy(slots, {
      nonePass: [
        { "slot.id": "header", "viewport.id": "desktop" },
        { "slot.id": "sidebar", "viewport.id": "mobile" },
      ],
    });
    expect(result.map((r) => r.id)).toEqual([2, 4, 5]);
  });

  it("pipeline: allPass section=marketing then anyPass slot groups", () => {
    // Step 1: allPass narrows to marketing only → 1, 2, 3, 5
    // Step 2: anyPass picks (header+desktop) OR (sidebar+mobile) → 1, 3
    // Engineering items (4, 6, 7) are excluded by the allPass stage
    const result = filterBy(slots, [
      { allPass: { "section.id": "marketing" } },
      {
        anyPass: [
          { "slot.id": "header", "viewport.id": "desktop" },
          { "slot.id": "sidebar", "viewport.id": "mobile" },
        ],
      },
    ]);
    expect(result.map((r) => r.id)).toEqual([1, 3]);
  });
});

describe("matchContext", () => {
  const context = {
    slot: { id: "header" },
    viewport: { id: "desktop" },
    section: { id: "marketing" },
  };

  const placements = [
    { id: 1, targeting: { allPass: { "section.id": "marketing" } } },
    { id: 2, targeting: { allPass: { "section.id": "engineering" } } },
    {
      id: 3,
      targeting: {
        anyPass: [
          { "slot.id": "header", "viewport.id": "desktop" },
          { "slot.id": "sidebar", "viewport.id": "mobile" },
        ],
      },
    },
    { id: 4, targeting: { allPass: { "slot.id": "footer" } } },
    { id: 5, label: "no targeting" },
  ];

  it("returns items whose embedded filter matches the context", () => {
    const result = matchContext(placements, context, "targeting");
    // 1: marketing matches, 2: engineering doesn't, 3: header+desktop matches,
    // 4: footer doesn't, 5: no filter → included
    expect(result.map((r) => r.id)).toEqual([1, 3, 5]);
  });

  it("items with no filter key are always included", () => {
    const items = [
      { id: 1 },
      { id: 2, targeting: null },
      { id: 3, targeting: { allPass: { "slot.id": "nope" } } },
    ];
    const result = matchContext(items, context, "targeting");
    expect(result.map((r) => r.id)).toEqual([1, 2]);
  });

  it("supports pipeline filters on items", () => {
    const items = [
      {
        id: 1,
        rules: [
          { allPass: { "section.id": "marketing" } },
          { anyPass: { "slot.id": ["header", "sidebar"] } },
        ],
      },
      {
        id: 2,
        rules: [
          { allPass: { "section.id": "marketing" } },
          { allPass: { "slot.id": "footer" } },
        ],
      },
    ];
    const result = matchContext(items, context, "rules");
    expect(result.map((r) => r.id)).toEqual([1]);
  });
});

describe("buildMatcher", () => {
  const placements = [
    { id: 1, targeting: { allPass: { "section.id": "marketing" } } },
    { id: 2, targeting: { allPass: { "section.id": "engineering" } } },
    { id: 3, targeting: { anyPass: { "slot.id": ["header", "sidebar"] } } },
    { id: 4 },
  ];

  const match = buildMatcher(placements, "targeting");

  it("returns matching items for a given context", () => {
    const result = match({
      section: { id: "marketing" },
      slot: { id: "header" },
    });
    expect(result.map((r) => r.id)).toEqual([1, 3, 4]);
  });

  it("returns different results for a different context", () => {
    const result = match({
      section: { id: "engineering" },
      slot: { id: "footer" },
    });
    expect(result.map((r) => r.id)).toEqual([2, 4]);
  });

  it("items with no filter always match", () => {
    const result = match({ section: { id: "nope" }, slot: { id: "nope" } });
    expect(result.map((r) => r.id)).toEqual([4]);
  });
});

describe("serialization round-trip", () => {
  it("filter descriptor survives JSON serialization", () => {
    const descriptor = {
      allPass: { color: "blue" },
      nonePass: { name: "kristian" },
    };
    const roundTripped = JSON.parse(JSON.stringify(descriptor));
    const result = filterBy(data, roundTripped);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});

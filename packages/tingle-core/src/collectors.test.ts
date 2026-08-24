import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  homePatentForCountry,
  planLanes,
  regionForCountry,
} from "./collectors.js";

describe("planLanes", () => {
  const base = {
    collectors: {
      search: "c_search",
      watch: "c_watch",
    } as const,
    searchListingUrl: "https://dev.to/t/indiehackers",
    watchUrl: "https://www.uneed.best/",
    query: "collaborative robot swarm",
  };

  it("routes a US cheap look to search + Uneed (watch alias) and records missing Google Patents", () => {
    const plan = planLanes({ ...base, country: "US", lane: "cheap" });
    assert.equal(plan.region, "region_us");
    assert.ok(plan.jobs.some((j) => j.key === "search"));
    assert.ok(plan.jobs.some((j) => j.key === "watch" && j.home));
    assert.ok(
      plan.missing.some((m) => m.key === "patent"),
      "unpinned Google Patents is a collector failure, not an empty niche",
    );
    assert.ok(!plan.jobs.some((j) => j.key === "patent"));
  });

  it("does not treat Uneed as the JP home board", () => {
    const plan = planLanes({ ...base, country: "JP", lane: "cheap" });
    assert.equal(plan.region, "region_jp");
    assert.ok(plan.missing.some((m) => m.key === "region_jp"));
    assert.ok(plan.missing.some((m) => m.key === "patent"));
    assert.ok(!plan.jobs.some((j) => j.key === "watch" && j.home));
  });

  it("on deep, still uses Google Patents rather than inventing office pins", () => {
    const plan = planLanes({
      ...base,
      collectors: { ...base.collectors, patent: "c_patent" },
      country: "JP",
      lane: "deep",
    });
    assert.ok(plan.jobs.some((j) => j.key === "patent"));
    const missingKeys = plan.missing.map((m) => m.key);
    assert.ok(!missingKeys.includes("patent"));
    assert.ok(!plan.jobs.some((j) => j.key === "patent_uspto"));
    assert.ok(!plan.jobs.some((j) => j.key === "patent_jpo"));
  });
});

describe("geo maps", () => {
  it("maps KR to KIPO and the KR board", () => {
    assert.equal(regionForCountry("KR"), "region_kr");
    assert.equal(homePatentForCountry("KR"), "patent_kipo");
  });
  it("maps DE to EPO and the EU board", () => {
    assert.equal(regionForCountry("DE"), "region_eu");
    assert.equal(homePatentForCountry("DE"), "patent_epo");
  });
});

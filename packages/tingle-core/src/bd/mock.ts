import type { HitRow, HitSource } from "../schema/hits.js";

const TODAY = () => new Date().toISOString().slice(0, 10);

function row(
  source: HitSource,
  partial: Omit<HitRow, "source" | "source_domain"> & { source_domain?: string },
): HitRow {
  const host = (() => {
    try {
      return new URL(partial.url).hostname.replace(/^www\./, "");
    } catch {
      return partial.source_domain ?? "example.com";
    }
  })();
  return {
    source,
    title: partial.title,
    url: partial.url,
    snippet: partial.snippet,
    published_at: partial.published_at,
    source_domain: partial.source_domain ?? host,
  };
}

/** Matching + noise rows so piles.ts can prove it drops unrelated listing cards. */
export function mockRowsFor(source: HitSource): unknown[] {
  if (source === "search") {
    return [
      row("search", {
        title: "I built a claim watch that pings me when someone ships my idea",
        url: "https://dev.to/example/claim-watch-for-indie-builders",
        snippet:
          "A public-web watch for indie builders: confirm one sentence, then get told when a rival ships.",
        published_at: "2026-08-19",
      }),
      row("search", {
        title: "How I roast coffee beans in a studio apartment",
        url: "https://dev.to/example/apartment-coffee-roast",
        snippet: "A weekend hobby log about grind size and a $20 popper.",
        published_at: "2026-08-21",
      }),
      row("search", {
        title: "Open-source library for fingerprinting a one-sentence product claim",
        url: "https://github.com/example/claim-fingerprint",
        snippet:
          "Docs and a TypeScript library indie builders use to watch when someone else ships an idea.",
        published_at: "2026-04-02",
      }),
    ];
  }
  if (source === "watch") {
    return [
      row("watch", {
        title: "LanePing",
        url: "https://www.uneed.best/tool/laneping",
        snippet:
          "Tells indie builders when another product in their lane launches this week.",
        published_at: TODAY(),
      }),
      row("watch", {
        title: "BeanCounter",
        url: "https://www.uneed.best/tool/beancounter",
        snippet: "Loyalty stamps for neighborhood coffee shops.",
        published_at: TODAY(),
      }),
      row("watch", {
        title: "PriorBoard",
        url: "https://www.uneed.best/tool/priorboard",
        snippet:
          "A launch board of indie products grouped by the job they do, updated daily.",
        published_at: "2026-01-15",
      }),
    ];
  }
  return mockGoodChaos();
}

/** A launch that is not in the first-look fixture — used to prove a Tingle tick diffs. */
export function mockNewWatchLaunch(): HitRow {
  return row("watch", {
    title: "ClaimSnitch",
    url: "https://www.uneed.best/tool/claimsnitch",
    snippet:
      "Just shipped: a watch that tells indie builders when someone else ships their idea.",
    published_at: TODAY(),
  });
}

export function mockGoodChaos(): unknown[] {
  return [
    row("chaos", {
      title: "ClaimWatch",
      url: "https://chaos.example/launch/claimwatch",
      snippet:
        "Tells solo builders when somebody else ships the thing they are halfway through building. Watches launch boards and release notes.",
      published_at: "2026-08-20",
    }),
    row("chaos", {
      title: "PriorArt Radar",
      url: "https://chaos.example/launch/priorart-radar",
      snippet:
        "Weekly digest of new filings and preprints that match a saved one-sentence description of your project.",
      published_at: "2026-08-18",
    }),
    row("chaos", {
      title: "NicheFill",
      url: "https://chaos.example/launch/nichefill",
      snippet:
        "Directory of indie products grouped by the job they do, updated daily from public launch pages.",
      published_at: "2026-08-11",
    }),
    row("chaos", {
      title: "ScrapeKeeper",
      url: "https://chaos.example/launch/scrapekeeper",
      snippet:
        "Hosted extractors that repair their own selectors when a target site redesigns, so downstream pipelines keep the same collector id.",
      published_at: "2026-07-29",
    }),
  ];
}

/**
 * Same row count as the good fixture, empty required fields — the DOM still
 * found cards, but selectors moved. That is a heal incident.
 */
export function mockBrokenChaos(): unknown[] {
  return mockGoodChaos().map((r) => {
    const row = r as HitRow;
    return {
      source: "chaos",
      title: "",
      url: row.url,
      snippet: "",
      published_at: row.published_at,
      source_domain: row.source_domain,
    };
  });
}

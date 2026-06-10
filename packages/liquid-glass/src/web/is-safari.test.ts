import { afterEach, describe, expect, it, vi } from "vitest";

import { isSafari } from "./is-safari";

const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const FIREFOX_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1";
const EDGE_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.51";
const FIREFOX_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0";

function stubUserAgent(value: string): void {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(value);
}

describe("isSafari", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects desktop Safari", () => {
    stubUserAgent(SAFARI_MAC);
    expect(isSafari()).toBe(true);
  });

  it("detects iOS Safari", () => {
    stubUserAgent(SAFARI_IOS);
    expect(isSafari()).toBe(true);
  });

  it("rejects Chrome even though its UA contains Safari", () => {
    stubUserAgent(CHROME_MAC);
    expect(isSafari()).toBe(false);
  });

  it("rejects Firefox on iOS (FxiOS)", () => {
    stubUserAgent(FIREFOX_IOS);
    expect(isSafari()).toBe(false);
  });

  it("rejects Chrome on iOS (CriOS)", () => {
    stubUserAgent(CHROME_IOS);
    expect(isSafari()).toBe(false);
  });

  it("rejects Edge", () => {
    stubUserAgent(EDGE_MAC);
    expect(isSafari()).toBe(false);
  });

  it("rejects desktop Firefox", () => {
    stubUserAgent(FIREFOX_MAC);
    expect(isSafari()).toBe(false);
  });
});

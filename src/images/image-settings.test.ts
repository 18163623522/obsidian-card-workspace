import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, migrateSettings, normalizeSettings } from "../settings";
import { serializeSettings } from "../services/SettingsStore";
import { resolveSettingsUpdateIntent } from "../view/update-intent";
describe("image preferences", () => {
  it("defaults legacy and invalid values to off/contain", () => {
    for (const data of [{}, { cardImageMode: "bad", cardImageFit: null }, { cardImageMode: true, cardImageFit: 123 }]) expect(normalizeSettings(data)).toMatchObject({ cardImageMode: "off", cardImageFit: "contain" });
  });
  it("round trips both fields in preferences at schema 2 and patches appearance only", () => {
    const settings = mergeSettings(DEFAULT_SETTINGS, { cardImageMode: "inline", cardImageFit: "cover" });
    const document = serializeSettings(settings); expect(document.schemaVersion).toBe(2);
    expect(document.preferences).toMatchObject({ cardImageMode: "inline", cardImageFit: "cover" });
    expect(migrateSettings(document)).toEqual(settings); expect(resolveSettingsUpdateIntent(DEFAULT_SETTINGS, settings)).toBe("patch");
  });
});

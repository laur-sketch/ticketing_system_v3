import { FAQ_SETTING_KEY, parseFaqCatalog, type FaqCatalog } from "@/lib/faq";
import { getPlatformSettingJson, setPlatformSettingJson } from "@/lib/platform-settings";

export async function loadFaqCatalog(): Promise<FaqCatalog> {
  const raw = await getPlatformSettingJson(FAQ_SETTING_KEY);
  return parseFaqCatalog(raw);
}

export async function saveFaqCatalog(catalog: FaqCatalog): Promise<FaqCatalog> {
  const next = parseFaqCatalog(catalog);
  await setPlatformSettingJson(FAQ_SETTING_KEY, next);
  return next;
}

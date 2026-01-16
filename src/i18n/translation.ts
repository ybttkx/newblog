import { siteConfig } from "../config";
import type I18nKey from "./i18nKey";

import { en } from "./languages/en";
import { es } from "./languages/es";
import { id } from "./languages/id";
import { ja } from "./languages/ja";
import { ko } from "./languages/ko";
import { th } from "./languages/th";
import { tr } from "./languages/tr";
import { vi } from "./languages/vi";
import { zh_CN } from "./languages/zh_CN";
import { zh_TW } from "./languages/zh_TW";

export type Translation = {
	[K in I18nKey]: string;
};

const defaultTranslation = en;

/**
 * 语言映射表
 * key 必须全部小写
 */
const map: { [key: string]: Translation } = {
	en: en,
	en_us: en,
	en_gb: en,
	en_au: en,

	zh_cn: zh_CN, // ✅ 简体中文
	zh_tw: zh_TW, // ✅ 繁体中文

	ja: ja,
	ja_jp: ja,

	ko: ko,
	ko_kr: ko,

	th: th,
	th_th: th,

	vi: vi,
	vi_vn: vi,

	id: id,

	tr: tr,
	tr_tr: tr,

	es: es,
};

export function getTranslation(lang: string): Translation {
	return map[lang.toLowerCase()] || defaultTranslation;
}

export function i18n(key: I18nKey): string {
	// ⚠️ 把 zh-CN 转成 zh_cn
	const lang = (siteConfig.lang || "en").replace("-", "_").toLowerCase();
	return getTranslation(lang)[key];
}

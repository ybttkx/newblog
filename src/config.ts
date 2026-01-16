import type {
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
} from "./types/config";

export const siteConfig: SiteConfig = {
	title: "毅白の博客",
	subtitle: "记录折腾、技术与成长",
	lang: "zh-CN",
	themeColor: {
		hue: 250,
		fixed: false,
	},
	banner: {
		enable: false,
		src: "assets/images/demo-banner.png",
		position: "center",
		credit: {
			enable: false,
			text: "",
			url: "",
		},
	},
	toc: {
		enable: true,
		depth: 2,
	},
	favicon: [
		{
			src: "/favicon.ico",
			sizes: "any",
		},
	],
};

export const navBarConfig: NavBarConfig = {
	links: [
		{ name: "首页", url: "/" },
		{ name: "归档", url: "/archive/" },
		{ name: "关于", url: "/about/" },
		{
			name: "GitHub",
			url: "https://github.com/ybttkx/newblog",
			external: true,
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: "/avatar.jpg", // ✅ 左侧头像
	name: "毅白",
	bio: "一个喜欢折腾技术与性能优化的学生。",
	links: [
		{
			name: "GitHub",
			icon: "fa6-brands:github",
			url: "https://github.com/ybttkx",
		},
	],
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	theme: "github-dark",
};

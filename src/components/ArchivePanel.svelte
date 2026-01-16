<script lang="ts">
import { onMount } from "svelte";

import I18nKey from "../i18n/i18nKey";
import { i18n } from "../i18n/translation";
import { getPostUrlBySlug } from "../utils/url-utils";

export let sortedPosts: Post[] = [];

interface Post {
	slug: string;
	data: {
		title: string;
		tags: string[];
		published: Date;
	};
}

interface Group {
	year: number;
	posts: Post[];
}

let groups: Group[] = [];

/* 只保留 tag 参数 */
const params = new URLSearchParams(window.location.search);
const tags = params.has("tag") ? params.getAll("tag") : [];

function formatDate(date: Date) {
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");
	return `${month}-${day}`;
}

function formatTag(tagList: string[]) {
	return tagList.map((t) => `#${t}`).join(" ");
}

onMount(() => {
	let filteredPosts: Post[] = sortedPosts;

	/* 标签筛选 */
	if (tags.length > 0) {
		filteredPosts = filteredPosts.filter(
			(post) =>
				Array.isArray(post.data.tags) &&
				post.data.tags.some((tag) => tags.includes(tag)),
		);
	}

	const grouped = filteredPosts.reduce(
		(acc, post) => {
			const year = post.data.published.getFullYear();
			if (!acc[year]) {
				acc[year] = [];
			}
			acc[year].push(post);
			return acc;
		},
		{} as Record<number, Post[]>,
	);

	const groupedPostsArray = Object.keys(grouped).map((yearStr) => ({
		year: Number.parseInt(yearStr, 10),
		posts: grouped[Number.parseInt(yearStr, 10)],
	}));

	groupedPostsArray.sort((a, b) => b.year - a.year);

	groups = groupedPostsArray;
});
</script>

<div class="card-base px-8 py-6">
	{#each groups as group}
		<div>
			<!-- 年份标题 -->
			<div class="flex flex-row w-full items-center h-[3.75rem]">
				<div class="w-[15%] md:w-[10%] text-2xl font-bold text-right text-75">
					{group.year}
				</div>
				<div class="w-[15%] md:w-[10%]">
					<div
						class="h-3 w-3 rounded-full outline outline-[var(--primary)] mx-auto
						-outline-offset-[2px] outline-3"
					></div>
				</div>
				<div class="w-[70%] md:w-[80%] text-left text-50">
					{group.posts.length}
					{i18n(group.posts.length === 1 ? I18nKey.postCount : I18nKey.postsCount)}
				</div>
			</div>

			<!-- 文章列表 -->
			{#each group.posts as post}
				<a
					href={getPostUrlBySlug(post.slug)}
					aria-label={post.data.title}
					class="group btn-plain !block h-10 w-full rounded-lg hover:text-[initial]"
				>
					<div class="flex flex-row items-center h-full">
						<!-- 日期 -->
						<div class="w-[15%] md:w-[10%] text-sm text-right text-50">
							{formatDate(post.data.published)}
						</div>

						<!-- 时间线点 -->
						<div class="w-[15%] md:w-[10%] relative dash-line h-full flex items-center">
							<div
								class="mx-auto w-1 h-1 rounded group-hover:h-5
								bg-[oklch(0.5_0.05_var(--hue))]
								group-hover:bg-[var(--primary)]
								outline outline-4
								outline-[var(--card-bg)]
								group-hover:outline-[var(--btn-plain-bg-hover)]"
							></div>
						</div>

						<!-- 标题 -->
						<div
							class="w-[55%] md:w-[55%] font-bold text-left
							group-hover:translate-x-1 transition-all
							group-hover:text-[var(--primary)]
							text-75 pr-4 whitespace-nowrap overflow-hidden text-ellipsis"
						>
							{post.data.title}
						</div>

						<!-- Tags（保留） -->
						<div
							class="hidden md:block md:w-[20%] text-left text-sm
							whitespace-nowrap overflow-hidden text-ellipsis text-30"
						>
							{formatTag(post.data.tags)}
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/each}
</div>

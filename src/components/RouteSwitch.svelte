<script lang="ts">
import Icon from "@iconify/svelte";

const routes = [
  {
    name: "主线路 (亚洲)",
    url: "https://ybovo.com",
  },
  {
    name: "全球线路 (Cloudflare)",
    url: "https://cf.ybovo.com",
  },
  {
    name: "国外线路 (EdgeOne)",
    url: "https://eo.ybovo.com",
  },
];

let isOpen = $state(false);
let latencies = $state<{ [key: string]: number | string }>({});
let fastestUrl = $state<string | null>(null);

function toggleDropdown() {
  isOpen = !isOpen;
}

function hidePanel() {
  isOpen = false;
}

function showPanel() {
  isOpen = true;
}

// Ping logic
async function pingUrl(url: string, timeout = 3000): Promise<{ ok: boolean; time: number }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    // 1. Connection warmup (TCP/TLS handshake)
    await fetch(`${url}/favicon.ico?warmup=${Date.now()}`, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    
    // 2. Pure RTT measurement
    const start = performance.now();
    await fetch(`${url}/favicon.ico?ts=${Date.now()}`, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    
    clearTimeout(id);
    return { ok: true, time: Math.max(1, Math.round(performance.now() - start)) };
  } catch (e) {
    clearTimeout(id);
    return { ok: false, time: timeout };
  }
}

async function runTests() {
  // Set initial status to testing
  const initialStatus: { [key: string]: string } = {};
  routes.forEach((r) => {
    initialStatus[r.url] = "测试中...";
  });
  latencies = initialStatus;

  const results = await Promise.all(
    routes.map(async (r) => {
      const res = await pingUrl(r.url).catch(() => ({ ok: false, time: 9999 }));
      return { url: r.url, ok: res.ok, time: res.ok ? res.time : Infinity };
    })
  );

  const newLatencies: { [key: string]: number | string } = {};
  let minTime = Infinity;
  let bestUrl: string | null = null;

  results.forEach((res) => {
    if (res.ok && res.time !== Infinity) {
      newLatencies[res.url] = res.time;
      if (res.time < minTime) {
        minTime = res.time;
        bestUrl = res.url;
      }
    } else {
      newLatencies[res.url] = "超时";
    }
  });

  latencies = newLatencies;
  fastestUrl = bestUrl;
}

$effect(() => {
  if (isOpen) {
    runTests();
  }
});
</script>

<div class="relative z-50" role="menu" tabindex="-1" onmouseleave={hidePanel}>
  <button 
    aria-label="Change Route" 
    class="relative btn-plain scale-animation rounded-lg h-11 w-11 active:scale-90" 
    onclick={toggleDropdown} 
    onmouseenter={showPanel}
  >
    <Icon icon="material-symbols:wifi-outline" class="text-[1.25rem]"></Icon>
  </button>

  {#if isOpen}
    <div id="route-panel" class="absolute transition top-11 -right-2 pt-5">
      <div class="card-base float-panel p-3 w-60 flex flex-col gap-1.5 shadow-2xl">
        <div class="text-[10px] font-semibold px-2 py-0.5 text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          📡 线路切换 / 测速
        </div>
        
        {#each routes as route}
          {@const latency = latencies[route.url]}
          {@const isFastest = fastestUrl === route.url}
          {@const isTesting = latency === "测试中..."}
          {@const isTimeout = latency === "超时"}
          <a
            href={route.url}
            class="flex flex-col p-2 rounded-xl border border-transparent transition-all duration-200 text-left hover:bg-black/5 dark:hover:bg-white/5 {isFastest ? 'bg-[oklch(95%_0.05_var(--hue))] dark:bg-[oklch(30%_0.05_var(--hue))] border-[oklch(80%_0.1_var(--hue))] dark:border-[oklch(40%_0.1_var(--hue))]' : ''}"
          >
            <span class="text-xs font-semibold {isFastest ? 'text-[var(--primary)]' : 'text-gray-800 dark:text-gray-200'}">
              {route.name}
            </span>
            <div class="flex items-center justify-between mt-1">
              <span class="text-[9px] text-gray-400 dark:text-gray-500 font-mono">
                {route.url.replace("https://", "")}
              </span>
              <span class="text-[10px] font-mono {isTesting ? 'text-gray-400' : isTimeout ? 'text-red-500' : isFastest ? 'text-[var(--primary)] font-bold' : 'text-gray-500'}">
                {typeof latency === 'number' ? `${latency}ms` : (latency || '—')}
              </span>
            </div>
          </a>
        {/each}
      </div>
    </div>
  {/if}
</div>

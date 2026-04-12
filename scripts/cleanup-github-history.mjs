#!/usr/bin/env node
/**
 * 删除本仓库中除「最新一条」以外的 GitHub Actions 运行记录与 Deployments。
 * 需在本地设置令牌（任选其一）：
 *   export GH_TOKEN=ghp_xxx
 *   export GITHUB_TOKEN=ghp_xxx
 *
 * 经典 PAT 建议勾选：repo（完整仓库权限）或至少含删除 workflow runs / deployments 所需权限。
 * 细粒度 PAT：Actions 写入、Deployments 写入（或 Administration 视账户而定）。
 *
 * 可选：DRY_RUN=1 只打印将要删除的 id，不请求 DELETE。
 * 可选：CLEANUP_DELAY_MS=5000 在 gh-pages 推送后稍等再拉列表（新 run 可能晚几秒才出现）。
 * 可选：CLEANUP_DEPLOYMENT_ENV=github-pages 只在该环境下「只保留最新一条」，其它环境的 Deployment 不碰。
 */

import { execSync } from "node:child_process";

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const delayMs = Number(process.env.CLEANUP_DELAY_MS || "0") || 0;
const deploymentEnvFilter = process.env.CLEANUP_DEPLOYMENT_ENV?.trim() || "";

const API = "https://api.github.com";

function parseRemote() {
  try {
    const url = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
    const ssh = url.match(/^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/i);
    if (ssh) return { owner: ssh[1], repo: ssh[2] };
    const https = url.match(/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?(?:\/|$)/i);
    if (https) return { owner: https[1], repo: https[2] };
  } catch {
    /* ignore */
  }
  return null;
}

function headers() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "piano-cleanup-github-history"
  };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function ghFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers(), ...opts.headers } });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const msg = typeof json === "object" && json?.message ? json.message : text.slice(0, 200);
    const err = new Error(`${res.status} ${path}: ${msg}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function fetchAllPages(pathBuilder) {
  const out = [];
  for (let page = 1; page <= 50; page += 1) {
    const data = await ghFetch(pathBuilder(page));
    const key = Array.isArray(data) ? null : data.workflow_runs ? "workflow_runs" : data.length !== undefined ? null : "unknown";
    const chunk =
      key === "workflow_runs"
        ? data.workflow_runs
        : Array.isArray(data)
          ? data
          : [];
    if (!chunk.length) break;
    out.push(...chunk);
    if (chunk.length < 100) break;
  }
  return out;
}

function byCreatedDesc(a, b) {
  const ta = new Date(a.created_at || a.run_started_at || 0).getTime();
  const tb = new Date(b.created_at || b.run_started_at || 0).getTime();
  return tb - ta;
}

async function deleteWorkflowRuns(owner, repo, runs) {
  if (runs.length <= 1) {
    console.log(`[actions] 共 ${runs.length} 条运行记录，无需删除。`);
    return;
  }
  const sorted = [...runs].sort(byCreatedDesc);
  const [, ...rest] = sorted;
  console.log(`[actions] 保留最新 run #${sorted[0].id}，将删除 ${rest.length} 条。`);
  for (const run of rest) {
    const p = `/repos/${owner}/${repo}/actions/runs/${run.id}`;
    if (dryRun) {
      console.log(`  DRY_RUN 将删除 run ${run.id} (${run.name || run.display_title || "workflow"})`);
      continue;
    }
    await ghFetch(p, { method: "DELETE" });
    await sleep(120);
  }
}

async function setDeploymentInactive(owner, repo, deploymentId) {
  await ghFetch(`/repos/${owner}/${repo}/deployments/${deploymentId}/statuses`, {
    method: "POST",
    body: JSON.stringify({ state: "inactive" })
  });
}

async function deleteDeployments(owner, repo, deployments) {
  if (deployments.length <= 1) {
    console.log(`[deployments] 共 ${deployments.length} 条，无需删除。`);
    return;
  }
  const sorted = [...deployments].sort(byCreatedDesc);
  const [, ...rest] = sorted;
  console.log(`[deployments] 保留最新 #${sorted[0].id}，将删除 ${rest.length} 条。`);
  for (const d of rest) {
    if (dryRun) {
      console.log(`  DRY_RUN 将删除 deployment ${d.id} (${d.environment || "env"})`);
      continue;
    }
    try {
      await ghFetch(`/repos/${owner}/${repo}/deployments/${d.id}`, { method: "DELETE" });
    } catch (e) {
      if (e.status === 422) {
        try {
          await setDeploymentInactive(owner, repo, d.id);
          await sleep(200);
          await ghFetch(`/repos/${owner}/${repo}/deployments/${d.id}`, { method: "DELETE" });
        } catch (e2) {
          console.warn(`  deployment ${d.id} 删除失败:`, e2.message || e2);
        }
      } else {
        console.warn(`  deployment ${d.id} 删除失败:`, e.message || e);
      }
    }
    await sleep(120);
  }
}

async function main() {
  if (!token) {
    console.warn(
      "[cleanup-github-history] 未设置 GH_TOKEN / GITHUB_TOKEN，已跳过清理（部署仍成功）。\n" +
        "若需在每次 deploy 后自动清理，请创建 PAT 并 export GH_TOKEN=..."
    );
    process.exit(0);
  }

  const parsed = parseRemote();
  if (!parsed) {
    console.warn("[cleanup-github-history] 无法从 git remote 解析 owner/repo，已跳过。");
    process.exit(0);
  }

  const { owner, repo } = parsed;
  console.log(`[cleanup-github-history] 仓库 ${owner}/${repo}${dryRun ? "（DRY_RUN）" : ""}`);

  if (delayMs > 0) {
    console.log(`[cleanup-github-history] 等待 ${delayMs}ms 后再拉取列表…`);
    await sleep(delayMs);
  }

  try {
    const runs = await fetchAllPages(
      (page) => `/repos/${owner}/${repo}/actions/runs?per_page=100&page=${page}`
    );
    await deleteWorkflowRuns(owner, repo, runs);
  } catch (e) {
    console.warn("[actions] 清理失败:", e.message || e);
    if (e.status === 401 || e.status === 403) {
      console.warn("  请确认令牌含删除 Actions 运行记录的权限（如 repo 或 Actions: Write）。");
    }
  }

  try {
    let deployments = await fetchAllPages(
      (page) => `/repos/${owner}/${repo}/deployments?per_page=100&page=${page}`
    );
    if (deploymentEnvFilter) {
      deployments = deployments.filter((d) => d.environment === deploymentEnvFilter);
      console.log(`[deployments] 已按 environment=${deploymentEnvFilter} 筛选，共 ${deployments.length} 条`);
    }
    await deleteDeployments(owner, repo, deployments);
  } catch (e) {
    console.warn("[deployments] 清理失败:", e.message || e);
    if (e.status === 401 || e.status === 403) {
      console.warn("  请确认令牌含删除 Deployments 的权限（如 repo 或 Deployments: Write）。");
    }
  }

  console.log("[cleanup-github-history] 完成。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

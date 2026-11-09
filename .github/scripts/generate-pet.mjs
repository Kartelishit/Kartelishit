
// Builds code-pet.svg from your REAL GitHub data. Run by the workflow, no deps (Node 20+).
import fs from "node:fs";

const login = process.env.GH_USER || "Kartelishit";
const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;

const Q = `query($login:String!){ user(login:$login){
  contributionsCollection{ totalCommitContributions totalPullRequestContributions
    contributionCalendar{ totalContributions weeks{ contributionDays{ date weekday contributionCount } } } }
  openPRs: pullRequests(states:OPEN){ totalCount }
  repositories(first:100, ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC){ totalCount
    nodes{ stargazerCount languages(first:5, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name } } } } } } }`;

function mock() { // only for local testing: MOCK=1
  const weeks = [];
  for (let w = 0; w < 53; w++) weeks.push({ contributionDays: Array.from({ length: 7 }, (_, d) => ({
    date: new Date(Date.UTC(2026, 0, 1) + (w * 7 + d) * 864e5).toISOString().slice(0, 10), weekday: d,
    contributionCount: (w * 7 + d) % 9 < 3 ? 0 : ((w * 31 + d * 17) % 12) })) });
  return { contributionsCollection: { totalCommitContributions: 640, totalPullRequestContributions: 41,
    contributionCalendar: { totalContributions: 900, weeks } }, openPRs: { totalCount: 3 },
    repositories: { totalCount: 18, nodes: [{ stargazerCount: 12, languages: { edges: [
      { size: 500, node: { name: "TypeScript" } }, { size: 300, node: { name: "CSS" } }, { size: 200, node: { name: "Python" } }] } }] } };
}

async function load() {
  if (process.env.MOCK) return mock();
  const r = await fetch("https://api.github.com/graphql", { method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: Q, variables: { login } }) });
  const j = await r.json();
  if (!j.data?.user) throw new Error(JSON.stringify(j.errors || j));
  return j.data.user;
}

const u = await load();
const cc = u.contributionsCollection, cal = cc.contributionCalendar;
const days = cal.weeks.flatMap(w => w.contributionDays).sort((a, b) => a.date.localeCompare(b.date));
const n = x => x.toLocaleString("en-US");

// streaks
let streak = 0, i = days.length - 1;
if (days[i].contributionCount === 0) i--;
while (i >= 0 && days[i].contributionCount > 0) { streak++; i--; }
let best = 0, run = 0;
for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; best = Math.max(best, run); }

const last7 = days.slice(-7);
const week7 = last7.reduce((a, d) => a + d.contributionCount, 0);
const active7 = last7.filter(d => d.contributionCount > 0).length;
const fedToday = days.at(-1).contributionCount > 0;
const xp = cal.totalContributions, level = Math.floor(xp / 400) + 1, into = xp % 400;
const top = days.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), days[0]);
const topLabel = new Date(top.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const avg = (xp / days.length).toFixed(1);
const sleepy = streak === 0;

// pet stats from real activity
const stats = [
  ["Mood", sleepy ? 20 : Math.min(100, 35 + streak * 6), "#3ddc97"],
  ["Food", Math.min(100, Math.round(week7 / 15 * 100)), "#ffb454"],
  ["Energy", Math.round(active7 / 7 * 100), "#58a6ff"],
  ["Growth", Math.min(100, Math.round(xp / 2000 * 100)), "#ff7b72"],
];

// languages + stars
const repos = u.repositories.nodes;
const stars = repos.reduce((a, r) => a + r.stargazerCount, 0);
const L = {};
for (const r of repos) for (const e of r.languages.edges) L[e.node.name] = (L[e.node.name] || 0) + e.size;
const tot = Object.values(L).reduce((a, b) => a + b, 0) || 1;
const sorted = Object.entries(L).sort((a, b) => b[1] - a[1]);
const pal = ["#58a6ff", "#ffb454", "#ff7b72", "#3ddc97"];
let langs = sorted.slice(0, 4).map(([name, v], k) => [name, Math.round(v / tot * 100), pal[k]]);
const rest = 100 - langs.reduce((a, l) => a + l[1], 0);
if (rest > 0) langs.push(["Other", rest, "#8b949e"]);
if (!langs.length) langs = [["No code yet", 100, "#8b949e"]];

// ---- svg parts ----
const cols = ["#1b252c", "#14533f", "#1f8a62", "#3ddc97", "#a6f7d4"];
const grid = cal.weeks.slice(-40);
const max = Math.max(1, ...grid.flatMap(w => w.contributionDays.map(d => d.contributionCount)));
const heat = grid.map((w, x) => w.contributionDays.map(d => {
  const r = d.contributionCount / max, l = d.contributionCount === 0 ? 0 : r < .25 ? 1 : r < .5 ? 2 : r < .75 ? 3 : 4;
  return `<rect x="${40 + x * 12}" y="${370 + d.weekday * 12}" width="9" height="9" rx="2.5" fill="${cols[l]}" class="cell" style="animation-delay:${(x * .04).toFixed(2)}s"/>`;
}).join("")).join("\n");

const bars = stats.map(([name, p, c], k) => { const y = 122 + k * 32; return `
<text x="346" y="${y + 4}" class="mono lbl">${name}</text>
<rect x="410" y="${y - 5}" width="126" height="10" rx="5" fill="#0d1117"/>
<rect x="410" y="${y - 5}" width="${(126 * p / 100).toFixed(1)}" height="10" rx="5" fill="${c}" class="fill fb" style="animation-delay:${(k * .15).toFixed(2)}s"/>
<text x="590" y="${y + 4}" class="mono val" text-anchor="end">${p}%</text>`; }).join("");

const tiles = [
  [622, 60, "#3ddc97", "Commits", n(cc.totalCommitContributions), `+${week7} this week`],
  [759, 60, "#ffb454", "Streak", `${streak}d`, `best: ${best} days`],
  [622, 196, "#58a6ff", "Pull requests", n(cc.totalPullRequestContributions), `${u.openPRs.totalCount} open`],
  [759, 196, "#ff7b72", "Repositories", n(u.repositories.totalCount), `${n(stars)} stars`],
].map(([x, y, c, l, v, d]) => `
<rect x="${x}" y="${y}" width="121" height="120" rx="14" fill="#161b22" stroke="#30363d"/>
<rect x="${x + 16}" y="${y + 18}" width="8" height="8" rx="2.5" fill="${c}"/>
<text x="${x + 32}" y="${y + 26}" class="mono lbl">${l}</text>
<text x="${x + 16}" y="${y + 70}" class="mono big">${v}</text>
<text x="${x + 16}" y="${y + 98}" class="mono sub" fill="${c}">${d}</text>`).join("");

let lx = 642, langSvg = "";
for (const [, p, c] of langs) { const w = 216 * p / 100; langSvg += `<rect x="${lx.toFixed(1)}" y="372" width="${Math.max(w - 2, 2).toFixed(1)}" height="10" rx="3" fill="${c}"/>`; lx += w; }
langs.forEach(([name, p, c], k) => { const x = k < 3 ? 642 : 760, y = 404 + (k % 3) * 18;
  langSvg += `<circle cx="${x + 4}" cy="${y - 4}" r="4" fill="${c}"/><text x="${x + 14}" y="${y}" class="mono sub2">${name} ${p}%</text>`; });

const eyes = sleepy
  ? `<path d="M146 152Q152 159 158 152M182 152Q188 159 194 152" fill="none" stroke="#3ddc97" stroke-width="3" stroke-linecap="round"/>`
  : `<g class="blink fb"><ellipse cx="152" cy="152" rx="6" ry="8" fill="#3ddc97"/><ellipse cx="188" cy="152" rx="6" ry="8" fill="#3ddc97"/><circle cx="154" cy="149" r="2" fill="#e8fff5"/><circle cx="190" cy="149" r="2" fill="#e8fff5"/></g>`;
const float1 = sleepy ? ["zzz", "#ffb454"] : ["+1 commit", "#3ddc97"];
const float2 = sleepy ? ["feed me", "#ff7b72"] : [`+${Math.max(week7, 1)} this week`, "#ffb454"];
const mood = sleepy ? "sleepy · feed me commits" : streak >= 7 ? `ecstatic · ${streak}d streak` : fedToday ? "happy · fed today" : "hungry · commit soon";
const evo = level < 5 ? `next evolution: Bitbot at Lv ${5}` : "final form: Bitbot";
const cx = 86 + (login.length + 2) * 7.2, cmd = cx + 14;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="482" viewBox="0 0 900 482" role="img" aria-label="${login}'s code pet dashboard">
<defs>
<linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6f7d4"/><stop offset=".5" stop-color="#3ddc97"/><stop offset="1" stop-color="#25a374"/></linearGradient>
<linearGradient id="platTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#243642"/><stop offset="1" stop-color="#1a2630"/></linearGradient>
<radialGradient id="glowG" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#3ddc97" stop-opacity=".22"/><stop offset="1" stop-color="#3ddc97" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#ffffff" stroke-opacity=".04"/></pattern>
<clipPath id="stageClip"><rect x="20" y="60" width="290" height="256" rx="14"/></clipPath>
</defs>
<style>
.mono{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace}
.ttl{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;font-weight:700;fill:#e6edf3}
.lbl{font-size:11px;fill:#8b949e}.val{font-size:11px;fill:#e6edf3;font-weight:700}.big{font-size:30px;fill:#e6edf3;font-weight:700}.sub{font-size:11px}.sub2{font-size:11px;fill:#c9d1d9}
.fb{transform-box:fill-box}
.hop{animation:hop 2.4s cubic-bezier(.35,0,.3,1) infinite}
.squash{transform-origin:50% 100%;animation:squash 2.4s ease-in-out infinite}
.shadow{transform-origin:50% 50%;animation:shadow 2.4s ease-in-out infinite}
.blink{transform-origin:50% 50%;animation:blink 4.5s infinite}
.ant{transform-origin:50% 100%;animation:ant 2.4s ease-in-out infinite}
.float{opacity:0;animation:float 5s ease-out infinite}.f2{animation-delay:2.5s}
.fill{transform-origin:0 50%;animation:grow 1.3s cubic-bezier(.2,.8,.2,1) both}
.cell{opacity:0;animation:pop .5s ease-out forwards}
.cur{animation:cur 1s steps(1) infinite}.live{animation:live 2s ease-in-out infinite}
@keyframes hop{0%,100%{transform:translateY(0)}38%,58%{transform:translateY(-30px)}85%{transform:translateY(0)}}
@keyframes squash{0%,100%{transform:scale(1.05,.94)}25%{transform:scale(.97,1.04)}50%{transform:scale(.98,1.03)}85%{transform:scale(1.07,.92)}}
@keyframes shadow{0%,100%{transform:scale(1);opacity:.5}48%{transform:scale(.7);opacity:.25}}
@keyframes blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
@keyframes ant{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes float{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-46px);opacity:0}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
@keyframes cur{0%,50%{opacity:1}50.1%,100%{opacity:0}}
@keyframes live{0%,100%{opacity:1}50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.cell,.float{opacity:1}}
</style>
<rect x=".5" y=".5" width="899" height="481" rx="18" fill="#0d1117" stroke="#30363d"/>
<path d="M1 44H899" stroke="#30363d"/>
<circle cx="24" cy="22" r="5" fill="#ff7b72"/><circle cx="43" cy="22" r="5" fill="#ffb454"/><circle cx="62" cy="22" r="5" fill="#3ddc97"/>
<text x="86" y="26" class="mono" font-size="12" fill="#8b949e">~/${login.toLowerCase()}</text>
<text x="${cmd.toFixed(0)}" y="26" class="mono" font-size="12" fill="#3ddc97">$ byte --status</text>
<rect x="${(cmd + 15 * 7.2 + 4).toFixed(0)}" y="16" width="7" height="13" fill="#3ddc97" class="cur"/>
<circle cx="862" cy="22" r="4" fill="#3ddc97" class="live"/>
<text x="852" y="26" class="mono" font-size="11" fill="#8b949e" text-anchor="end">live data</text>

<rect x="20" y="60" width="290" height="256" rx="14" fill="#161b22" stroke="#30363d"/>
<g clip-path="url(#stageClip)"><rect x="20" y="60" width="290" height="256" fill="url(#grid)"/><circle cx="165" cy="190" r="120" fill="url(#glowG)"/></g>
<text x="40" y="88" class="ttl">Byte</text>
<text x="40" y="106" class="mono lbl">${mood}</text>
<rect x="254" y="74" width="40" height="20" rx="10" fill="none" stroke="#3ddc97"/>
<text x="274" y="88" class="mono" font-size="11" fill="#3ddc97" text-anchor="middle">Lv ${level}</text>
<path d="M55 252L165 296L275 252V264L165 308L55 264Z" fill="#10171d"/>
<path d="M165 208L275 252L165 296L55 252Z" fill="url(#platTop)" stroke="#3ddc97" stroke-opacity=".5"/>
<path d="M110 230L220 274M165 208L165 296M220 230L110 274" stroke="#3ddc97" stroke-opacity=".12"/>
<ellipse cx="172" cy="248" rx="46" ry="10" fill="#000" class="shadow fb"/>
<g class="hop"><g class="squash fb">
<rect x="138" y="212" width="26" height="20" rx="8" fill="#1b7a58"/><rect x="178" y="212" width="26" height="20" rx="8" fill="#1b7a58"/>
<rect x="106" y="146" width="14" height="28" rx="6" fill="#25a374"/><rect x="228" y="156" width="14" height="28" rx="6" fill="#1b7a58"/>
<rect x="131" y="128" width="100" height="95" rx="30" fill="#1b7a58"/>
<rect x="120" y="118" width="100" height="95" rx="30" fill="url(#bodyG)"/>
<ellipse cx="141" cy="130" rx="17" ry="6" fill="#fff" opacity=".4" transform="rotate(-22 141 130)"/>
<rect x="132" y="132" width="76" height="52" rx="17" fill="#09130f" stroke="#0f3a2b" stroke-width="2"/>
${eyes}
<ellipse cx="141" cy="167" rx="6" ry="3.5" fill="#ff7b72" opacity=".6"/><ellipse cx="199" cy="167" rx="6" ry="3.5" fill="#ff7b72" opacity=".6"/>
<path d="M163 168Q170 ${sleepy ? 170 : 175} 177 168" fill="none" stroke="#3ddc97" stroke-width="2.5" stroke-linecap="round"/>
<g class="ant fb"><path d="M170 118V98" stroke="#25a374" stroke-width="4" stroke-linecap="round"/><circle cx="170" cy="92" r="7" fill="#ffb454"/><circle cx="168" cy="90" r="2.2" fill="#fff" opacity=".7"/></g>
</g></g>
<text x="236" y="150" class="mono float fb" font-size="11" fill="${float1[1]}">${float1[0]}</text>
<text x="46" y="176" class="mono float f2 fb" font-size="11" fill="${float2[1]}">${float2[0]}</text>

<rect x="326" y="60" width="280" height="256" rx="14" fill="#161b22" stroke="#30363d"/>
<text x="346" y="88" class="ttl">Status</text>
<text x="590" y="88" class="mono lbl" text-anchor="end">fed by real commits</text>
${bars}
<path d="M346 244H590" stroke="#30363d"/>
<text x="346" y="266" class="mono val">Level ${level}</text>
<text x="590" y="266" class="mono lbl" text-anchor="end">${into} / 400 xp</text>
<rect x="346" y="276" width="244" height="8" rx="4" fill="#0d1117"/>
<rect x="346" y="276" width="${(244 * into / 400).toFixed(1)}" height="8" rx="4" fill="#3ddc97" class="fill fb" style="animation-delay:.6s"/>
<text x="346" y="304" class="mono lbl">${evo}</text>
${tiles}

<rect x="20" y="332" width="586" height="130" rx="14" fill="#161b22" stroke="#30363d"/>
<text x="40" y="356" class="ttl">Contributions · ${n(xp)} this year</text>
<text x="586" y="356" class="mono lbl" text-anchor="end">last 40 weeks</text>
${heat}
<text x="586" y="396" class="mono lbl" text-anchor="end">best day</text>
<text x="586" y="414" class="mono val" text-anchor="end">${topLabel} · ${top.contributionCount}</text>
<text x="586" y="436" class="mono lbl" text-anchor="end">daily avg</text>
<text x="586" y="454" class="mono val" text-anchor="end">${avg}</text>

<rect x="622" y="332" width="258" height="130" rx="14" fill="#161b22" stroke="#30363d"/>
<text x="642" y="356" class="ttl">Top languages</text>
${langSvg}
</svg>
`;
fs.writeFileSync("code-pet.svg", svg);
console.log(`wrote code-pet.svg for ${login}: ${xp} contributions, ${streak}d streak`);

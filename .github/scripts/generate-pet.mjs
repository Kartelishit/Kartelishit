
// BYTE 2.1 — GitHub Coding Pet
// Node.js 20+, no external dependencies.
// Generates code-pet.svg using live GitHub GraphQL data.

import fs from 'node:fs';

const login = process.env.GH_USER || 'Kartelishit';
const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;

const QUERY = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      totalCommitContributions
      totalPullRequestContributions
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date weekday contributionCount } }
      }
    }
    openPRs: pullRequests(first:1, states:OPEN){ totalCount }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC){
      totalCount
      nodes{
        stargazerCount
        languages(first:5, orderBy:{field:SIZE,direction:DESC}){
          edges{ size node{ name } }
        }
      }
    }
  }
}`;

function mockData() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 370 * 864e5);
  const startDay = new Date(start);
  startDay.setUTCDate(startDay.getUTCDate() - startDay.getUTCDay());
  const weeks = [];

  for (let w = 0; w < 53; w++) {
    const contributionDays = [];

    for (let d = 0; d < 7; d++) {
      const date = new Date(startDay.getTime() + (w * 7 + d) * 864e5);
      const day = Math.floor(date.getTime() / 864e5);
      const count = date > end ? 0 : (day % 11 < 3 ? 0 : ((day * 7 + d * 13) % 15));

      contributionDays.push({
        date: date.toISOString().slice(0, 10),
        weekday: d,
        contributionCount: count,
      });
    }

    weeks.push({ contributionDays });
  }

  return {
    contributionsCollection: {
      totalCommitContributions: 684,
      totalPullRequestContributions: 47,
      contributionCalendar: {
        totalContributions: 1038,
        weeks,
      },
    },
    openPRs: { totalCount: 3 },
    repositories: {
      totalCount: 18,
      nodes: [
        {
          stargazerCount: 13,
          languages: {
            edges: [
              { size: 8800, node: { name: 'TypeScript' } },
              { size: 5200, node: { name: 'JavaScript' } },
              { size: 3100, node: { name: 'Python' } },
              { size: 1900, node: { name: 'CSS' } },
            ],
          },
        },
        {
          stargazerCount: 7,
          languages: {
            edges: [
              { size: 2600, node: { name: 'TypeScript' } },
              { size: 1700, node: { name: 'HTML' } },
              { size: 900, node: { name: 'CSS' } },
            ],
          },
        },
      ],
    },
  };
}

async function loadGitHubData() {
  if (process.env.MOCK === '1') return mockData();

  if (!token) {
    throw new Error('Missing GitHub token. Set GITHUB_TOKEN or GH_PAT.');
  }

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Byte-Code-Pet',
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { login },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API returned ${response.status}: ${body.slice(0, 500)}`
    );
  }

  const result = await response.json();

  if (result.errors?.length || !result.data?.user) {
    throw new Error(
      `GitHub GraphQL error: ${JSON.stringify(result.errors || result)}`
    );
  }

  return result.data.user;
}

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[ch]));

const fmt = (value) =>
  Number(value || 0).toLocaleString('en-US');

const clamp = (value, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

const shortDate = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

const user = await loadGitHubData();

const contributions = user.contributionsCollection;
const calendar = contributions.contributionCalendar;
const today = new Date().toISOString().slice(0, 10);

const days = calendar.weeks
  .flatMap((week) => week.contributionDays)
  .filter((day) => day.date <= today)
  .sort((a, b) => a.date.localeCompare(b.date));

if (!days.length) {
  throw new Error('GitHub returned an empty contribution calendar.');
}

// Current streak.
let cursor = days.length - 1;

if (
  days[cursor].contributionCount === 0 &&
  days[cursor].date === today
) {
  cursor--;
}

let streak = 0;

while (cursor >= 0 && days[cursor].contributionCount > 0) {
  streak++;
  cursor--;
}

// Best streak.
let bestStreak = 0;
let runningStreak = 0;

for (const day of days) {
  runningStreak = day.contributionCount > 0
    ? runningStreak + 1
    : 0;

  bestStreak = Math.max(bestStreak, runningStreak);
}

const last7 = days.slice(-7);

const weekTotal = last7.reduce(
  (sum, day) => sum + day.contributionCount,
  0
);

const activeDays = last7.filter(
  (day) => day.contributionCount > 0
).length;

const latestDay = days.at(-1);
const xp = calendar.totalContributions;

const level = Math.floor(xp / 400) + 1;
const xpIntoLevel = xp % 400;
const levelProgress = Math.round((xpIntoLevel / 400) * 100);

const bestDay = days.reduce(
  (best, day) =>
    day.contributionCount > best.contributionCount ? day : best,
  days[0]
);

const dailyAverage = (xp / days.length).toFixed(1);
const sleepy = streak === 0;

// Repository statistics.
const repoNodes = user.repositories.nodes || [];
const repoCount = user.repositories.totalCount || 0;

const stars = repoNodes.reduce(
  (sum, repo) => sum + (repo.stargazerCount || 0),
  0
);

// Programming languages.
const languageBytes = {};

for (const repo of repoNodes) {
  for (const edge of repo.languages.edges || []) {
    const name = edge.node?.name;

    if (name) {
      languageBytes[name] = (languageBytes[name] || 0) + edge.size;
    }
  }
}

const languageTotal = Object.values(languageBytes).reduce(
  (sum, value) => sum + value,
  0
);

const languagePalette = [
  '#8B7CFF',
  '#41D9CF',
  '#FFB86B',
  '#FF78A8',
  '#74A7FF',
];

let languages = Object.entries(languageBytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 4)
  .map(([name, bytes], index) => ({
    name,
    percent: languageTotal
      ? Math.round((bytes / languageTotal) * 100)
      : 0,
    color: languagePalette[index],
  }));

const shownPercent = languages.reduce(
  (sum, language) => sum + language.percent,
  0
);

if (languages.length && shownPercent < 100) {
  languages.push({
    name: 'Other',
    percent: 100 - shownPercent,
    color: '#59647B',
  });
}

if (!languages.length) {
  languages = [{
    name: 'No language data yet',
    percent: 100,
    color: '#59647B',
  }];
}

// Pet vitals.
const stats = [
  {
    label: 'Mood',
    value: sleepy ? 24 : clamp(45 + streak * 5),
    color: '#41D9CF',
    note: sleepy ? 'waiting for a commit' : streak >= 7 ? 'on a lovely streak' : 'feeling good',
  },
  {
    label: 'Snack meter',
    value: clamp(Math.round((weekTotal / 18) * 100)),
    color: '#FFB86B',
    note: `${fmt(weekTotal)} commits this week`,
  },
  {
    label: 'Energy',
    value: Math.round((activeDays / 7) * 100),
    color: '#8B7CFF',
    note: `${activeDays} active days · last 7`,
  },
  {
    label: 'Growth',
    value: clamp(Math.round((xp / 2200) * 100)),
    color: '#FF78A8',
    note: `${fmt(xp)} contribution XP`,
  },
];

const activityStatus = sleepy
  ? 'Taking a tiny recharge break'
  : streak >= 7
    ? `${streak}-day streak. Byte is glowing.`
    : latestDay.contributionCount > 0
      ? 'A fresh commit made Byte smile'
      : 'Ready when your next idea is';

const statusColor = sleepy ? '#FFB86B' : '#41D9CF';
const moodLine = sleepy
  ? 'Byte is in sleep mode'
  : 'Byte is awake and growing';

// Contribution heatmap.
const weeks = calendar.weeks.slice(-40);

const heatColors = [
  '#20283A',
  '#263B58',
  '#315B83',
  '#367FA0',
  '#41D9CF',
];

const maxContribution = Math.max(
  1,
  ...weeks.flatMap((week) =>
    week.contributionDays.map((day) => day.contributionCount)
  )
);

const heatCells = weeks.map((week, weekIndex) =>
  week.contributionDays.map((day) => {
    const ratio = day.contributionCount / maxContribution;

    const levelIndex = day.contributionCount === 0
      ? 0
      : ratio < 0.25
        ? 1
        : ratio < 0.5
          ? 2
          : ratio < 0.75
            ? 3
            : 4;

    const x = 52 + weekIndex * 12.1;
    const y = 548 + day.weekday * 13.2;

    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="8.8" height="9.4" rx="2.8" fill="${heatColors[levelIndex]}" class="heat-cell" style="animation-delay:${(weekIndex * 0.012 + day.weekday * 0.018).toFixed(3)}s"><title>${esc(day.date)}: ${day.contributionCount} contributions</title></rect>`;
  }).join('')
).join('\n');

// Pet status bars.
const statBars = stats.map((stat, index) => {
  const y = 165 + index * 39;

  return `
    <text x="705" y="${y}" class="micro-label">${esc(stat.label.toUpperCase())}</text>
    <text x="944" y="${y}" class="micro-value" text-anchor="end">${stat.value}%</text>
    <rect x="705" y="${y + 9}" width="239" height="7" rx="3.5" fill="#182236"/>
    <rect x="705" y="${y + 9}" width="${(239 * stat.value / 100).toFixed(1)}" height="7" rx="3.5" fill="${stat.color}" class="progress-fill" style="animation-delay:${(index * 0.13).toFixed(2)}s"/>
    <text x="705" y="${y + 29}" class="tiny-muted">${esc(stat.note)}</text>`;
}).join('');

// Main statistic cards.
const metricCards = [
  {
    x: 24,
    accent: '#41D9CF',
    icon: '↗',
    label: 'COMMITS',
    value: fmt(contributions.totalCommitContributions),
    foot: `${fmt(weekTotal)} in the last 7 days`,
  },
  {
    x: 267,
    accent: '#8B7CFF',
    icon: '⌘',
    label: 'PULL REQUESTS',
    value: fmt(contributions.totalPullRequestContributions),
    foot: `${fmt(user.openPRs.totalCount)} currently open`,
  },
  {
    x: 510,
    accent: '#FFB86B',
    icon: '✦',
    label: 'CURRENT STREAK',
    value: `${streak} days`,
    foot: `Personal best: ${bestStreak} days`,
  },
  {
    x: 753,
    accent: '#FF78A8',
    icon: '◈',
    label: 'REPOSITORIES',
    value: fmt(repoCount),
    foot: `${fmt(stars)} public stars`,
  },
];

const metricSvg = metricCards.map((card) => `
  <g>
    <rect x="${card.x}" y="370" width="223" height="96" rx="18" class="surface"/>
    <rect x="${card.x + 17}" y="387" width="29" height="29" rx="9" fill="${card.accent}" fill-opacity=".13"/>
    <text x="${card.x + 31.5}" y="407" text-anchor="middle" font-size="15" font-weight="700" fill="${card.accent}">${card.icon}</text>
    <text x="${card.x + 56}" y="405" class="metric-label">${card.label}</text>
    <text x="${card.x + 17}" y="443" class="metric-value">${card.value}</text>
    <text x="${card.x + 206}" y="443" text-anchor="end" class="metric-foot">${esc(card.foot)}</text>
  </g>`).join('');

// Language labels.
let languageBars = '';

languages.forEach((language, index) => {
  const column = index < 3 ? 0 : 1;
  const row = index < 3 ? index : index - 3;
  const x = column === 0 ? 714 : 836;
  const y = 588 + row * 22;

  languageBars += `
    <circle cx="${x}" cy="${y - 3}" r="4" fill="${language.color}"/>
    <text x="${x + 11}" y="${y}" class="language-name">${esc(language.name.length > 13 ? language.name.slice(0, 12) + '…' : language.name)}</text>
    <text x="${column === 0 ? 818 : 944}" y="${y}" class="language-percent" text-anchor="end">${language.percent}%</text>`;
});

const contributionLabel = `${fmt(xp)} contributions · last 12 months`;

// SVG document.
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1000" height="690" viewBox="0 0 1000 690" role="img" aria-labelledby="title desc">
  <title id="title">Byte — ${esc(login)}'s GitHub coding companion</title>
  <desc id="desc">A friendly animated robot with live GitHub contribution stats, streak, repository metrics, a 40-week contribution heatmap, and programming language breakdown.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10172A"/><stop offset=".52" stop-color="#0B1020"/><stop offset="1" stop-color="#111329"/></linearGradient>
    <linearGradient id="heroGlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#253B65" stop-opacity=".62"/><stop offset=".55" stop-color="#1D2849" stop-opacity=".34"/><stop offset="1" stop-color="#171E34" stop-opacity=".12"/></linearGradient>
    <linearGradient id="botBody" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="#D8F9FF"/><stop offset=".32" stop-color="#7DE5E6"/><stop offset=".72" stop-color="#55BFD0"/><stop offset="1" stop-color="#4A7EBD"/></linearGradient>
    <linearGradient id="botSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7E9BDF"/><stop offset="1" stop-color="#3A4B8A"/></linearGradient>
    <linearGradient id="visor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17223E"/><stop offset="1" stop-color="#0B1429"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#41D9CF"/><stop offset="1" stop-color="#8B7CFF"/></linearGradient>
    <radialGradient id="aura"><stop offset="0" stop-color="#41D9CF" stop-opacity=".24"/><stop offset=".65" stop-color="#8B7CFF" stop-opacity=".08"/><stop offset="1" stop-color="#8B7CFF" stop-opacity="0"/></radialGradient>
    <pattern id="microGrid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#A9B8E8" stroke-opacity=".055" stroke-width="1"/></pattern>
    <clipPath id="heroClip"><rect x="24" y="84" width="952" height="270" rx="23"/></clipPath>
    <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="11"/></filter>

    <!-- Corrected SVG glow filter: every tag is properly closed. -->
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <style>
    text{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .surface{fill:#111A2D;stroke:#263450;stroke-width:1}
    .eyebrow{font-size:10px;font-weight:800;letter-spacing:1.8px;fill:#7F91B5}
    .heading{font-size:18px;font-weight:750;fill:#F2F5FF}
    .muted{font-size:12px;fill:#91A0BF}
    .tiny-muted{font-size:10px;fill:#7D8BA8}
    .metric-label{font-size:10px;font-weight:800;letter-spacing:1.2px;fill:#8090AF}
    .metric-value{font-size:25px;font-weight:800;letter-spacing:-.7px;fill:#F5F7FF}
    .metric-foot{font-size:9px;fill:#8291AE}
    .micro-label{font-size:9px;font-weight:800;letter-spacing:1.5px;fill:#8493B2}
    .micro-value{font-size:10px;font-weight:750;fill:#DCE5FF}
    .language-name{font-size:10px;font-weight:650;fill:#CBD5EE}
    .language-percent{font-size:10px;font-weight:750;fill:#E8EEFF}
    .bot-float{animation:float 3.8s ease-in-out infinite}
    .bot-shadow{animation:shadow 3.8s ease-in-out infinite;transform-origin:50% 50%}
    .bot-blink{transform-origin:center;animation:blink 5.2s infinite}
    .orb{transform-origin:170px 222px;animation:orbit 14s linear infinite}
    .progress-fill{transform-origin:left;animation:fill 1.3s cubic-bezier(.2,.8,.2,1) both}
    .heat-cell{opacity:.96;animation:pop .35s ease-out both}
    .twinkle{animation:twinkle 2.6s ease-in-out infinite}
    .twinkle.delay{animation-delay:1.2s}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    @keyframes shadow{0%,100%{transform:scale(1);opacity:.38}50%{transform:scale(.8);opacity:.22}}
    @keyframes blink{0%,91%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}
    @keyframes orbit{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
    @keyframes pop{from{transform:scale(.65)}to{transform:scale(1)}}
    @keyframes twinkle{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.18)}}
    @media(prefers-reduced-motion:reduce){*{animation:none!important}.heat-cell{opacity:1}}
  </style>

  <rect width="1000" height="690" rx="27" fill="url(#bg)"/>
  <rect x="1" y="1" width="998" height="688" rx="26" fill="none" stroke="#2A3552" stroke-opacity=".8"/>
  <circle cx="940" cy="70" r="180" fill="#594DAB" opacity=".08"/>
  <circle cx="55" cy="660" r="170" fill="#20BDBB" opacity=".045"/>

  <!-- Header -->
  <g>
    <rect x="25" y="22" width="31" height="31" rx="10" fill="url(#accent)"/>
    <path d="M34 32L47 37.5L34 43V32Z" fill="#08162B"/>
    <text x="68" y="36" font-size="13" font-weight="800" fill="#F3F6FF">BYTE</text>
    <text x="68" y="49" class="mono" font-size="8" fill="#7485A8" letter-spacing="1">CODE COMPANION / 2.1</text>
    <text x="976" y="39" text-anchor="end" font-size="10" font-weight="700" fill="#8392B1">${esc(login)}</text>
    <rect x="838" y="48" width="138" height="21" rx="10.5" fill="#14263A" stroke="#275267"/>
    <circle cx="851" cy="58.5" r="3" fill="${statusColor}"/>
    <text x="861" y="62" font-size="8.5" font-weight="750" fill="#B5D9E4" letter-spacing=".7">LIVE GITHUB DATA</text>
  </g>

  <!-- Main hero -->
  <g clip-path="url(#heroClip)">
    <rect x="24" y="84" width="952" height="270" rx="23" fill="url(#heroGlow)" stroke="#2B3A5C"/>
    <rect x="24" y="84" width="952" height="270" fill="url(#microGrid)"/>
    <circle cx="171" cy="220" r="142" fill="url(#aura)"/>
    <circle cx="171" cy="220" r="105" fill="none" stroke="#6C8BB9" stroke-opacity=".17" stroke-dasharray="2 8"/>
    <ellipse cx="171" cy="303" rx="76" ry="12" fill="#030713" opacity=".75" filter="url(#softShadow)" class="bot-shadow"/>

    <!-- Orbiting satellites -->
    <g class="orb">
      <circle cx="171" cy="119" r="5" fill="#FFB86B" filter="url(#glow)"/>
      <circle cx="171" cy="119" r="10" fill="none" stroke="#FFB86B" stroke-opacity=".3"/>
    </g>
    <circle cx="75" cy="184" r="3" fill="#41D9CF" class="twinkle"/>
    <path d="M255 142l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#8B7CFF" class="twinkle delay"/>
    <path d="M82 270l2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5 5-2.5z" fill="#FFB86B" class="twinkle delay"/>

    <!-- Byte mascot -->
    <g class="bot-float">
      <path d="M171 151V134" stroke="#72D8E3" stroke-width="5" stroke-linecap="round"/>
      <circle cx="171" cy="129" r="9" fill="#FFBE78" stroke="#FFE0B4" stroke-width="2"/>
      <circle cx="168" cy="126" r="2.5" fill="#FFF7E8"/>

      <path d="M105 204Q81 195 81 218Q83 239 106 232" fill="url(#botSide)" stroke="#9CEBF0" stroke-opacity=".5" stroke-width="2"/>
      <path d="M237 204Q261 195 261 218Q259 239 236 232" fill="url(#botSide)" stroke="#9CEBF0" stroke-opacity=".5" stroke-width="2"/>
      <circle cx="92" cy="216" r="4" fill="#FFCB8C"/>
      <circle cx="250" cy="216" r="4" fill="#FFCB8C"/>

      <path d="M133 276Q130 295 145 297H160Q168 296 165 283Z" fill="#4666A5" stroke="#8BDCE6" stroke-width="2"/>
      <path d="M179 283Q176 296 186 297H202Q217 295 209 276Z" fill="#4666A5" stroke="#8BDCE6" stroke-width="2"/>
      <path d="M143 291h13M188 291h13" stroke="#B2F6F2" stroke-width="2" stroke-linecap="round" opacity=".8"/>

      <rect x="105" y="151" width="132" height="137" rx="39" fill="#263A68" opacity=".8" transform="translate(0 5)"/>
      <rect x="101" y="146" width="140" height="137" rx="39" fill="url(#botBody)" stroke="#C6FBFF" stroke-width="2"/>
      <path d="M119 163Q130 151 146 156" fill="none" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="5" stroke-linecap="round"/>
      <path d="M222 169Q237 194 232 221" fill="none" stroke="#386E9D" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>

      <rect x="117" y="181" width="108" height="69" rx="23" fill="url(#visor)" stroke="#27466D" stroke-width="2"/>
      <path d="M132 190Q171 177 207 190" fill="none" stroke="#8CC9E8" stroke-opacity=".28" stroke-width="2"/>

      ${sleepy
        ? '<path d="M142 214q8 8 16 0M184 214q8 8 16 0" fill="none" stroke="#68E9D9" stroke-width="4" stroke-linecap="round"/>'
        : '<g class="bot-blink"><ellipse cx="150" cy="211" rx="7" ry="10" fill="#5DEBDD" filter="url(#glow)"/><ellipse cx="192" cy="211" rx="7" ry="10" fill="#5DEBDD" filter="url(#glow)"/><circle cx="152" cy="207" r="2.3" fill="#FFFFFF"/><circle cx="194" cy="207" r="2.3" fill="#FFFFFF"/></g>'}

      <path d="M162 230Q171 237 180 230" fill="none" stroke="#8DEFE2" stroke-width="3" stroke-linecap="round"/>
      <circle cx="132" cy="231" r="4" fill="#F28FAE" opacity=".7"/>
      <circle cx="210" cy="231" r="4" fill="#F28FAE" opacity=".7"/>
      <rect x="153" y="260" width="34" height="13" rx="6.5" fill="#294B78" opacity=".72"/>
      <circle cx="163" cy="266.5" r="2" fill="#41D9CF"/>
      <circle cx="171" cy="266.5" r="2" fill="#8B7CFF"/>
      <circle cx="179" cy="266.5" r="2" fill="#FFB86B"/>
    </g>

    <!-- Hero copy -->
    <text x="320" y="128" class="eyebrow">YOUR LITTLE COMMIT COMPANION</text>
    <text x="318" y="181" font-size="47" font-weight="850" letter-spacing="-2" fill="#F4F6FF">Hey, I'm Byte<tspan fill="#41D9CF">.</tspan></text>
    <text x="322" y="208" font-size="13" fill="#A6B4D1">I grow with every line of code you ship.</text>
    <rect x="320" y="229" width="305" height="35" rx="12" fill="#111D31" stroke="#2B405D"/>
    <circle cx="337" cy="246.5" r="4" fill="${statusColor}"/>
    <text x="350" y="250" font-size="10.5" font-weight="650" fill="#D4E0F7">${esc(activityStatus)}</text>
    <text x="322" y="294" class="eyebrow">LEVEL ${level} / ${fmt(xp)} TOTAL XP</text>
    <rect x="322" y="305" width="302" height="7" rx="3.5" fill="#1D2A43"/>
    <rect x="322" y="305" width="${(302 * xpIntoLevel / 400).toFixed(1)}" height="7" rx="3.5" fill="url(#accent)"/>
    <text x="624" y="329" text-anchor="end" font-size="9" fill="#8192B4">${levelProgress}% to level ${level + 1}</text>

    <!-- Vitals -->
    <rect x="674" y="105" width="280" height="226" rx="19" fill="#0D1629" fill-opacity=".68" stroke="#2A3C5B"/>
    <text x="699" y="132" class="eyebrow">BYTE'S VITALS</text>
    <text x="929" y="132" text-anchor="end" font-size="9" fill="#7183A5">${esc(moodLine)}</text>
    ${statBars}
  </g>

  <!-- Metrics -->
  ${metricSvg}

  <!-- Contribution heatmap -->
  <g>
    <rect x="24" y="485" width="650" height="180" rx="19" class="surface"/>
    <text x="48" y="518" class="eyebrow">THE CONSISTENCY MAP</text>
    <text x="48" y="539" class="heading">${contributionLabel}</text>
    <text x="640" y="518" text-anchor="end" class="tiny-muted">LAST 40 WEEKS</text>
    <text x="34" y="563" font-size="8" fill="#71809D">S</text>
    <text x="34" y="589" font-size="8" fill="#71809D">T</text>
    <text x="34" y="616" font-size="8" fill="#71809D">T</text>
    ${heatCells}
    <path d="M548 545V640" stroke="#273550"/>
    <text x="568" y="565" class="eyebrow">BEST DAY</text>
    <text x="568" y="585" font-size="17" font-weight="800" fill="#EDF3FF">${esc(shortDate(bestDay.date))}</text>
    <text x="568" y="602" class="tiny-muted">${fmt(bestDay.contributionCount)} contributions</text>
    <text x="568" y="626" class="eyebrow">DAILY AVG.</text>
    <text x="568" y="645" font-size="15" font-weight="800" fill="#41D9CF">${dailyAverage}</text>
  </g>

  <!-- Languages -->
  <g>
    <rect x="690" y="485" width="286" height="180" rx="19" class="surface"/>
    <text x="714" y="518" class="eyebrow">YOUR TOOLKIT</text>
    <text x="714" y="539" class="heading">Top languages</text>
    <rect x="710" y="554" width="234" height="7" rx="3.5" fill="#202B43"/>
    ${(() => {
      let x = 710;

      return languages.map((language) => {
        const width = 234 * language.percent / 100;

        const part = `<rect x="${x.toFixed(1)}" y="554" width="${Math.max(0, width).toFixed(1)}" height="7" rx="3" fill="${language.color}"/>`;

        x += width;
        return part;
      }).join('');
    })()}
    ${languageBars}
  </g>

  <text x="26" y="681" font-size="8" fill="#667594" letter-spacing=".5">BYTE 2.1 · AUTO-UPDATED FROM GITHUB · KEEP BUILDING</text>
  <text x="974" y="681" text-anchor="end" font-size="8" fill="#667594">${esc(today)} UTC</text>
</svg>`;

fs.writeFileSync('code-pet.svg', svg, 'utf8');

console.log(
  `Generated Byte 2.1 for ${login}: ${fmt(xp)} contributions, ${streak}-day streak, ${repoCount} repositories.`
);


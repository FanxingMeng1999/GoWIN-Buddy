// Mirrors getLevelSnapshot/getXpRequirementForLevel/getLevelTitle in apps/rpg-hub/web/dashboard.html.
// Keep formulas identical so the pet badge agrees with the dashboard label.

const LEVEL_TITLES = [
  "科研萌新",
  "文献游侠",
  "数据工匠",
  "建模术士",
  "实验推进者",
  "返修指挥官",
  "论文领航员",
  "科研统帅",
];

function getXpRequirementForLevel(level) {
  return 80 + Math.max(0, level - 1) * 25;
}

function getLevelTitle(level) {
  const safeLevel = Math.max(1, Number(level) || 1);
  return LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, safeLevel - 1)];
}

function getLevelSnapshot(rawTotalXp) {
  const totalXp = Math.max(0, Math.floor(Number(rawTotalXp) || 0));
  let level = 1;
  let spent = 0;
  let needed = getXpRequirementForLevel(level);
  while (totalXp - spent >= needed) {
    spent += needed;
    level += 1;
    needed = getXpRequirementForLevel(level);
  }
  const currentXp = totalXp - spent;
  const percent = needed > 0 ? Math.max(0, Math.min(100, Math.round((currentXp / needed) * 100))) : 0;
  return {
    level,
    title: getLevelTitle(level),
    totalXp,
    currentXp,
    nextXp: needed,
    percent,
  };
}

module.exports = {
  getLevelSnapshot,
  getLevelTitle,
  getXpRequirementForLevel,
};

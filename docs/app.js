const screens = {
  activities: ['活动首页', '以固定品牌底牌建立识别，首屏聚焦活动发现与快速决策。'],
  detail: ['活动详情', '把集合时间、地点和路线指标放在决策路径最前面。'],
  trips: ['我的行程', '通过高对比集合信息与状态标签支持准时出发。'],
  profile: ['个人中心', '统一呈现骑行身份、数据资产、授权和设置入口。'],
};

const panels = [...document.querySelectorAll('[data-screen-panel]')];
const navButtons = [...document.querySelectorAll('[data-screen]')];
const sideButtons = [...document.querySelectorAll('.demo-nav-button')];
const tabButtons = [...document.querySelectorAll('.tab-button')];
const title = document.querySelector('#screen-title');
const copy = document.querySelector('#screen-copy');

function showScreen(name) {
  panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.screenPanel === name));
  sideButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.screen === name));
  tabButtons.forEach((button) => {
    const activeTab = name === 'detail' ? 'activities' : name;
    button.classList.toggle('is-active', button.dataset.screen === activeTab);
  });
  const [heading, description] = screens[name];
  title.textContent = heading;
  copy.textContent = description;
  window.history.replaceState(null, '', `#${name}`);
}

navButtons.forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.screen)));
document.querySelectorAll('[data-open-detail]').forEach((button) => button.addEventListener('click', () => showScreen('detail')));
document.querySelectorAll('[data-back-home]').forEach((button) => button.addEventListener('click', () => showScreen('activities')));

const requested = window.location.hash.slice(1);
if (screens[requested]) showScreen(requested);

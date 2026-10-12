const screens = {
  activities: ['活动首页', '与行程页共用票据层级，活动时间、地点与路线信息一眼看清。'],
  detail: ['活动详情', '一张完整票卡收拢照片、时间、地点、线路、报名人员与备注事项。'],
  trips: ['我的行程', '通过高对比集合信息与状态标签支持准时出发。'],
  profile: ['个人中心', '统一呈现骑行身份、数据资产、授权和设置入口。'],
};

const panels = [...document.querySelectorAll('[data-screen-panel]')];
const navButtons = [...document.querySelectorAll('[data-screen]')];
const sideButtons = [...document.querySelectorAll('.demo-nav-button')];
const tabButtons = [...document.querySelectorAll('.tab-button')];
const title = document.querySelector('#screen-title');
const copy = document.querySelector('#screen-copy');
const riderPreview = document.querySelector('[data-rider-preview]');
const riderName = document.querySelector('#rider-preview-name');
const toast = document.querySelector('[data-demo-toast]');
let toastTimer;

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
  riderPreview.hidden = true;
  window.history.replaceState(null, '', `#${name}`);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 1800);
}

navButtons.forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.screen)));
document
  .querySelectorAll('[data-open-detail]')
  .forEach((button) => button.addEventListener('click', () => showScreen('detail')));
document
  .querySelectorAll('[data-back-home]')
  .forEach((button) => button.addEventListener('click', () => showScreen('activities')));

document.querySelectorAll('[data-activity-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.activityFilter;
    document.querySelectorAll('[data-activity-filter]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-event-card]').forEach((card) => {
      card.hidden = card.dataset.eventCard !== filter;
    });
    document.querySelector('#activity-section-title').textContent =
      filter === 'future' ? '近期活动' : '历史活动';
    document.querySelector('#activity-count').textContent = filter === 'future' ? '1 / 2' : '2 / 2';
  });
});

document.querySelectorAll('[data-attendee]').forEach((button) => {
  button.addEventListener('click', () => {
    riderName.textContent = button.dataset.attendee;
    riderPreview.hidden = false;
  });
});

document.querySelector('[data-close-rider]').addEventListener('click', () => {
  riderPreview.hidden = true;
});

document.querySelector('[data-register]').addEventListener('click', (event) => {
  const button = event.currentTarget;
  if (button.dataset.registered === 'true') {
    showScreen('trips');
    return;
  }
  button.dataset.registered = 'true';
  button.textContent = '报名成功 · 查看行程';
  showToast('报名已提交，可在行程页查看进度');
});

document.querySelectorAll('[data-toast]').forEach((button) => {
  button.addEventListener('click', () => showToast(button.dataset.toast));
});

const requested = window.location.hash.slice(1);
if (screens[requested]) showScreen(requested);

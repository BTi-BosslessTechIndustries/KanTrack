/***********************
 * CLOCKS SYSTEM
 ***********************/
import * as state from './state.js';
import { timezones } from './timezones.js';

export function initializeDefaultClocks() {
  const defaultClocks = [
    { id: Date.now() + 1, type: 'timezone', name: 'Current Time', timezone: null, isCurrent: true },
    { id: Date.now() + 2, type: 'timezone', name: 'Europe', timezone: 'Europe/Paris' },
    { id: Date.now() + 3, type: 'timezone', name: 'China', timezone: 'Asia/Shanghai' },
    { id: Date.now() + 4, type: 'timezone', name: 'Americas', timezone: 'America/New_York' },
    { id: Date.now() + 5, type: 'timezone', name: 'Africa', timezone: 'Africa/Cairo' }
  ];
  state.setClocksData(defaultClocks);
  saveClocks();
}

export function loadClocks() {
  const saved = localStorage.getItem('kanbanClocks');
  if (saved) {
    state.setClocksData(JSON.parse(saved));
    // Reinitialize chronometer state for running chronometers
    state.clocksData.forEach(clock => {
      if (clock.type === 'chronometer' && clock.running) {
        clock.elapsed = Date.now() - clock.startTime;
      }
    });
  } else {
    initializeDefaultClocks();
  }
  renderClocks();
  // Start update interval
  setInterval(updateClocks, 1000);
}

export function saveClocks() {
  localStorage.setItem('kanbanClocks', JSON.stringify(state.clocksData));
}

export function renderClocks() {
  const container = document.getElementById('clockContainer');
  if (!container) return;

  container.innerHTML = '';
  state.clocksData.forEach(clock => {
    const clockEl = createClockElement(clock);
    container.appendChild(clockEl);
  });

  // Show/hide add button based on limit
  const addButton = document.querySelector('.clock-add-button');
  if (addButton) {
    if (state.clocksData.length >= 14) {
      addButton.style.display = 'none';
    } else {
      addButton.style.display = 'flex';
    }
  }
}

export function createClockElement(clock) {
  const clockEl = document.createElement('div');
  clockEl.classList.add('clock');
  clockEl.dataset.id = clock.id;
  clockEl.draggable = true;

  if (clock.isCurrent) {
    clockEl.classList.add('clock-current');
  }

  // Delete button (not for current time clock)
  if (!clock.isCurrent) {
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('clock-delete');
    deleteBtn.innerHTML = '&times;';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteClock(clock.id);
    };
    clockEl.appendChild(deleteBtn);
  }

  // Clock name
  const nameEl = document.createElement('div');
  nameEl.classList.add('clock-name');
  nameEl.textContent = clock.name;
  clockEl.appendChild(nameEl);

  if (clock.type === 'timezone') {
    // Time display
    const timeEl = document.createElement('div');
    timeEl.classList.add('clock-time');
    timeEl.id = `clock-time-${clock.id}`;
    clockEl.appendChild(timeEl);

    // Date display
    const dateEl = document.createElement('div');
    dateEl.classList.add('clock-date');
    dateEl.id = `clock-date-${clock.id}`;
    clockEl.appendChild(dateEl);

  } else if (clock.type === 'chronometer') {
    // Chronometer display
    const timeEl = document.createElement('div');
    timeEl.classList.add('clock-time');
    timeEl.id = `chronometer-display-${clock.id}`;
    timeEl.textContent = formatChronometer(clock.elapsed || 0);
    clockEl.appendChild(timeEl);

    // Chronometer controls
    const controlsEl = document.createElement('div');
    controlsEl.classList.add('chronometer-controls');

    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start';
    startBtn.classList.add('start-btn');
    startBtn.onclick = (e) => { e.stopPropagation(); startChronometer(clock.id); };

    const pauseBtn = document.createElement('button');
    pauseBtn.textContent = 'Pause';
    pauseBtn.classList.add('pause-btn');
    pauseBtn.onclick = (e) => { e.stopPropagation(); pauseChronometer(clock.id); };

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.classList.add('reset-btn');
    resetBtn.onclick = (e) => { e.stopPropagation(); resetChronometer(clock.id); };

    controlsEl.appendChild(startBtn);
    controlsEl.appendChild(pauseBtn);
    controlsEl.appendChild(resetBtn);
    clockEl.appendChild(controlsEl);

    // Start interval if running
    if (clock.running) {
      startChronometerInterval(clock.id);
    }
  }

  // Drag events
  clockEl.ondragstart = (e) => handleClockDragStart(e, clock);
  clockEl.ondragend = handleClockDragEnd;
  clockEl.ondragover = (e) => handleClockDragOver(e, clock);
  clockEl.ondrop = (e) => handleClockDrop(e, clock);

  // Initial time update for timezone clocks
  if (clock.type === 'timezone') {
    setTimeout(() => updateTimezoneClock(clock), 0);
  }

  return clockEl;
}

export function updateClocks() {
  state.clocksData.forEach(clock => {
    if (clock.type === 'timezone') {
      updateTimezoneClock(clock);
    }
  });
}

export function updateTimezoneClock(clock) {
  const timeEl = document.getElementById(`clock-time-${clock.id}`);
  const dateEl = document.getElementById(`clock-date-${clock.id}`);

  if (!timeEl || !dateEl) return;

  const timeOptions = { hour: '2-digit', minute: '2-digit' };
  const dateOptions = clock.isCurrent
    ? { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }
    : { weekday: 'long', day: '2-digit' };

  if (clock.timezone) {
    const time = new Date(new Date().toLocaleString('en-US', { timeZone: clock.timezone }));
    timeEl.textContent = time.toLocaleTimeString([], timeOptions);
    dateEl.textContent = time.toLocaleDateString([], dateOptions);
  } else {
    // Current time (no timezone conversion)
    const currentTime = new Date();
    timeEl.textContent = currentTime.toLocaleTimeString([], timeOptions);
    dateEl.textContent = currentTime.toLocaleDateString([], dateOptions);
  }
}

export function updateChronometerDisplay(clock) {
  const el = document.getElementById(`chronometer-display-${clock.id}`);
  if (!el) return;
  el.textContent = formatChronometer(clock.elapsed || 0);
}

export function handleClockDragStart(e, clock) {
  state.setDraggedClock(clock);
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}

export function handleClockDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  state.setDraggedClock(null);
  document.querySelectorAll('.clock').forEach(el => {
    el.classList.remove('drag-over');
  });
}

export function handleClockDragOver(e, clock) {
  e.preventDefault();
  if (!state.draggedClock || state.draggedClock.id === clock.id) return;
  e.currentTarget.classList.add('drag-over');
}

export function handleClockDrop(e, targetClock) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  if (!state.draggedClock || state.draggedClock.id === targetClock.id) return;

  // Reorder clocks
  const draggedIndex = state.clocksData.findIndex(c => c.id === state.draggedClock.id);
  const targetIndex = state.clocksData.findIndex(c => c.id === targetClock.id);

  const newClocks = [...state.clocksData];
  const [removed] = newClocks.splice(draggedIndex, 1);
  newClocks.splice(targetIndex, 0, removed);

  state.setClocksData(newClocks);
  saveClocks();
  renderClocks();
}

export function deleteClock(id) {
  if (state.chronometerIntervals[id]) {
    clearInterval(state.chronometerIntervals[id]);
    state.deleteChronometerInterval(id);
  }
  state.setClocksData(state.clocksData.filter(c => c.id !== id));
  saveClocks();
  renderClocks();
}

export function formatChronometer(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function startChronometer(id) {
  const clock = state.clocksData.find(c => c.id === id);
  if (!clock || clock.running) return;

  clock.running = true;
  clock.startTime = Date.now() - (clock.elapsed || 0);
  saveClocks();

  startChronometerInterval(id);
}

function startChronometerInterval(id) {
  if (state.chronometerIntervals[id]) {
    clearInterval(state.chronometerIntervals[id]);
  }

  const interval = setInterval(() => {
    const clock = state.clocksData.find(c => c.id === id);
    if (!clock || !clock.running) {
      clearInterval(state.chronometerIntervals[id]);
      state.deleteChronometerInterval(id);
      return;
    }

    clock.elapsed = Date.now() - clock.startTime;
    updateChronometerDisplay(clock);
  }, 100);

  state.setChronometerInterval(id, interval);
}

export function pauseChronometer(id) {
  const clock = state.clocksData.find(c => c.id === id);
  if (!clock || !clock.running) return;

  clock.running = false;
  clock.elapsed = Date.now() - clock.startTime;
  saveClocks();

  if (state.chronometerIntervals[id]) {
    clearInterval(state.chronometerIntervals[id]);
    state.deleteChronometerInterval(id);
  }
}

export function resetChronometer(id) {
  const clock = state.clocksData.find(c => c.id === id);
  if (!clock) return;

  clock.running = false;
  clock.elapsed = 0;
  clock.startTime = null;
  saveClocks();

  if (state.chronometerIntervals[id]) {
    clearInterval(state.chronometerIntervals[id]);
    state.deleteChronometerInterval(id);
  }

  updateChronometerDisplay(clock);
}

export function openAddClockModal() {
  const modal = document.getElementById('addClockModal');
  if (modal) {
    modal.style.display = 'block';
    // Reset selection
    selectClockType('timezone');
    const searchInput = document.getElementById('clockTimezoneSearch');
    if (searchInput) searchInput.value = '';
    filterTimezones();
  }
}

export function closeAddClockModal() {
  const modal = document.getElementById('addClockModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

export function selectClockType(type) {
  document.querySelectorAll('.clock-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });

  const timezoneForm = document.getElementById('timezoneClockForm');
  const chronometerForm = document.getElementById('chronometerForm');

  if (timezoneForm) timezoneForm.style.display = type === 'timezone' ? 'block' : 'none';
  if (chronometerForm) chronometerForm.style.display = type === 'chronometer' ? 'block' : 'none';
}

export function selectTimezone(timezone) {
  document.querySelectorAll('.timezone-item').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.timezone === timezone);
  });

  // Store in hidden input
  const hiddenInput = document.getElementById('clockTimezoneSelected');
  if (hiddenInput) hiddenInput.value = timezone;
}

export function filterTimezones() {
  const searchInput = document.getElementById('clockTimezoneSearch');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  const container = document.getElementById('timezoneList');
  if (!container) return;

  container.innerHTML = '';

  const filtered = timezones.filter(tz => tz.toLowerCase().includes(search));

  filtered.forEach(tz => {
    const opt = document.createElement('div');
    opt.classList.add('timezone-item');
    opt.dataset.timezone = tz;
    opt.textContent = tz.replace(/_/g, ' ');
    opt.onclick = () => selectTimezone(tz);
    container.appendChild(opt);
  });
}

export function addTimezoneClock() {
  const selected = document.querySelector('.timezone-item.selected');
  if (!selected) {
    alert('Please select a timezone');
    return;
  }

  const timezone = selected.dataset.timezone;
  const nameInput = document.getElementById('clockName');
  const customName = nameInput?.value.trim();
  const name = customName || timezone.split('/').pop().replace(/_/g, ' ');

  const newClock = {
    id: Date.now(),
    type: 'timezone',
    timezone: timezone,
    name: name
  };

  state.pushToClocksData(newClock);
  saveClocks();
  renderClocks();
  closeAddClockModal();

  if (nameInput) nameInput.value = '';
}

export function addChronometer() {
  const nameInput = document.getElementById('chronometerName');
  const name = nameInput?.value.trim() || 'Chronometer';

  const newClock = {
    id: Date.now(),
    type: 'chronometer',
    name: name,
    elapsed: 0,
    running: false,
    startTime: null
  };

  state.pushToClocksData(newClock);
  saveClocks();
  renderClocks();
  closeAddClockModal();

  if (nameInput) nameInput.value = '';
}

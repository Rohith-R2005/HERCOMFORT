/* ===========================================
   Smart Periods App — FULL BLE ENABLED VERSION
   =========================================== */

/* ---------- Helper ---------- */
function $(id) { return document.getElementById(id); }

/* ---------- Sakura petals ---------- */
function spawnPetal() {
  const petal = document.createElement("span");
  petal.className = "petal";
  petal.style.left = Math.random() * 100 + "vw";
  petal.style.animationDuration = 8 + Math.random() * 7 + "s";
  document.body.appendChild(petal);
  setTimeout(() => petal.remove(), 15000);
}
for (let i = 0; i < 12; i++) setTimeout(spawnPetal, i * 350);
setInterval(spawnPetal, 1400);

/* ---------- Global State ---------- */
const state = {
  pain: 4,
  cycleDay: 3,
  symptoms: new Set(["cramps"]),
  heat: 40,
  vibe: 30,
  autoTherapy: true,
  connected: false,
  sensors: { hr: 78, temp: 36.7, gsr: 0.32, emg: 12, motion: "Low" },
  battery: 86,
  logs: []
};

const calendarState = {
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  periodDates: []
};

let bleDevice = null;
let bleServer = null;
let bleService = null;

/* ---------- DOM References ---------- */
const painEl = $("pain");
const painVal = $("painVal");
const cycleDayEl = $("cycleDay");
const heatEl = $("heat");
const vibeEl = $("vibe");
const heatVal = $("heatVal");
const vibeVal = $("vibeVal");
const applyBtn = $("applyTherapy");
const batteryEl = $("battery");
const recEl = $("recommendation");
const logEl = $("log");
const historyEl = $("history");
const autoTherapyEl = $("autoTherapy");
const modeLabel = $("modeLabel");

const hrEl = $("hr");
const tempEl = $("temp");
const gsrEl = $("gsr");
const emgEl = $("emg");
const motionEl = $("motion");
const safetyEl = $("safety");

const connectBtn = $("connectWearable");

/* Calendar */
const calendarGrid = $("calendarGrid");
const calendarLabel = $("calendarLabel");
const prevMonthBtn = $("prevMonthBtn");
const nextMonthBtn = $("nextMonthBtn");

/* Prediction */
const np_last = $("np_last");
const np_avg = $("np_avg");
const np_next = $("np_next");

/* Manual Period Modal */
const manualModal = $("manualPeriodModal");
const manualInput = $("manualPeriodInput");
const addManualBtn = $("addPeriodManual");
const addTodayBtn = $("addTodayPeriod");
const saveManualBtn = $("saveManualPeriod");
const closeManualBtn = $("closePeriodModal");

/* Analysis Panel */
const analysisBtn = $("analysisBtn");
const analysisOverlay = $("analysisOverlay");
const closeAnalysis = $("closeAnalysis");

const avgCycleVal = $("avgCycleVal");
const lastPeriodVal = $("lastPeriodVal");
const nextPeriodVal = $("nextPeriodVal");
const totalPeriodsVal = $("totalPeriodsVal");
const avgPainVal = $("avgPainVal");
const currentModeVal = $("currentModeVal");
const periodList = $("periodList");

/* ---------- LocalStorage ---------- */
let savedState = JSON.parse(localStorage.getItem("periodApp_v1") || "null");
if (savedState) {
  Object.assign(state, savedState);
  state.symptoms = new Set(savedState.symptoms || []);
}
let savedCalendar = JSON.parse(localStorage.getItem("periodCalendar_v1") || "null");
if (savedCalendar) Object.assign(calendarState, savedCalendar);

function saveState() {
  localStorage.setItem("periodApp_v1", JSON.stringify({ ...state, symptoms: [...state.symptoms] }));
}
function saveCalendar() {
  localStorage.setItem("periodCalendar_v1", JSON.stringify(calendarState));
}

/* ---------- Logging ---------- */
function log(msg, level) {
  const t = new Date().toLocaleTimeString();
  state.logs.unshift({ t, msg, level });
  if (state.logs.length > 150) state.logs.pop();
  renderLog();
  saveState();
}
function renderLog() {
  logEl.innerHTML = state.logs
    .map(l => `<div class="small">[${l.t}] <span class="${l.level || ""}">${l.msg}</span></div>`)
    .join("");
}

/* ---------- BLE Connection ---------- */
async function connectBLE() {
  try {
    log("Requesting BLE Device...");
    connectBtn.textContent = "Connecting...";
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: "SmartPeriodsBand" }],
      optionalServices: ["1234"]
    });

    bleServer = await bleDevice.gatt.connect();
    bleService = await bleServer.getPrimaryService("1234");

    log("Connected to ESP32 ✓");
    state.connected = true;
    connectBtn.textContent = "Disconnect";

    /* Subscribe to ALL sensor characteristics */
    subscribeBLE("2A37", v => {
      state.sensors.hr = v.getUint8(0);
      updateSensorsUI();
    });

    subscribeBLE("ABC1", v => {
      state.sensors.temp = v.getFloat32(0, true);
      updateSensorsUI();
    });

    subscribeBLE("ABC2", v => {
      state.sensors.gsr = v.getFloat32(0, true);
      updateSensorsUI();
    });

    subscribeBLE("ABC3", v => {
      state.sensors.emg = v.getUint16(0, true);
      updateSensorsUI();
    });

    subscribeBLE("ABC4", v => {
      state.sensors.motion = new TextDecoder().decode(v);
      updateSensorsUI();
    });

    subscribeBLE("2A19", v => {
      state.battery = v.getUint8(0);
      updateSensorsUI();
    });

    /* CONTROL: Send heat + vibration */
    const heatChar = await bleService.getCharacteristic("C001");
    const vibeChar = await bleService.getCharacteristic("C002");

    heatEl.addEventListener("input", () => heatChar.writeValue(Uint8Array.of(state.heat)));
    vibeEl.addEventListener("input", () => vibeChar.writeValue(Uint8Array.of(state.vibe)));

  } catch (err) {
    log("BLE Error: " + err, "danger");
    connectBtn.textContent = "Connect Wearable";
  }
}

async function subscribeBLE(uuid, callback) {
  const char = await bleService.getCharacteristic(uuid);
  await char.startNotifications();
  char.addEventListener("characteristicvaluechanged", e => callback(e.target.value));
}

/* Disconnect */
function disconnectBLE() {
  if (bleDevice && bleDevice.gatt.connected) {
    bleDevice.gatt.disconnect();
    log("ESP32 Disconnected");
    connectBtn.textContent = "Connect Wearable";
    state.connected = false;
  }
}

/* Button */
connectBtn.addEventListener("click", () => {
  if (!state.connected) connectBLE();
  else disconnectBLE();
});

/* ---------- Sensors UI ---------- */
function updateSensorsUI() {
  hrEl.textContent = state.sensors.hr;
  tempEl.textContent = state.sensors.temp;
  gsrEl.textContent = state.sensors.gsr;
  emgEl.textContent = state.sensors.emg;
  motionEl.textContent = state.sensors.motion;
  batteryEl.textContent = state.battery + "%";
}

/* ---------- Therapy Logic ---------- */
function applyTherapy(manual) {
  if (safetyEl.textContent !== "OK") {
    log("Blocked: Unsafe to apply therapy", "danger");
    return;
  }

  log(`${manual ? "Manual" : "Auto"} therapy: Heat ${state.heat}% | Vibe ${state.vibe}%`);

  state.pain = Math.max(0, Math.round(
    state.pain - (state.heat / 100) * 0.6 - (state.vibe / 100) * 0.4
  ));
  painEl.value = state.pain;
  painVal.textContent = state.pain;

  saveState();
}

applyBtn.addEventListener("click", () => applyTherapy(true));

/* Auto–Manual Toggle */
autoTherapyEl.addEventListener("change", () => {
  state.autoTherapy = autoTherapyEl.checked;
  modeLabel.textContent = state.autoTherapy ? "Auto" : "Manual";
  heatEl.disabled = state.autoTherapy;
  vibeEl.disabled = state.autoTherapy;
  saveState();
});

/* ---------- AI Recommendation ---------- */
function updateRecommendation() {
  const p = state.pain;
  const s = state.sensors;

  let rec = [];

  if (p >= 7) rec.push("Strong heat (60-80%) + Vibration 40-70%");
  else if (p >= 4) rec.push("Moderate heat (40-60%) + Vibration 20-40%");
  else rec.push("Light heat");

  if (s.gsr > 0.6) rec.push("High stress → Relaxation mode");
  if (s.hr > 100) rec.push("High HR → Reduce intensity");
  if (s.temp > 38) rec.push("High temp → Pause therapy");

  recEl.textContent = rec.join(". ");

  /* Auto apply if allowed */
  if (state.autoTherapy) {
    const heat = rec[0].match(/(\d+)-/)?.[1] ?? 40;
    const vibe = rec[0].match(/Vibration (\d+)/)?.[1] ?? 30;

    state.heat = Number(heat);
    state.vibe = Number(vibe);

    heatEl.value = state.heat;
    vibeEl.value = state.vibe;
    heatVal.textContent = state.heat;
    vibeVal.textContent = state.vibe;

    applyTherapy(false);
  }
}

/* ---------- Safety checks ---------- */
function runSafetyChecks() {
  if (state.sensors.temp > 39) {
    safetyEl.textContent = "Overheat";
    safetyEl.className = "big-number danger";
    return;
  }
  if (state.heat > 85) {
    safetyEl.textContent = "Hot!";
    safetyEl.className = "big-number danger";
    return;
  }
  if (state.vibe > 90) {
    safetyEl.textContent = "High Vibe";
    safetyEl.className = "big-number danger";
    return;
  }
  safetyEl.textContent = "OK";
  safetyEl.className = "big-number success";
}

/* ---------- Period Calendar ---------- */
function renderCalendar() {
  const m = calendarState.month;
  const y = calendarState.year;

  const monthNames = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec"
  ];
  calendarLabel.textContent = `${monthNames[m]} ${y}`;

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  calendarGrid.innerHTML = "";

  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  dayLabels.forEach(d => {
    const div = document.createElement("div");
    div.className = "day-name";
    div.textContent = d;
    calendarGrid.appendChild(div);
  });

  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement("div");
    e.className = "day-cell empty";
    calendarGrid.appendChild(e);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const iso = date.toISOString().slice(0, 10);

    const cell = document.createElement("div");
    cell.className = "day-cell";
    cell.textContent = d;

    if (calendarState.periodDates.includes(iso))
      cell.classList.add("period-day");

    if (iso === new Date().toISOString().slice(0, 10))
      cell.classList.add("today");

    cell.onclick = () => {
      const idx = calendarState.periodDates.indexOf(iso);
      if (idx === -1) {
        calendarState.periodDates.push(iso);
        log("Marked: " + iso);
      } else {
        calendarState.periodDates.splice(idx, 1);
        log("Removed: " + iso);
      }
      calendarState.periodDates.sort();
      saveCalendar();
      renderCalendar();
      updateNextPeriodPrediction();
    };

    calendarGrid.appendChild(cell);
  }
}

prevMonthBtn.onclick = () => {
  calendarState.month--;
  if (calendarState.month < 0) {
    calendarState.month = 11;
    calendarState.year--;
  }
  saveCalendar();
  renderCalendar();
};
nextMonthBtn.onclick = () => {
  calendarState.month++;
  if (calendarState.month > 11) {
    calendarState.month = 0;
    calendarState.year++;
  }
  saveCalendar();
  renderCalendar();
};

/* ---------- Next Period Prediction ---------- */
function updateNextPeriodPrediction() {
  const dates = [...calendarState.periodDates].sort();

  if (!dates.length) {
    np_last.textContent = "--";
    np_avg.textContent = "--";
    np_next.textContent = "--";
    return;
  }

  np_last.textContent = dates[dates.length - 1];

  let cycles = [];
  for (let i = 1; i < dates.length; i++) {
    const diff =
      (new Date(dates[i]) - new Date(dates[i - 1])) /
      (1000 * 60 * 60 * 24);
    if (diff > 10 && diff < 60) cycles.push(diff);
  }

  if (!cycles.length) {
    np_avg.textContent = "--";
    np_next.textContent = "--";
    return;
  }

  const avg = Math.round(
    cycles.reduce((a, b) => a + b, 0) / cycles.length
  );
  np_avg.textContent = avg + " days";

  const next = new Date(dates[dates.length - 1]);
  next.setDate(next.getDate() + avg);
  np_next.textContent = next.toISOString().slice(0, 10);
}

/* ---------- Manual Period Modal ---------- */
addManualBtn.onclick = () => manualModal.classList.add("open");
closeManualBtn.onclick = () => manualModal.classList.remove("open");

saveManualBtn.onclick = () => {
  const date = manualInput.value;
  if (!date) return alert("Select a date");

  if (!calendarState.periodDates.includes(date)) {
    calendarState.periodDates.push(date);
    calendarState.periodDates.sort();
    saveCalendar();
  }
  manualModal.classList.remove("open");
  renderCalendar();
  updateNextPeriodPrediction();
};

addTodayBtn.onclick = () => {
  const t = new Date().toISOString().slice(0, 10);
  if (!calendarState.periodDates.includes(t)) {
    calendarState.periodDates.push(t);
    saveCalendar();
  }
  renderCalendar();
  updateNextPeriodPrediction();
};

/* ---------- Analysis Panel ---------- */
analysisBtn.onclick = () => {
  populateAnalysis();
  analysisOverlay.classList.remove("hidden");
};
closeAnalysis.onclick = () => analysisOverlay.classList.add("hidden");

function populateAnalysis() {
  const dates = [...calendarState.periodDates].sort();

  totalPeriodsVal.textContent = dates.length;
  lastPeriodVal.textContent = dates[dates.length - 1] || "--";

  let cycles = [];
  for (let i = 1; i < dates.length; i++) {
    const diff =
      (new Date(dates[i]) - new Date(dates[i - 1])) /
      (1000 * 60 * 60 * 24);

    if (diff > 10 && diff < 60) cycles.push(diff);
  }

  avgCycleVal.textContent = cycles.length
    ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) + " days"
    : "--";

  if (cycles.length) {
    const next = new Date(dates[dates.length - 1]);
    next.setDate(next.getDate() + Math.round(
      cycles.reduce((a, b) => a + b, 0) / cycles.length
    ));
    nextPeriodVal.textContent = next.toISOString().slice(0, 10);
  } else {
    nextPeriodVal.textContent = "--";
  }

  const hist = JSON.parse(localStorage.getItem("periodHistory_v1") || "[]");
  avgPainVal.textContent = hist.length
    ? (hist.reduce((a, b) => a + b.pain, 0) / hist.length).toFixed(1)
    : "--";

  currentModeVal.textContent = state.autoTherapy ? "Auto" : "Manual";

  periodList.innerHTML = dates
    .reverse()
    .map(d => `<div>• ${d}</div>`)
    .join("");
}

/* ---------- Init ---------- */
function init() {
  painEl.value = state.pain;
  painVal.textContent = state.pain;
  cycleDayEl.value = state.cycleDay;

  heatEl.value = state.heat;
  vibeEl.value = state.vibe;
  heatVal.textContent = state.heat;
  vibeVal.textContent = state.vibe;

  heatEl.disabled = state.autoTherapy;
  vibeEl.disabled = state.autoTherapy;

  modeLabel.textContent = state.autoTherapy ? "Auto" : "Manual";

  renderLog();
  renderCalendar();
  updateNextPeriodPrediction();
  updateSensorsUI();
}

init();